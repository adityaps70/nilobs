// Payments: credits only after Razorpay or Stripe confirms with a signature we check, each payment once.
import test from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { balanceOf, call, fakeProviders, freshEnv, json, signIn } from "./helpers.mjs"
import { stripeSignatureOk } from "../worker/pay.js"

const RZP = { RAZORPAY_KEY_ID: "rzp_test_abc", RAZORPAY_KEY_SECRET: "rzp-secret", RAZORPAY_WEBHOOK_SECRET: "rzp-hook" }
const STRIPE = { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" }
const hmac = (secret, msg) => createHmac("sha256", secret).update(msg).digest("hex")

/** A fake Razorpay and Stripe that remember what was asked for. */
function providers() {
  const st = { orders: [], sessions: new Map(), fail: false }
  fakeProviders.handler = async (u, init = {}) => {
    if (st.fail) return new Response(JSON.stringify({ error: { description: "down" } }), { status: 500 })
    if (u === "https://api.razorpay.com/v1/orders") {
      const b = JSON.parse(init.body)
      const order = { id: `order_${st.orders.length + 1}`, amount: b.amount, currency: b.currency, receipt: b.receipt, auth: init.headers.authorization }
      st.orders.push(order)
      return new Response(JSON.stringify(order))
    }
    if (u === "https://api.stripe.com/v1/checkout/sessions" && init.method === "POST") {
      const f = new URLSearchParams(init.body)
      const id = `cs_test_${st.sessions.size + 1}`
      const s = { id, url: `https://checkout.stripe.com/c/pay/${id}`, amount_total: Number(f.get("line_items[0][price_data][unit_amount]")), payment_status: "unpaid", payment_intent: null, form: f }
      st.sessions.set(id, s)
      return new Response(JSON.stringify(s))
    }
    const m = u.match(/^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/(.+)$/)
    if (m) {
      const s = st.sessions.get(decodeURIComponent(m[1]))
      return s ? new Response(JSON.stringify(s)) : new Response(JSON.stringify({ error: { message: "no such session" } }), { status: 404 })
    }
    return new Response("unexpected " + u, { status: 500 })
  }
  return st
}
const order = (env, cookie, body) => call(env, "/api/pay/order", { method: "POST", cookie, body }).then(json)
const wallet = (env, cookie) => call(env, "/api/wallet", { cookie }).then(json)
const rzpHook = (env, body, secret = RZP.RAZORPAY_WEBHOOK_SECRET) => {
  const raw = JSON.stringify(body)
  return call(env, "/api/pay/razorpay/webhook", { method: "POST", body: raw, origin: "https://razorpay.com", headers: { "x-razorpay-signature": hmac(secret, raw) } })
}
const stripeHook = (env, body, { secret = STRIPE.STRIPE_WEBHOOK_SECRET, t = Math.floor(Date.now() / 1000) } = {}) => {
  const raw = JSON.stringify(body)
  return call(env, "/api/pay/stripe/webhook", { method: "POST", body: raw, origin: "https://stripe.com", headers: { "stripe-signature": `t=${t},v1=${hmac(secret, `${t}.${raw}`)}` } })
}

test("checkout says which currencies are open", async () => {
  const env = freshEnv({ ...RZP })
  const { cookie } = await signIn(env)
  assert.deepEqual((await wallet(env, cookie)).checkout, { INR: "razorpay", USD: null })
  const env2 = freshEnv({ ...STRIPE })
  assert.deepEqual((await wallet(env2, (await signIn(env2)).cookie)).checkout, { INR: null, USD: "stripe" })
})

test("Razorpay: the price comes from the server, credits only with Razorpay's signature, once", async () => {
  const st = providers()
  const env = freshEnv({ ...RZP })
  const { cookie } = await signIn(env)
  assert.equal((await call(env, "/api/pay/order", { method: "POST", body: { product: "topup:t500", currency: "INR" } })).status, 401)
  assert.equal((await order(env, cookie, { product: "topup:t9999", currency: "INR" })).status, 400)
  const o = await order(env, cookie, { product: "topup:t500", currency: "INR", amount: 1, price: 1 })
  assert.equal(o.status, 200)
  assert.equal(o.provider, "razorpay")
  assert.equal(o.amount, 69900, "₹699 in paise, whatever the browser sent")
  assert.equal(st.orders[0].amount, 69900)
  assert.equal(st.orders[0].auth, "Basic " + btoa("rzp_test_abc:rzp-secret"))
  assert.equal(o.keyId, "rzp_test_abc")
  assert.ok(!JSON.stringify(o).includes("rzp-secret"), "the secret never reaches the browser")
  const verify = (body) => call(env, "/api/pay/razorpay/verify", { method: "POST", cookie, body }).then(json)
  // a made-up signature
  const bad = await verify({ orderId: o.orderId, paymentId: "pay_1", signature: "ab".repeat(32) })
  assert.equal(bad.status, 400)
  assert.equal(bad.code, "bad_signature")
  // signed for another order
  assert.equal((await verify({ orderId: o.orderId, paymentId: "pay_1", signature: hmac("rzp-secret", `order_999|pay_1`) })).status, 400)
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 80)
  const good = { orderId: o.orderId, paymentId: "pay_1", signature: hmac("rzp-secret", `${o.orderId}|pay_1`) }
  const v = await verify(good)
  assert.equal(v.status, 200)
  assert.equal(v.body.status, "paid")
  assert.equal(balanceOf(v.wallet), 580)
  assert.match(v.wallet.ledger[0].label, /₹699 via Razorpay/)
  // the same payment again, and Razorpay's webhook for it: nothing more
  assert.equal(balanceOf((await verify(good)).wallet), 580)
  assert.equal((await rzpHook(env, { event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: o.orderId, status: "captured", amount: 69900 } } } })).status, 200)
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 580)
  // someone else can't claim this order
  const other = await signIn(env, "g-2")
  assert.equal((await call(env, "/api/pay/razorpay/verify", { method: "POST", cookie: other.cookie, body: good })).status, 404)
  assert.equal(balanceOf((await wallet(env, other.cookie)).wallet), 80)
})

test("Razorpay webhook credits a closed tab; bad signatures and wrong amounts don't", async () => {
  providers()
  const env = freshEnv({ ...RZP })
  const { cookie } = await signIn(env)
  const o = await order(env, cookie, { product: "pass", currency: "INR" })
  const ev = (amount) => ({ event: "payment.captured", payload: { payment: { entity: { id: "pay_w1", order_id: o.orderId, status: "captured", amount } } } })
  assert.equal((await rzpHook(env, ev(o.amount), "wrong-secret")).status, 400)
  const raw = JSON.stringify(ev(o.amount))
  assert.equal((await call(env, "/api/pay/razorpay/webhook", { method: "POST", body: raw })).status, 400, "no signature")
  assert.equal((await rzpHook(env, ev(100))).status, 200, "answered so Razorpay stops retrying")
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 80, "₹1 doesn't buy a pass")
  // authorised but not captured: wait
  await rzpHook(env, { event: "payment.captured", payload: { payment: { entity: { id: "pay_w1", order_id: o.orderId, status: "authorized", amount: o.amount } } } })
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 80)
  // an order this server never made
  assert.equal((await rzpHook(env, { event: "order.paid", payload: { order: { entity: { id: "order_fake", amount_paid: 1 } } } })).status, 200)
  const env2 = freshEnv({ ...RZP })
  const u2 = await signIn(env2)
  const o2 = await order(env2, u2.cookie, { product: "pass", currency: "INR" })
  assert.equal((await rzpHook(env2, { event: "order.paid", payload: { order: { entity: { id: o2.orderId, amount_paid: o2.amount } } } })).status, 200)
  const w = (await wallet(env2, u2.cookie)).wallet
  assert.ok(w.pass?.until > Date.now(), "pass active")
})

test("Stripe: Checkout session at the server's price; paid only when Stripe says so", async () => {
  const st = providers()
  const env = freshEnv({ ...STRIPE })
  const { cookie } = await signIn(env)
  const o = await order(env, cookie, { product: "topup:t150", currency: "USD", amount: 1 })
  assert.equal(o.status, 200)
  assert.equal(o.provider, "stripe")
  assert.match(o.url, /^https:\/\/checkout\.stripe\.com\//)
  const s = [...st.sessions.values()][0]
  assert.equal(s.form.get("line_items[0][price_data][unit_amount]"), "300")
  assert.equal(s.form.get("mode"), "payment")
  assert.match(s.form.get("success_url"), /^https:\/\/nilobs\.com\/\?checkout=stripe&session_id=\{CHECKOUT_SESSION_ID\}/)
  assert.equal(s.form.get("customer_email"), "g-1@example.com")
  const confirm = (session, c = cookie) => call(env, "/api/pay/stripe/confirm", { method: "POST", cookie: c, body: { session } }).then(json)
  const pending = await confirm(s.id)
  assert.equal(pending.status, 200)
  assert.equal(pending.body.status, "pending")
  assert.equal(pending.wallet, undefined)
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 80, "unpaid: nothing yet")
  // a session made elsewhere, or someone else's
  assert.equal((await confirm("cs_test_other")).status, 404)
  const other = await signIn(env, "g-2")
  s.payment_status = "paid"
  s.payment_intent = "pi_1"
  assert.equal((await confirm(s.id, other.cookie)).status, 404)
  const c = await confirm(s.id)
  assert.equal(c.status, 200)
  assert.equal(c.body.status, "paid")
  assert.equal(balanceOf(c.wallet), 230)
  assert.match(c.wallet.ledger[0].label, /\$3 via Stripe/)
  // the webhook for the same session adds nothing
  assert.equal((await stripeHook(env, { type: "checkout.session.completed", data: { object: { id: s.id, payment_status: "paid", amount_total: 300, payment_intent: "pi_1" } } })).status, 200)
  assert.equal(balanceOf((await confirm(s.id)).wallet), 230)
})

test("Stripe webhook: signed, recent and the right amount", async () => {
  const st = providers()
  const env = freshEnv({ ...STRIPE })
  const { cookie } = await signIn(env)
  await order(env, cookie, { product: "plan:watch:monthly", currency: "USD" })
  const s = [...st.sessions.values()][0]
  const ev = (amount_total) => ({ type: "checkout.session.completed", data: { object: { id: s.id, payment_status: "paid", amount_total, payment_intent: "pi_2" } } })
  assert.equal((await stripeHook(env, ev(700), { secret: "whsec_wrong" })).status, 400)
  assert.equal((await stripeHook(env, ev(700), { t: Math.floor(Date.now() / 1000) - 3600 })).status, 400, "an old replayed event")
  assert.equal((await stripeHook(env, ev(1))).status, 200)
  assert.equal((await wallet(env, cookie)).wallet.plan.id, "free", "$0.01 doesn't buy a plan")
  assert.equal((await stripeHook(env, { ...ev(700), type: "checkout.session.expired" })).status, 200)
  assert.equal((await wallet(env, cookie)).wallet.plan.id, "free")
  // the mismatched payment is marked; a correct one for a fresh session works
  await order(env, cookie, { product: "plan:watch:monthly", currency: "USD" })
  const s2 = [...st.sessions.values()][1]
  assert.equal((await stripeHook(env, { type: "checkout.session.completed", data: { object: { id: s2.id, payment_status: "paid", amount_total: 700, payment_intent: "pi_3" } } })).status, 200)
  const w = (await wallet(env, cookie)).wallet
  assert.equal(w.plan.id, "watch")
  assert.ok(w.plan.cancelAt > Date.now(), "prepaid, ends on its own")
  assert.equal(env.DB.sqlite.prepare("SELECT status FROM payments WHERE ref = ?").get(s.id).status, "mismatch")
  assert.equal(env.DB.sqlite.prepare("SELECT status FROM payments WHERE ref = ?").get(s2.id).status, "paid")
})

test("Stripe signature checker", async () => {
  const body = '{"a":1}'
  const t = 1700000000
  const sig = hmac("whsec", `${t}.${body}`)
  assert.equal(await stripeSignatureOk("whsec", `t=${t},v1=${sig}`, body, t * 1000), true)
  assert.equal(await stripeSignatureOk("whsec", `t=${t},v1=bad,v1=${sig}`, body, t * 1000), true, "any v1 may match (key rolling)")
  assert.equal(await stripeSignatureOk("whsec", `t=${t},v1=${sig}`, body + " ", t * 1000), false)
  assert.equal(await stripeSignatureOk("whsec", `t=${t},v1=${sig}`, body, (t + 301) * 1000), false)
  assert.equal(await stripeSignatureOk("whsec", `v1=${sig}`, body, t * 1000), false)
  assert.equal(await stripeSignatureOk("whsec", "", body, t * 1000), false)
})

test("plans are prepaid: the same plan extends, a lower one waits, a higher one starts now", async () => {
  providers()
  const env = freshEnv({ ...RZP })
  const { cookie } = await signIn(env)
  const pay = async (product) => {
    const o = await order(env, cookie, { product, currency: "INR" })
    if (o.status !== 200) return o
    return call(env, "/api/pay/razorpay/verify", { method: "POST", cookie, body: { orderId: o.orderId, paymentId: "p_" + o.orderId, signature: hmac("rzp-secret", `${o.orderId}|p_${o.orderId}`) } }).then(json)
  }
  const a = await pay("plan:watch:monthly")
  const end1 = a.wallet.plan.cancelAt
  const b = await pay("plan:watch:monthly")
  assert.ok(b.wallet.plan.cancelAt - end1 > 29 * 86400000, "a second month is added to the end")
  const c = await pay("plan:command:monthly")
  assert.equal(c.wallet.plan.id, "command")
  const d = await pay("plan:watch:annual")
  assert.equal(d.status, 409)
  assert.equal(d.code, "cannot_buy")
})

test("paid, but a higher plan was bought before it was confirmed: the money becomes credits", async () => {
  providers()
  const env = freshEnv({ ...RZP })
  const { cookie } = await signIn(env)
  const watch = await order(env, cookie, { product: "plan:watch:monthly", currency: "INR" })
  const command = await order(env, cookie, { product: "plan:command:monthly", currency: "INR" })
  const verify = (o) => call(env, "/api/pay/razorpay/verify", { method: "POST", cookie, body: { orderId: o.orderId, paymentId: "p" + o.orderId, signature: hmac("rzp-secret", `${o.orderId}|p${o.orderId}`) } }).then(json)
  const c = await verify(command)
  const before = balanceOf(c.wallet)
  const w = await verify(watch)
  assert.equal(w.wallet.plan.id, "command")
  assert.equal(balanceOf(w.wallet) - before, 400, "Watch's credits added, and they don't expire")
  assert.equal(w.wallet.buckets.at(-1).expires, null)
})

test("a provider error doesn't create an order; payments closed without keys", async () => {
  const st = providers()
  st.fail = true
  const env = freshEnv({ ...RZP })
  const { cookie } = await signIn(env)
  const o = await order(env, cookie, { product: "topup:t150", currency: "INR" })
  assert.equal(o.status, 502)
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM payments").get().n, 0)
  const closed = await order(env, cookie, { product: "topup:t150", currency: "USD" })
  assert.equal(closed.status, 503)
  assert.equal((await call(env, "/api/pay/stripe/webhook", { method: "POST", body: "{}" })).status, 503, "no webhook secret: refused")
  // a POST from another site is refused
  assert.equal((await call(env, "/api/pay/order", { method: "POST", cookie, origin: "https://evil.example", body: { product: "topup:t150", currency: "INR" } })).status, 403)
})
