// Auto-renewing plans, through Razorpay Subscriptions (cards, UPI Autopay, e-mandates; rupees only).
//
//   GET  /api/pay/subscription                  is auto-renew offered, and the account's subscription if any
//   POST /api/pay/subscribe                     { product: "plan:watch:monthly" } makes a Razorpay subscription for
//                                               that plan (the plan is made once and remembered); the browser
//                                               opens Checkout with its id, which takes the first payment and
//                                               sets up the mandate
//   POST /api/pay/razorpay/subscription/confirm Checkout's payment id and signature (HMAC-SHA256 of
//                                               "payment_id|subscription_id" with the key secret) are checked, then
//                                               Razorpay is asked about the payment itself
//   POST /api/pay/subscription/cancel           turns auto-renew off at Razorpay at once; the plan runs to the
//                                               end of what's been paid
//
// Every charge (the first and each renewal, from Checkout or from the "subscription.charged" webhook) is credited
// once: it gets its own row in `payments` keyed by Razorpay's payment id, and the wallet's "pay:<id>" claim.
// A charge extends the plan from where its term ended (economy.ts grantRenewal), and at the end of a term the plan
// waits up to 7 days for the renewal instead of lapsing. Razorpay's plans repeat every 30 days (daily, interval
// 30) and every 360 days for yearly ones, the same lengths as NilObs plans, so charges and refills stay in step.
//
// If Subscriptions isn't switched on for the Razorpay account, Razorpay answers its plan API with 400 "The
// requested URL was not found on the server". That is remembered for 12 hours (app_keys "rzp_subs") and the app
// only offers paying once. Account deletion cancels any subscription first.
import * as E from "../app/src/economy.ts"
import { reply } from "./guard.js"
import { HttpError, checkoutModes, mutate, readWallet, view } from "./wallet.js"
import { hmacHex, same } from "./pay.js"

const API = "https://api.razorpay.com/v1"
const auth = (env) => "Basic " + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)
const rz = async (env, fetchImpl, path, init = {}) => {
  const res = await fetchImpl(`${API}${path}`, { ...init, headers: { authorization: auth(env), "content-type": "application/json", ...(init.headers || {}) } })
  const body = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, body }
}
const mode = (env) => (String(env.RAZORPAY_KEY_ID || "").startsWith("rzp_live_") ? "live" : "test")

/** Statuses in which Razorpay will still charge (or is retrying a charge). */
export const SUB_ON = ["authenticated", "active", "pending"]
const FINAL = ["cancelled", "completed", "expired"]
/** How many charges a subscription allows: about five years. */
const CYCLES = { monthly: 60, annual: 5 }
const PROBE_MS = 12 * 3600000

let ready = null
export function ensureSubsSchema(db) {
  ready ??= db
    .batch([
      db.prepare("CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL, product TEXT NOT NULL, currency TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL, paid_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, charged_at INTEGER, ended_at INTEGER)"),
      db.prepare("CREATE INDEX IF NOT EXISTS subscriptions_user ON subscriptions (user_id)"),
      db.prepare("CREATE TABLE IF NOT EXISTS app_keys (k TEXT PRIMARY KEY, v TEXT NOT NULL)"),
    ])
    .catch((e) => {
      ready = null
      throw e
    })
  return ready
}
export const resetSubsSchemaFlag = () => (ready = null)

const getKey = async (db, k) => (await db.prepare("SELECT v FROM app_keys WHERE k = ?").bind(k).first())?.v ?? null
const setKey = (db, k, v) => db.prepare("INSERT INTO app_keys (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v").bind(k, String(v)).run()

/** "razorpay", "simulated" or null: whether auto-renew can be offered now. Asks Razorpay at most every 12 hours. */
export async function subsMode(env, fetchImpl = fetch) {
  const m = checkoutModes(env).INR
  if (m === "simulated") return "simulated"
  if (m !== "razorpay" || env.RAZORPAY_SUBSCRIPTIONS === "0") return null
  const key = `rzp_subs:${mode(env)}`
  const known = JSON.parse((await getKey(env.DB, key)) || "null")
  if (known && Date.now() - known.at < PROBE_MS) return known.ok ? "razorpay" : null
  const r = await rz(env, fetchImpl, "/plans?count=1").catch(() => null)
  if (!r) return known?.ok ? "razorpay" : null // Razorpay unreachable: keep the last answer
  const ok = r.ok
  if (!ok) console.error("razorpay subscriptions probe", r.status, r.body?.error?.description)
  await setKey(env.DB, key, JSON.stringify({ ok, at: Date.now() }))
  return ok ? "razorpay" : null
}
const subsOff = (env) => setKey(env.DB, `rzp_subs:${mode(env)}`, JSON.stringify({ ok: false, at: Date.now() }))

/** The Razorpay plan for a NilObs plan, made once (per key mode and price) and remembered. */
async function razorpayPlan(env, fetchImpl, p) {
  const amount = Math.round(p.price.INR * 100)
  const k = `rzp_plan:${mode(env)}:${p.planId}:${p.cycle}:${amount}`
  const known = await getKey(env.DB, k)
  if (known) return known
  const days = p.cycle === "annual" ? E.YEAR_CYCLES * E.CYCLE_DAYS : E.CYCLE_DAYS
  const item = { name: `NilObs ${p.name.split(",")[0]}`, amount, currency: "INR", description: `${p.credits} credits every 30 days. Renews every ${days} days until cancelled.` }
  let r = await rz(env, fetchImpl, "/plans", { method: "POST", body: JSON.stringify({ period: "daily", interval: days, item, notes: { product: p.key } }) })
  if (!r.ok && r.status === 400 && p.cycle === "annual" && !/not found/i.test(r.body?.error?.description || ""))
    r = await rz(env, fetchImpl, "/plans", { method: "POST", body: JSON.stringify({ period: "yearly", interval: 1, item, notes: { product: p.key } }) })
  if (!r.ok || !r.body?.id) {
    console.error("razorpay plan", r.status, r.body?.error?.description)
    if (r.status === 400 && /not found/i.test(r.body?.error?.description || "")) {
      await subsOff(env)
      throw new HttpError(503, "Auto-renew isn't available yet. You can pay once instead.", "subscriptions_off")
    }
    throw new HttpError(502, "Couldn't start auto-renew. Try again, or pay once.", "provider_error")
  }
  await setKey(env.DB, k, r.body.id)
  return r.body.id
}

const subRow = (env, where, ...args) => env.DB.prepare(`SELECT * FROM subscriptions WHERE ${where}`).bind(...args).first()
/** The account's subscription that's on (or the latest one), as the app shows it. */
async function current(env, userId) {
  const on = await env.DB.prepare(`SELECT * FROM subscriptions WHERE user_id = ? AND status IN (${SUB_ON.map(() => "?").join(",")}) ORDER BY created_at DESC LIMIT 1`).bind(userId, ...SUB_ON).first()
  return on || (await env.DB.prepare("SELECT * FROM subscriptions WHERE user_id = ? AND status != 'created' ORDER BY updated_at DESC LIMIT 1").bind(userId).first())
}
const shown = (r) =>
  r ? { id: r.id, product: r.product, status: r.status, on: SUB_ON.includes(r.status), amount: r.amount / 100, currency: r.currency, paidCount: r.paid_count, since: r.created_at, chargedAt: r.charged_at, endedAt: r.ended_at } : null

async function setStatus(env, row, status, now = Date.now()) {
  if (!status || status === row.status || FINAL.includes(row.status)) return
  const ended = FINAL.includes(status) || status === "halted"
  await env.DB.prepare("UPDATE subscriptions SET status = ?, updated_at = ?, ended_at = COALESCE(ended_at, ?) WHERE id = ?").bind(status, now, ended ? now : null, row.id).run()
  // no more charges coming: the plan runs to the end of what's paid instead of waiting for one
  if (ended) await mutate(env, row.user_id, (d, t) => void (d.w = E.stopRenewing(d.w, t)))
}

/**
 * Credit one captured charge of a subscription, once. Returns "paid", "mismatch" or "ignored" (not captured, or
 * not the plan's amount, e.g. a small card check before the first charge).
 */
export async function chargeSub(env, row, payment) {
  if (!payment?.id || payment.status !== "captured") return "ignored"
  if (Number(payment.amount) !== Number(row.amount) || String(payment.currency || "").toUpperCase() !== row.currency) {
    if (Number(payment.amount) < Number(row.amount)) return "ignored"
    console.error("subscription charge mismatch", row.id, payment.id, payment.amount, payment.currency)
    return "mismatch"
  }
  const id = "rs_" + String(payment.id).replace(/^pay_/, "").slice(0, 40)
  const now = Date.now()
  await env.DB.prepare("INSERT OR IGNORE INTO payments (id, user_id, provider, ref, product, currency, amount, status, created_at) VALUES (?, ?, 'razorpay', ?, ?, ?, ?, 'created', ?)")
    .bind(id, row.user_id, String(payment.id), row.product, row.currency, row.amount, now).run()
  const pay = await env.DB.prepare("SELECT * FROM payments WHERE id = ?").bind(id).first()
  if (!pay || pay.status === "paid") return "paid"
  const { result } = await mutate(env, row.user_id, (d, t) => {
    const claim = `pay:${id}`
    if (d.claims.includes(claim)) return { already: true }
    const paidWith = `${E.fmtPrice(row.amount / 100, row.currency)} via Razorpay (auto-renew)`
    const r = E.grantRenewal(d.w, row.product, row.currency, t, paidWith)
    if (r.ok) d.w = r.state
    else {
      // paid, but the plan can't be applied now: keep the value as credits that don't expire
      const p = E.product(row.product)
      d.w = E.earn(d.w, p?.credits || 0, `${p?.name || "Plan"} (${paidWith}): added as credits`, t)
      const b = d.w.buckets[d.w.buckets.length - 1]
      if (b) b.expires = null
    }
    d.claims = [...d.claims, claim]
    return { already: false }
  })
  await env.DB.batch([
    env.DB.prepare("UPDATE payments SET status = 'paid', paid_at = ?, payment_ref = ? WHERE id = ? AND status != 'paid'").bind(now, String(payment.id), id),
    ...(result.already ? [] : [env.DB.prepare("UPDATE subscriptions SET paid_count = paid_count + 1, charged_at = ?, updated_at = ?, status = CASE WHEN status IN ('created', 'authenticated', 'pending', 'halted') THEN 'active' ELSE status END WHERE id = ?").bind(now, now, row.id)]),
  ])
  return "paid"
}

/** After Checkout: the payment it handed back, or (closed, reloaded) whatever Razorpay has for the subscription. */
async function settleSub(env, fetchImpl, row, paymentId) {
  if (paymentId) {
    const r = await rz(env, fetchImpl, `/payments/${encodeURIComponent(paymentId)}`)
    if (!r.ok || !r.body) throw new HttpError(502, "Couldn't reach Razorpay. Your payment is safe; refresh in a minute.", "provider_error")
    const out = await chargeSub(env, row, r.body)
    if (out !== "ignored") return out
    if (r.body.status === "failed") return "failed"
  }
  const s = await rz(env, fetchImpl, `/subscriptions/${encodeURIComponent(row.id)}`)
  if (!s.ok || !s.body) throw new HttpError(502, "Couldn't reach Razorpay. Your payment is safe; refresh in a minute.", "provider_error")
  if (s.body.status && s.body.status !== "created") await setStatus(env, row, s.body.status)
  if (!["authenticated", "active"].includes(s.body.status)) return "pending"
  // the first charge: its invoice says which payment paid it
  const inv = await rz(env, fetchImpl, `/invoices?subscription_id=${encodeURIComponent(row.id)}`)
  const paid = (Array.isArray(inv.body?.items) ? inv.body.items : []).filter((i) => i.status === "paid" && i.payment_id)
  let state = "pending"
  for (const i of paid.slice(0, 3)) {
    const p = await rz(env, fetchImpl, `/payments/${encodeURIComponent(i.payment_id)}`)
    if (p.ok && (await chargeSub(env, row, p.body)) === "paid") state = "paid"
  }
  return state
}

/** Stop charging: at Razorpay first, then here. A subscription Razorpay already ended is just marked. */
async function cancelAt(env, fetchImpl, row) {
  if (row.provider === "razorpay") {
    const r = await rz(env, fetchImpl, `/subscriptions/${encodeURIComponent(row.id)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: false }) })
    if (!r.ok) {
      const s = await rz(env, fetchImpl, `/subscriptions/${encodeURIComponent(row.id)}`)
      if (!(s.ok && (FINAL.includes(s.body?.status) || s.body?.status === "created"))) {
        console.error("razorpay cancel", row.id, r.status, r.body?.error?.description)
        throw new HttpError(502, "Couldn't reach Razorpay to turn auto-renew off. Try again in a minute.", "provider_error")
      }
    }
  }
  await setStatus(env, row, "cancelled")
}

/** Account deletion: no charges after the account is gone. Best effort for each subscription that's on. */
export async function cancelSubsOf(env, userId, fetchImpl = fetch) {
  await ensureSubsSchema(env.DB)
  const rows = (await env.DB.prepare(`SELECT * FROM subscriptions WHERE user_id = ? AND status IN ('created', ${SUB_ON.map(() => "?").join(",")})`).bind(userId, ...SUB_ON).all()).results || []
  for (const row of rows) {
    try {
      await cancelAt(env, fetchImpl, row)
    } catch (e) {
      console.error("cancel on delete", row.id, String(e?.message || e))
    }
  }
}

/* ---------------- routes (called from pay.js) ---------------- */
export async function handleSubs(path, request, env, user, body, fetchImpl) {
  await ensureSubsSchema(env.DB)
  if (path === "/api/pay/subscription" && request.method === "GET") {
    return reply(200, { available: await subsMode(env, fetchImpl), sub: shown(await current(env, user.id)) })
  }
  if (path === "/api/pay/subscribe") {
    const key = String(body?.product || "")
    const p = E.product(key)
    if (!p || p.kind !== "plan") return reply(400, { error: "Only plans can renew automatically", code: "bad_product" })
    const via = await subsMode(env, fetchImpl)
    if (!via) return reply(503, { error: "Auto-renew isn't available yet. You can pay once instead.", code: "subscriptions_off" })
    const on = await current(env, user.id)
    if (on && SUB_ON.includes(on.status))
      return reply(409, { error: `Auto-renew is already on for ${E.product(on.product)?.name || "a plan"}. Turn it off in Plans & credits first.`, code: "already_on" })
    const { data } = await readWallet(env, user.id)
    const can = E.canBuy(data.w, key, Date.now())
    if (!can.ok) return reply(409, { error: can.why, code: "cannot_buy" })
    const amount = Math.round(p.price.INR * 100)
    const now = Date.now()
    if (via === "simulated") {
      const id = "sim_sub_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      await env.DB.prepare("INSERT INTO subscriptions (id, user_id, provider, product, currency, amount, status, created_at, updated_at) VALUES (?, ?, 'simulated', ?, 'INR', ?, 'authenticated', ?, ?)").bind(id, user.id, key, amount, now, now).run()
      await chargeSub(env, { id, user_id: user.id, product: key, currency: "INR", amount }, { id: "pay_sim" + id.slice(8), status: "captured", amount, currency: "INR" })
      const w = await readWallet(env, user.id)
      return reply(200, { provider: "simulated", sub: shown(await subRow(env, "id = ?", id)), ...view(env, w.data, w.version) })
    }
    const planId = await razorpayPlan(env, fetchImpl, p)
    const r = await rz(env, fetchImpl, "/subscriptions", {
      method: "POST",
      body: JSON.stringify({ plan_id: planId, total_count: CYCLES[p.cycle], quantity: 1, customer_notify: true, notes: { user: user.id, product: key } }),
    })
    if (!r.ok || !r.body?.id) {
      console.error("razorpay subscription", r.status, r.body?.error?.description)
      return reply(502, { error: "Couldn't start auto-renew. Try again, or pay once.", code: "provider_error" })
    }
    await env.DB.prepare("INSERT INTO subscriptions (id, user_id, provider, product, currency, amount, status, created_at, updated_at) VALUES (?, ?, 'razorpay', ?, 'INR', ?, 'created', ?, ?)").bind(r.body.id, user.id, key, amount, now, now).run()
    return reply(200, {
      provider: "razorpay",
      subscriptionId: r.body.id,
      keyId: env.RAZORPAY_KEY_ID,
      amount,
      currency: "INR",
      description: `${p.name.split(",")[0]}, ${E.fmtPrice(p.price.INR, "INR")} every ${p.cycle === "annual" ? "year" : "30 days"}`,
      prefill: { name: String(user.name || "").slice(0, 100), email: String(user.email || "").slice(0, 100) },
      mode: mode(env),
    })
  }
  if (path === "/api/pay/razorpay/subscription/confirm") {
    const row = await subRow(env, "id = ? AND user_id = ? AND provider = 'razorpay'", String(body?.subscriptionId || ""), user.id)
    if (!row) return reply(404, { error: "No such subscription", code: "no_order" })
    const paymentId = String(body?.paymentId || "")
    if (paymentId) {
      // Checkout's signature proves the payment id came from Razorpay for this subscription
      if (!same(body?.signature, await hmacHex(env.RAZORPAY_KEY_SECRET, `${paymentId}|${row.id}`))) return reply(400, { error: "That payment couldn't be verified.", code: "bad_signature" })
    }
    const state = row.paid_count > 0 ? "paid" : await settleSub(env, fetchImpl, row, paymentId)
    if (state === "mismatch") return reply(409, { error: "That payment didn't match the plan. Email us and we'll sort it out.", code: "amount_mismatch" })
    if (state !== "paid") return reply(200, { status: state })
    const w = await readWallet(env, user.id)
    return reply(200, { status: "paid", sub: shown(await subRow(env, "id = ?", row.id)), ...view(env, w.data, w.version) })
  }
  if (path === "/api/pay/subscription/cancel") {
    const row = await current(env, user.id)
    if (!row || !SUB_ON.includes(row.status)) return reply(200, { sub: shown(row) })
    await cancelAt(env, fetchImpl, row)
    const w = await readWallet(env, user.id)
    return reply(200, { sub: shown(await subRow(env, "id = ?", row.id)), ...view(env, w.data, w.version) })
  }
  return null
}

/** Razorpay's subscription.* notifications (already signature-checked by pay.js). */
export async function subscriptionEvent(env, ev) {
  const sub = ev?.payload?.subscription?.entity
  if (!sub?.id) return
  await ensureSubsSchema(env.DB)
  const row = await subRow(env, "id = ? AND provider = 'razorpay'", String(sub.id))
  if (!row) return
  if (ev.event === "subscription.charged") {
    const out = await chargeSub(env, row, ev?.payload?.payment?.entity)
    if (out === "mismatch") return
  }
  const fresh = (await subRow(env, "id = ?", row.id)) || row
  // a late "authenticated" or "pending" never undoes an "active" that a charge has already set
  if (fresh.status === "active" && ["authenticated", "created"].includes(sub.status)) return
  await setStatus(env, fresh, String(sub.status || ""))
}
