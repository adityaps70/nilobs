// Real payments. Prices come only from app/src/economy.ts (never from the browser), and credits are added
// only after the payment provider confirms the payment with a signature we check:
//
//   ₹ (INR) → Razorpay. POST /api/pay/order creates a Razorpay order; the browser opens Razorpay Checkout;
//             POST /api/pay/razorpay/verify checks Razorpay's signature (HMAC of order|payment with the key
//             secret). The webhook POST /api/pay/razorpay/webhook (order.paid / payment.captured, signed with
//             the webhook secret) covers a closed tab.
//   $ (USD) → Stripe. POST /api/pay/order creates a Stripe Checkout Session and returns its URL; after paying,
//             Stripe sends the user back and POST /api/pay/stripe/confirm asks Stripe whether it was paid. The
//             webhook POST /api/pay/stripe/webhook (checkout.session.completed, signed) covers a closed tab.
//
// Each payment is credited once: a "pay:<id>" claim in the wallet, saved with the version check, means a
// second confirmation (verify + webhook) does nothing.
//
// Secrets (Cloudflare → nilobs → Settings → Variables and Secrets): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET,
// RAZORPAY_WEBHOOK_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Without them, that currency can't be bought.
import * as E from "../app/src/economy.ts"
import { reply } from "./guard.js"
import { HttpError, checkoutModes, ensureWalletSchema, errorReply, mutate, readWallet, view } from "./wallet.js"

const RAZORPAY_API = "https://api.razorpay.com/v1"
const STRIPE_API = "https://api.stripe.com/v1"
const enc = new TextEncoder()

/* ---------------- signatures ---------------- */
async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")
}
/** Compares two hex strings without leaking where they differ. */
function sameHex(a, b) {
  a = String(a || "")
  b = String(b || "")
  if (!a || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
export const razorpaySignature = (secret, orderId, paymentId) => hmacHex(secret, `${orderId}|${paymentId}`)
export const razorpayWebhookSignature = (secret, body) => hmacHex(secret, body)
/** Stripe: header "t=<unix>,v1=<hex>[,v1=...]", signed payload "<t>.<body>". */
export async function stripeSignatureOk(secret, header, body, now = Date.now(), tolerance = 300) {
  const parts = String(header || "").split(",").map((x) => x.trim().split("="))
  const t = Number(parts.find(([k]) => k === "t")?.[1])
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v)
  if (!t || !sigs.length || Math.abs(now / 1000 - t) > tolerance) return false
  const want = await hmacHex(secret, `${t}.${body}`)
  return sigs.some((s) => sameHex(s, want))
}

/* ---------------- crediting a payment (once) ---------------- */
const fmtMinor = (minor, cur) => E.fmtPrice(minor / 100, cur) // paise and cents are both 1/100
async function grant(env, pay, paymentRef, fetchedAmount) {
  if (fetchedAmount != null && Number(fetchedAmount) !== Number(pay.amount)) throw new HttpError(400, "Amount doesn't match the order", "amount_mismatch")
  const via = pay.provider === "razorpay" ? "Razorpay" : pay.provider === "stripe" ? "Stripe" : "test"
  const out = await mutate(env, pay.user_id, (d, now) => {
    const claim = `pay:${pay.id}`
    if (d.claims.includes(claim)) return { already: true }
    const paidWith = `${fmtMinor(pay.amount, pay.currency)} via ${via}`
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

const findPayment = (env, where, ...args) => env.DB.prepare(`SELECT * FROM payments WHERE ${where}`).bind(...args).first()

/* ---------------- routes ---------------- */
export async function handlePay(request, env, user, fetchImpl = fetch) {
  const url = new URL(request.url)
  const path = url.pathname
  await ensureWalletSchema(env.DB)
  try {
    // webhooks come from Razorpay and Stripe, not from a signed-in browser
    if (path === "/api/pay/razorpay/webhook") return await razorpayWebhook(request, env)
    if (path === "/api/pay/stripe/webhook") return await stripeWebhook(request, env)
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
      if (!mode) return reply(503, { error: cur === "INR" ? "Payments in rupees aren't open yet." : "Payments in dollars aren't open yet.", code: "payments_closed" })
      const amount = Math.round(p.price[cur] * 100) // paise or cents
      const id = "pay_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20)
      const now = Date.now()
      if (mode === "simulated") {
        await env.DB.prepare("INSERT INTO payments (id, user_id, provider, ref, product, currency, amount, status, created_at) VALUES (?, ?, 'simulated', ?, ?, ?, ?, 'created', ?)").bind(id, user.id, id, key, cur, amount, now).run()
        await grant(env, { id, user_id: user.id, provider: "simulated", product: key, currency: cur, amount }, id)
        const w = await readWallet(env, user.id)
        return reply(200, { provider: "simulated", ...view(env, w.data, w.version) })
      }
      if (mode === "razorpay") {
        const res = await fetchImpl(`${RAZORPAY_API}/orders`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Basic " + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`) },
          body: JSON.stringify({ amount, currency: "INR", receipt: id, notes: { pay: id, user: user.id, product: key } }),
        })
        const order = await res.json().catch(() => null)
        if (!res.ok || !order?.id) {
          console.error("razorpay order", res.status, order?.error?.description)
          return reply(502, { error: "Couldn't start the payment. Try again.", code: "provider_error" })
        }
        await env.DB.prepare("INSERT INTO payments (id, user_id, provider, ref, product, currency, amount, status, created_at) VALUES (?, ?, 'razorpay', ?, ?, 'INR', ?, 'created', ?)").bind(id, user.id, order.id, key, amount, now).run()
        return reply(200, { provider: "razorpay", keyId: env.RAZORPAY_KEY_ID, orderId: order.id, amount, currency: "INR", name: "NilObs", description: p.name, prefill: { email: user.email || "", name: user.name || "" } })
      }
      // Stripe Checkout
      const origin = url.origin
      const form = new URLSearchParams({
        mode: "payment",
        success_url: `${origin}/?checkout=stripe&session_id={CHECKOUT_SESSION_ID}#app/wallet`,
        cancel_url: `${origin}/?checkout=cancelled#app/wallet`,
        client_reference_id: id,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": String(amount),
        "line_items[0][price_data][product_data][name]": `NilObs: ${p.name}`,
        "metadata[pay]": id,
        "metadata[product]": key,
        "payment_intent_data[metadata][pay]": id,
      })
      if (user.email) form.set("customer_email", user.email)
      const res = await fetchImpl(`${STRIPE_API}/checkout/sessions`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
        body: form.toString(),
      })
      const session = await res.json().catch(() => null)
      if (!res.ok || !session?.id || !session?.url) {
        console.error("stripe session", res.status, session?.error?.message)
        return reply(502, { error: "Couldn't start the payment. Try again.", code: "provider_error" })
      }
      await env.DB.prepare("INSERT INTO payments (id, user_id, provider, ref, product, currency, amount, status, created_at) VALUES (?, ?, 'stripe', ?, ?, 'USD', ?, 'created', ?)").bind(id, user.id, session.id, key, amount, now).run()
      return reply(200, { provider: "stripe", url: session.url })
    }

    if (path === "/api/pay/razorpay/verify") {
      if (!env.RAZORPAY_KEY_SECRET) return reply(503, { error: "Razorpay isn't set up", code: "payments_closed" })
      const orderId = String(body?.orderId || ""), paymentId = String(body?.paymentId || ""), signature = String(body?.signature || "")
      const pay = await findPayment(env, "provider = 'razorpay' AND ref = ? AND user_id = ?", orderId, user.id)
      if (!pay) return reply(404, { error: "No such order", code: "no_order" })
      if (!sameHex(signature, await razorpaySignature(env.RAZORPAY_KEY_SECRET, orderId, paymentId))) return reply(400, { error: "The payment couldn't be verified.", code: "bad_signature" })
      await grant(env, pay, paymentId)
      const w = await readWallet(env, user.id)
      return reply(200, { status: "paid", ...view(env, w.data, w.version) })
    }

    if (path === "/api/pay/stripe/confirm") {
      if (!env.STRIPE_SECRET_KEY) return reply(503, { error: "Stripe isn't set up", code: "payments_closed" })
      const sid = String(body?.session || "")
      const pay = await findPayment(env, "provider = 'stripe' AND ref = ? AND user_id = ?", sid, user.id)
      if (!pay) return reply(404, { error: "No such checkout", code: "no_order" })
      if (pay.status !== "paid") {
        const res = await fetchImpl(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(sid)}`, { headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } })
        const s = await res.json().catch(() => null)
        if (!res.ok || !s) return reply(502, { error: "Couldn't reach Stripe. Your payment is safe; refresh in a minute.", code: "provider_error" })
        if (s.payment_status !== "paid") return reply(200, { status: "pending" })
        await grant(env, pay, s.payment_intent || s.id, s.amount_total)
      }
      const w = await readWallet(env, user.id)
      return reply(200, { status: "paid", ...view(env, w.data, w.version) })
    }

    return reply(404, { error: "Not found" })
  } catch (e) {
    return errorReply(e)
  }
}

/** A webhook that can never succeed (wrong amount) is logged and answered 200, so the provider doesn't retry it for days. */
async function grantFromWebhook(env, pay, paymentRef, amount) {
  try {
    await grant(env, pay, paymentRef, amount)
  } catch (e) {
    if (e instanceof HttpError && e.code === "amount_mismatch") {
      console.error("payment amount mismatch", pay.id, amount, pay.amount)
      await env.DB.prepare("UPDATE payments SET status = 'mismatch', payment_ref = ? WHERE id = ? AND status != 'paid'").bind(String(paymentRef || ""), pay.id).run()
      return
    }
    throw e
  }
}

async function razorpayWebhook(request, env) {
  const raw = await request.text()
  if (!env.RAZORPAY_WEBHOOK_SECRET) return reply(503, { error: "Webhook secret not set" })
  if (!sameHex(request.headers.get("x-razorpay-signature"), await razorpayWebhookSignature(env.RAZORPAY_WEBHOOK_SECRET, raw))) return reply(400, { error: "Bad signature" })
  let ev
  try {
    ev = JSON.parse(raw)
  } catch {
    return reply(400, { error: "Bad body" })
  }
  if (ev.event === "payment.captured" || ev.event === "order.paid") {
    const payment = ev.payload?.payment?.entity || {}
    const orderId = payment.order_id || ev.payload?.order?.entity?.id
    const pay = orderId ? await findPayment(env, "provider = 'razorpay' AND ref = ?", String(orderId)) : null
    if (pay && (payment.status === "captured" || ev.event === "order.paid")) await grantFromWebhook(env, pay, payment.id, payment.amount ?? ev.payload?.order?.entity?.amount_paid)
  }
  return reply(200, { ok: true })
}

async function stripeWebhook(request, env) {
  const raw = await request.text()
  if (!env.STRIPE_WEBHOOK_SECRET) return reply(503, { error: "Webhook secret not set" })
  if (!(await stripeSignatureOk(env.STRIPE_WEBHOOK_SECRET, request.headers.get("stripe-signature"), raw))) return reply(400, { error: "Bad signature" })
  let ev
  try {
    ev = JSON.parse(raw)
  } catch {
    return reply(400, { error: "Bad body" })
  }
  if (ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") {
    const s = ev.data?.object || {}
    const pay = s.id ? await findPayment(env, "provider = 'stripe' AND ref = ?", String(s.id)) : null
    if (pay && s.payment_status === "paid") await grantFromWebhook(env, pay, s.payment_intent || s.id, s.amount_total)
  }
  return reply(200, { received: true })
}
