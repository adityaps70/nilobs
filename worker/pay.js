// Real payments, through Razorpay. Prices come only from app/src/economy.ts (never from the browser), and
// credits are added only once Razorpay says the money was captured:
//
//   POST /api/pay/order             creates a Razorpay order at the server's price; the browser opens
//                                   Razorpay Checkout for that order.
//   POST /api/pay/razorpay/confirm  the browser hands back Razorpay's payment id and signature. The signature
//                                   (HMAC-SHA256 of "order_id|payment_id" with the key secret) is checked, then
//                                   Razorpay's API is asked about the payment itself (amount, currency, order,
//                                   captured). An authorized payment is captured here.
//   POST /api/pay/razorpay/webhook  Razorpay's own notification (signed: HMAC-SHA256 of the raw body with the
//                                   webhook secret, in X-Razorpay-Signature), which covers a closed tab.
//
// Each payment is credited once: a "pay:<id>" claim in the wallet, saved with the version check, means a
// second confirmation (browser + webhook) does nothing.
//
// Secrets (Cloudflare → nilobs → Settings → Variables and Secrets): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and
// RAZORPAY_WEBHOOK_SECRET (the secret typed when adding the webhook in Razorpay). Test keys (rzp_test_…) take
// test payments; live keys (rzp_live_…) take real ones. RAZORPAY_CURRENCIES is "INR", or "INR,USD" once
// Razorpay has turned on international payments for the account.
import * as E from "../app/src/economy.ts"
import { reply } from "./guard.js"
import { HttpError, checkoutModes, ensureWalletSchema, errorReply, mutate, readWallet, view } from "./wallet.js"

const API = "https://api.razorpay.com/v1"
const enc = new TextEncoder()

const auth = (env) => "Basic " + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)
const razorpay = (env, fetchImpl, path, init = {}) =>
  fetchImpl(`${API}${path}`, { ...init, headers: { authorization: auth(env), "content-type": "application/json", ...(init.headers || {}) } })
export const razorpayReady = (env) => !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)
export const razorpayMode = (env) => (String(env.RAZORPAY_KEY_ID || "").startsWith("rzp_live_") ? "live" : "test")

/* ---------------- signatures ---------------- */
/** Hex HMAC-SHA256, as Razorpay signs both payments and webhooks. */
export async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(text)))
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("")
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
async function grant(env, pay, paymentRef, paid) {
  // `paid` is what the provider says was paid, in paise or cents
  if (paid && (Number(paid.amount) !== Number(pay.amount) || String(paid.currency || pay.currency).toUpperCase() !== pay.currency))
    throw new HttpError(400, "Amount doesn't match the order", "amount_mismatch")
  const via = pay.provider === "razorpay" ? "Razorpay" : "test"
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
/** A payment that can never be credited (a wrong amount) is logged and marked instead. */
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
const MISMATCH = { error: "That payment didn't match the order. Email us and we'll sort it out.", code: "amount_mismatch" }

/**
 * Settle one Razorpay payment for our order: it must belong to the order, and be captured (an authorized
 * payment is captured now). Returns "paid", "pending", "failed" or "mismatch".
 */
async function settle(env, fetchImpl, pay, paymentId) {
  const res = await razorpay(env, fetchImpl, `/payments/${encodeURIComponent(paymentId)}`)
  let p = await res.json().catch(() => null)
  if (!res.ok || !p) throw new HttpError(502, "Couldn't reach Razorpay. Your payment is safe; refresh in a minute.", "provider_error")
  if (p.order_id !== pay.ref) throw new HttpError(400, "That payment belongs to another order", "wrong_order")
  if (p.status === "authorized") {
    const cap = await razorpay(env, fetchImpl, `/payments/${encodeURIComponent(paymentId)}/capture`, { method: "POST", body: JSON.stringify({ amount: pay.amount, currency: pay.currency }) })
    const c = await cap.json().catch(() => null)
    if (cap.ok && c) p = c
  }
  if (p.status === "captured") return (await grantOrMark(env, pay, p.id, { amount: p.amount, currency: p.currency })) ? "paid" : "mismatch"
  return p.status === "failed" ? "failed" : "pending"
}

/** No payment id in hand (a reload, a closed pop-up): ask Razorpay about the order and its payments. */
async function settleOrder(env, fetchImpl, pay) {
  const res = await razorpay(env, fetchImpl, `/orders/${encodeURIComponent(pay.ref)}/payments`)
  const out = await res.json().catch(() => null)
  if (!res.ok || !out) throw new HttpError(502, "Couldn't reach Razorpay. Your payment is safe; refresh in a minute.", "provider_error")
  const items = Array.isArray(out.items) ? out.items : []
  const good = items.find((x) => x.status === "captured") || items.find((x) => x.status === "authorized")
  if (good) return settle(env, fetchImpl, pay, good.id)
  return items.length && items.every((x) => x.status === "failed") ? "failed" : "pending"
}

/* ---------------- routes ---------------- */
export async function handlePay(request, env, user, fetchImpl = fetch) {
  const url = new URL(request.url)
  const path = url.pathname
  await ensureWalletSchema(env.DB)
  try {
    // Razorpay's notification comes from Razorpay, not from a signed-in browser
    if (path === "/api/pay/razorpay/webhook") return await razorpayWebhook(request, env)
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
      const res = await razorpay(env, fetchImpl, "/orders", {
        method: "POST",
        body: JSON.stringify({ amount, currency: cur, receipt: id, notes: { product: key, pay: id, item: p.name.slice(0, 200) } }),
      })
      const out = await res.json().catch(() => null)
      if (!res.ok || !out?.id) {
        console.error("razorpay order", res.status, out?.error?.code, out?.error?.description)
        return reply(502, { error: "Couldn't start the payment. Try again.", code: "provider_error" })
      }
      await env.DB.prepare("INSERT INTO payments (id, user_id, provider, ref, product, currency, amount, status, created_at) VALUES (?, ?, 'razorpay', ?, ?, ?, ?, 'created', ?)").bind(id, user.id, out.id, key, cur, amount, now).run()
      return reply(200, {
        provider: "razorpay",
        orderId: id,
        razorpayOrderId: out.id,
        keyId: env.RAZORPAY_KEY_ID, // the public half of the keys: Checkout needs it
        amount,
        currency: cur,
        description: p.name,
        prefill: { name: String(user.name || "").slice(0, 100), email: String(user.email || "").slice(0, 100) },
        mode: razorpayMode(env),
      })
    }

    if (path === "/api/pay/razorpay/confirm") {
      if (!razorpayReady(env)) return reply(503, { error: "Razorpay isn't set up", code: "payments_closed" })
      const orderId = String(body?.orderId || "")
      const pay = await findPayment(env, "provider = 'razorpay' AND id = ? AND user_id = ?", orderId, user.id)
      if (!pay) return reply(404, { error: "No such order", code: "no_order" })
      if (pay.status === "mismatch") return reply(409, MISMATCH)
      if (pay.status !== "paid") {
        const paymentId = String(body?.paymentId || "")
        let state
        if (paymentId) {
          // Checkout's signature proves this payment id came from Razorpay for this order
          const want = await hmacHex(env.RAZORPAY_KEY_SECRET, `${pay.ref}|${paymentId}`)
          if (!same(body?.signature, want)) return reply(400, { error: "That payment couldn't be verified.", code: "bad_signature" })
          state = await settle(env, fetchImpl, pay, paymentId)
        } else state = await settleOrder(env, fetchImpl, pay)
        if (state === "mismatch") return reply(409, MISMATCH)
        if (state !== "paid") return reply(200, { status: state })
      }
      const w = await readWallet(env, user.id)
      return reply(200, { status: "paid", ...view(env, w.data, w.version) })
    }

    return reply(404, { error: "Not found" })
  } catch (e) {
    return errorReply(e)
  }
}

async function razorpayWebhook(request, env) {
  if (request.method !== "POST") return reply(405, { error: "Use POST" })
  const raw = await request.text()
  if (!env.RAZORPAY_WEBHOOK_SECRET) return reply(503, { error: "Razorpay webhook isn't set up" })
  if (!same(request.headers.get("x-razorpay-signature"), await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw))) return reply(400, { error: "Bad signature" })
  let ev
  try {
    ev = JSON.parse(raw)
  } catch {
    return reply(400, { error: "Bad body" })
  }
  const payment = ev?.payload?.payment?.entity
  if ((ev?.event === "payment.captured" || ev?.event === "order.paid") && payment?.status === "captured") {
    const orderId = String(payment.order_id || ev?.payload?.order?.entity?.id || "")
    const pay = orderId ? await findPayment(env, "provider = 'razorpay' AND ref = ?", orderId) : null
    if (pay) await grantOrMark(env, pay, payment.id, { amount: payment.amount, currency: payment.currency })
  }
  return reply(200, { ok: true })
}
