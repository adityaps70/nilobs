// Real payments, through Cashfree Payments. Prices come only from app/src/economy.ts (never from the
// browser), and credits are added only once Cashfree says the order is paid:
//
//   POST /api/pay/order            creates a Cashfree order at the server's price; the browser opens
//                                  Cashfree's checkout with the order's payment session.
//   POST /api/pay/cashfree/confirm asks Cashfree (Get Order, with our secret) whether the order is PAID.
//   POST /api/pay/cashfree/webhook Cashfree's own notification (signed: base64 HMAC-SHA256 of
//                                  timestamp + raw body with the secret key), which covers a closed tab.
//
// Each payment is credited once: a "pay:<id>" claim in the wallet, saved with the version check, means a
// second confirmation (browser + webhook) does nothing.
//
// Secrets (Cloudflare → nilobs → Settings → Variables and Secrets): CASHFREE_APP_ID, CASHFREE_SECRET_KEY.
// Test keys work against Cashfree's sandbox and live keys against production: the Worker finds out which
// on the first call (CASHFREE_ENV = "sandbox" / "production" fixes it instead). CASHFREE_CURRENCIES is "INR", or "INR,USD" once Cashfree has
// turned on international payments for the account.
import * as E from "../app/src/economy.ts"
import { reply } from "./guard.js"
import { HttpError, checkoutModes, ensureWalletSchema, errorReply, mutate, readWallet, view } from "./wallet.js"

const API_VERSION = "2025-01-01"
const enc = new TextEncoder()
const BASES = { production: "https://api.cashfree.com/pg", sandbox: "https://sandbox.cashfree.com/pg" }
const learned = new Map() // App ID → the environment its keys turned out to belong to
/** Which Cashfree environment these keys belong to: CASHFREE_ENV if set, else what worked last (production first). */
export const cashfreeMode = (env) =>
  env.CASHFREE_ENV === "production" || env.CASHFREE_ENV === "sandbox" ? env.CASHFREE_ENV : learned.get(env.CASHFREE_APP_ID) || "production"
export const resetCashfreeMode = () => learned.clear()
/** Call Cashfree. Keys rejected by one environment are tried once on the other (test keys → sandbox). */
async function cashfreeFetch(env, fetchImpl, path, init = {}) {
  const first = cashfreeMode(env)
  const call = (mode) => fetchImpl(`${BASES[mode]}${path}`, { ...init, headers: { ...cashfreeHeaders(env), ...(init.headers || {}) } })
  let res = await call(first)
  if ((res.status === 401 || res.status === 403) && !env.CASHFREE_ENV) {
    const other = first === "production" ? "sandbox" : "production"
    const again = await call(other)
    if (again.status !== 401 && again.status !== 403) {
      learned.set(env.CASHFREE_APP_ID, other)
      res = again
    }
  } else if (res.ok && !env.CASHFREE_ENV) learned.set(env.CASHFREE_APP_ID, first)
  return res
}
const cashfreeHeaders = (env) => ({
  "content-type": "application/json",
  "x-api-version": API_VERSION,
  "x-client-id": env.CASHFREE_APP_ID,
  "x-client-secret": env.CASHFREE_SECRET_KEY,
})

/* ---------------- signatures ---------------- */
/** Cashfree's webhook signature: base64 of HMAC-SHA256(timestamp + raw body) with the secret key. */
export async function cashfreeSignature(secret, timestamp, body) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}${body}`)))
  let bin = ""
  for (const b of sig) bin += String.fromCharCode(b)
  return btoa(bin)
}
/** Compares two strings without leaking where they differ. */
function same(a, b) {
  a = String(a || "")
  b = String(b || "")
  if (!a || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/* ---------------- crediting a payment (once) ---------------- */
const minor = (major) => Math.round(Number(major) * 100) // rupees → paise, dollars → cents
async function grant(env, pay, paymentRef, paid) {
  if (paid && (minor(paid.amount) !== Number(pay.amount) || String(paid.currency || pay.currency) !== pay.currency))
    throw new HttpError(400, "Amount doesn't match the order", "amount_mismatch")
  const via = pay.provider === "cashfree" ? "Cashfree" : "test"
  const out = await mutate(env, pay.user_id, (d, now) => {
    const claim = `pay:${pay.id}`
    if (d.claims.includes(claim)) return { already: true }
    const paidWith = `${E.fmtPrice(pay.amount / 100, pay.currency)} via ${via}`
    const r = E.grantPurchase(d.w, pay.product, pay.currency, now, paidWith)
    if (r.ok) d.w = r.state
    else {
      // paid, but the plan can no longer be applied (e.g. a higher plan was bought meanwhile): keep the value as credits
      const p = E.product(pay.product)
      d.w = E.earn(d.w, p?.credits || 0, `${p?.name || "Purchase"} (${paidWith}): added as credits`, now)
      const b = d.w.buckets[d.w.buckets.length - 1]
      if (b) b.expires = null
    }
    d.claims = [...d.claims, claim]
    return { already: false }
  })
  await env.DB.prepare("UPDATE payments SET status = 'paid', paid_at = ?, payment_ref = ? WHERE id = ? AND status != 'paid'").bind(Date.now(), String(paymentRef || ""), pay.id).run()
  return out
}
/** A payment that can never be credited (a wrong amount) is logged and marked, and Cashfree isn't asked to retry. */
async function grantOrMark(env, pay, paymentRef, paid) {
  try {
    await grant(env, pay, paymentRef, paid)
  } catch (e) {
    if (e instanceof HttpError && e.code === "amount_mismatch") {
      console.error("payment amount mismatch", pay.id, JSON.stringify(paid), pay.amount, pay.currency)
      await env.DB.prepare("UPDATE payments SET status = 'mismatch', payment_ref = ? WHERE id = ? AND status != 'paid'").bind(String(paymentRef || ""), pay.id).run()
      return false
    }
    throw e
  }
  return true
}

const findPayment = (env, where, ...args) => env.DB.prepare(`SELECT * FROM payments WHERE ${where}`).bind(...args).first()
const phoneOk = (p) => /^\+?\d{10,15}$/.test(p)

/* ---------------- routes ---------------- */
export async function handlePay(request, env, user, fetchImpl = fetch) {
  const url = new URL(request.url)
  const path = url.pathname
  await ensureWalletSchema(env.DB)
  try {
    // Cashfree's notification comes from Cashfree, not from a signed-in browser
    if (path === "/api/pay/cashfree/webhook") return await cashfreeWebhook(request, env)
    if (!user) return reply(401, { error: "Sign in to buy" })
    if (request.method !== "POST") return reply(405, { error: "Use POST" })
    let body = {}
    try {
      body = await request.json()
    } catch {
      return reply(400, { error: "Body must be JSON" })
    }

    if (path === "/api/pay/order") {
      const cur = body?.currency === "USD" ? "USD" : "INR"
      const key = String(body?.product || "")
      const p = E.product(key)
      if (!p) return reply(400, { error: "Unknown product", code: "bad_product" })
      const { data } = await readWallet(env, user.id)
      const can = E.canBuy(data.w, key, Date.now())
      if (!can.ok) return reply(409, { error: can.why, code: "cannot_buy" })
      const mode = checkoutModes(env)[cur]
      if (!mode) return reply(503, { error: cur === "INR" ? "Payments in rupees aren't open yet." : "Payments in dollars aren't open yet. You can pay in rupees with an international card.", code: "payments_closed" })
      const amount = Math.round(p.price[cur] * 100) // paise or cents
      const id = "pay_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20)
      const now = Date.now()
      if (mode === "simulated") {
        await env.DB.prepare("INSERT INTO payments (id, user_id, provider, ref, product, currency, amount, status, created_at) VALUES (?, ?, 'simulated', ?, ?, ?, ?, 'created', ?)").bind(id, user.id, id, key, cur, amount, now).run()
        await grant(env, { id, user_id: user.id, provider: "simulated", product: key, currency: cur, amount }, id)
        const w = await readWallet(env, user.id)
        return reply(200, { provider: "simulated", ...view(env, w.data, w.version) })
      }
      // Cashfree needs a phone number on every order
      const phone = String(body?.phone || "").replace(/[\s()-]/g, "")
      if (!phoneOk(phone)) return reply(400, { error: "Enter your mobile number (10 digits, or + and the country code).", code: "bad_phone" })
      const origin = url.origin
      const name = String(user.name || "").trim()
      const order = {
        order_id: id,
        order_amount: amount / 100,
        order_currency: cur,
        customer_details: {
          customer_id: String(user.id).replace(/[^A-Za-z0-9]/g, "").slice(0, 50) || "nilobsuser",
          customer_phone: phone,
          ...(user.email ? { customer_email: String(user.email).slice(0, 100) } : {}),
          customer_name: (name.length >= 3 ? name : "NilObs user").slice(0, 100),
        },
        order_meta: {
          return_url: `${origin}/?checkout=cashfree&order_id=${id}#app/wallet`,
          ...(origin.startsWith("https://") ? { notify_url: `${origin}/api/pay/cashfree/webhook` } : {}),
        },
        order_note: `NilObs: ${p.name}`.slice(0, 200),
        order_tags: { product: key, pay: id },
      }
      const res = await cashfreeFetch(env, fetchImpl, "/orders", { method: "POST", headers: { "x-idempotency-key": id }, body: JSON.stringify(order) })
      const out = await res.json().catch(() => null)
      if (!res.ok || !out?.payment_session_id) {
        console.error("cashfree order", res.status, out?.message || out?.code)
        return reply(502, { error: "Couldn't start the payment. Try again.", code: "provider_error" })
      }
      await env.DB.prepare("INSERT INTO payments (id, user_id, provider, ref, product, currency, amount, status, created_at) VALUES (?, ?, 'cashfree', ?, ?, ?, ?, 'created', ?)").bind(id, user.id, id, key, cur, amount, now).run()
      return reply(200, { provider: "cashfree", orderId: id, sessionId: out.payment_session_id, mode: cashfreeMode(env) })
    }

    if (path === "/api/pay/cashfree/confirm") {
      if (!env.CASHFREE_APP_ID || !env.CASHFREE_SECRET_KEY) return reply(503, { error: "Cashfree isn't set up", code: "payments_closed" })
      const orderId = String(body?.orderId || "")
      const pay = await findPayment(env, "provider = 'cashfree' AND ref = ? AND user_id = ?", orderId, user.id)
      if (!pay) return reply(404, { error: "No such order", code: "no_order" })
      if (pay.status === "mismatch") return reply(409, { error: "That payment didn't match the order. Email us and we'll sort it out.", code: "amount_mismatch" })
      if (pay.status !== "paid") {
        const res = await cashfreeFetch(env, fetchImpl, `/orders/${encodeURIComponent(orderId)}`)
        const o = await res.json().catch(() => null)
        if (!res.ok || !o) return reply(502, { error: "Couldn't reach Cashfree. Your payment is safe; refresh in a minute.", code: "provider_error" })
        if (o.order_status !== "PAID") return reply(200, { status: o.order_status === "ACTIVE" ? "pending" : "failed" })
        if (!(await grantOrMark(env, pay, o.cf_order_id || orderId, { amount: o.order_amount, currency: o.order_currency })))
          return reply(409, { error: "That payment didn't match the order. Email us and we'll sort it out.", code: "amount_mismatch" })
      }
      const w = await readWallet(env, user.id)
      return reply(200, { status: "paid", ...view(env, w.data, w.version) })
    }

    return reply(404, { error: "Not found" })
  } catch (e) {
    return errorReply(e)
  }
}

async function cashfreeWebhook(request, env) {
  if (request.method !== "POST") return reply(405, { error: "Use POST" })
  const raw = await request.text()
  if (!env.CASHFREE_SECRET_KEY) return reply(503, { error: "Cashfree isn't set up" })
  const ts = request.headers.get("x-webhook-timestamp") || ""
  if (!ts || !same(request.headers.get("x-webhook-signature"), await cashfreeSignature(env.CASHFREE_SECRET_KEY, ts, raw))) return reply(400, { error: "Bad signature" })
  let ev
  try {
    ev = JSON.parse(raw)
  } catch {
    return reply(400, { error: "Bad body" })
  }
  if (ev?.type === "PAYMENT_SUCCESS_WEBHOOK" && ev.data?.payment?.payment_status === "SUCCESS") {
    const orderId = String(ev.data?.order?.order_id || "")
    const pay = orderId ? await findPayment(env, "provider = 'cashfree' AND ref = ?", orderId) : null
    if (pay) await grantOrMark(env, pay, ev.data.payment.cf_payment_id, { amount: ev.data.payment.payment_amount ?? ev.data.order.order_amount, currency: ev.data.payment.payment_currency || ev.data.order.order_currency })
  }
  return reply(200, { ok: true })
}
