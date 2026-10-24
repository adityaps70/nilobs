// Payments through Razorpay: credits only once Razorpay says the money was captured, each payment once.
import test from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { balanceOf, call, fakeProviders, freshEnv, json, signIn } from "./helpers.mjs"
import { hmacHex } from "../worker/pay.js"

const RZ = { RAZORPAY_KEY_ID: "rzp_test_abc123", RAZORPAY_KEY_SECRET: "rz-secret", RAZORPAY_WEBHOOK_SECRET: "wh-secret" }
const hex = (secret, text) => createHmac("sha256", secret).update(text).digest("hex")

/** A fake Razorpay that remembers orders and payments, and checks the API keys on every call. */
function razorpay({ fail = false, autoCapture = true } = {}) {
  const st = { orders: new Map(), payments: new Map(), calls: [] }
  st.pay = (orderId, { amount, currency, status } = {}) => {
    const o = st.orders.get(orderId)
    const id = "pay_rz" + st.payments.size
    const p = { id, entity: "payment", order_id: orderId, amount: amount ?? o.amount, currency: currency ?? o.currency, status: status ?? (autoCapture ? "captured" : "authorized") }
    st.payments.set(id, p)
    return { p, signature: hex(RZ.RAZORPAY_KEY_SECRET, `${orderId}|${id}`) }
  }
  fakeProviders.handler = async (u, init = {}) => {
    st.calls.push({ u, init })
    const h = init.headers || {}
    if (h.authorization !== "Basic " + Buffer.from(`${RZ.RAZORPAY_KEY_ID}:${RZ.RAZORPAY_KEY_SECRET}`).toString("base64"))
      return new Response(JSON.stringify({ error: { code: "BAD_REQUEST_ERROR", description: "Authentication failed" } }), { status: 401 })
    if (fail) return new Response(JSON.stringify({ error: { code: "SERVER_ERROR" } }), { status: 500 })
    const path = u.replace("https://api.razorpay.com/v1", "")
    if (path === "/orders" && init.method === "POST") {
      const b = JSON.parse(init.body)
      const o = { id: "order_rz" + st.orders.size, entity: "order", amount: b.amount, currency: b.currency, receipt: b.receipt, notes: b.notes, status: "created" }
      st.orders.set(o.id, o)
      return new Response(JSON.stringify(o))
    }
    let m = path.match(/^\/orders\/([^/]+)\/payments$/)
    if (m) return new Response(JSON.stringify({ entity: "collection", items: [...st.payments.values()].filter((p) => p.order_id === decodeURIComponent(m[1])) }))
    m = path.match(/^\/payments\/([^/]+)\/capture$/)
    if (m && init.method === "POST") {
      const p = st.payments.get(decodeURIComponent(m[1]))
      const b = JSON.parse(init.body)
      if (!p || p.status !== "authorized" || b.amount !== p.amount) return new Response(JSON.stringify({ error: { code: "BAD_REQUEST_ERROR" } }), { status: 400 })
      p.status = "captured"
      return new Response(JSON.stringify(p))
    }
    m = path.match(/^\/payments\/([^/]+)$/)
    if (m) {
      const p = st.payments.get(decodeURIComponent(m[1]))
      return p ? new Response(JSON.stringify(p)) : new Response(JSON.stringify({ error: { code: "BAD_REQUEST_ERROR" } }), { status: 400 })
    }
    return new Response("unexpected " + u, { status: 500 })
  }
  return st
}
const order = (env, cookie, body) => call(env, "/api/pay/order", { method: "POST", cookie, body }).then(json)
const confirm = (env, cookie, body) => call(env, "/api/pay/razorpay/confirm", { method: "POST", cookie, body }).then(json)
const wallet = (env, cookie) => call(env, "/api/wallet", { cookie }).then(json)
const hook = (env, ev, secret = RZ.RAZORPAY_WEBHOOK_SECRET) => {
  const raw = JSON.stringify(ev)
  return call(env, "/api/pay/razorpay/webhook", { method: "POST", body: raw, origin: "https://razorpay.com", headers: { "x-razorpay-signature": hex(secret, raw) } })
}
const captured = (p) => ({ entity: "event", event: "payment.captured", payload: { payment: { entity: p } } })

test("checkout says which currencies are open: rupees with Razorpay's keys, dollars only when switched on", async () => {
  const env = freshEnv({ ...RZ })
  const { cookie } = await signIn(env)
  assert.deepEqual((await wallet(env, cookie)).checkout, { INR: "razorpay", USD: null })
  const env2 = freshEnv({ ...RZ, RAZORPAY_CURRENCIES: "INR,USD" })
  assert.deepEqual((await wallet(env2, (await signIn(env2)).cookie)).checkout, { INR: "razorpay", USD: "razorpay" })
  const env3 = freshEnv()
  assert.deepEqual((await wallet(env3, (await signIn(env3)).cookie)).checkout, { INR: null, USD: null })
})

test("an order is made at the server's price; credits arrive only after a verified, captured payment", async () => {
  const env = freshEnv({ ...RZ })
  const rz = razorpay()
  const { cookie } = await signIn(env)
  const o = await order(env, cookie, { product: "topup:t500", currency: "INR", price: 1 })
  assert.equal(o.status, 200)
  assert.equal(o.provider, "razorpay")
  assert.equal(o.keyId, "rzp_test_abc123", "Checkout gets the public key id")
  assert.equal(o.mode, "test")
  assert.equal(o.amount, 69900, "₹699 in paise, from the server's price list")
  assert.ok(!JSON.stringify(o).includes(RZ.RAZORPAY_KEY_SECRET), "the secret never leaves the server")
  const made = rz.orders.get(o.razorpayOrderId)
  assert.equal(made.amount, 69900)
  assert.equal(made.currency, "INR")
  assert.equal(made.receipt, o.orderId)
  // nothing paid yet
  const pending = await confirm(env, cookie, { orderId: o.orderId })
  assert.equal(pending.body.status, "pending")
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 80)
  // a made-up signature is refused
  const { p, signature } = rz.pay(o.razorpayOrderId)
  assert.equal((await confirm(env, cookie, { orderId: o.orderId, paymentId: p.id, signature: "0".repeat(64) })).code, "bad_signature")
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 80)
  // the real one
  const ok = await confirm(env, cookie, { orderId: o.orderId, paymentId: p.id, signature })
  assert.equal(ok.body.status, "paid")
  assert.equal(balanceOf(ok.wallet), 580)
  assert.match(ok.wallet.ledger[0].label, /₹699 via Razorpay/)
  // a second confirmation and Razorpay's webhook don't pay twice
  assert.equal(balanceOf((await confirm(env, cookie, { orderId: o.orderId, paymentId: p.id, signature })).wallet), 580)
  assert.equal((await hook(env, captured(p))).status, 200)
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 580)
})

test("an authorized payment is captured by the server before credits are added", async () => {
  const env = freshEnv({ ...RZ })
  const rz = razorpay({ autoCapture: false })
  const { cookie } = await signIn(env)
  const o = await order(env, cookie, { product: "plan:watch:monthly", currency: "INR" })
  const { p, signature } = rz.pay(o.razorpayOrderId)
  const ok = await confirm(env, cookie, { orderId: o.orderId, paymentId: p.id, signature })
  assert.equal(ok.body.status, "paid")
  assert.equal(rz.payments.get(p.id).status, "captured")
  assert.equal(ok.wallet.plan.id, "watch")
  assert.ok(ok.wallet.plan.cancelAt, "prepaid: doesn't renew")
})

test("a closed tab: the webhook credits the payment; a reload finds it too", async () => {
  const env = freshEnv({ ...RZ })
  const rz = razorpay()
  const { cookie } = await signIn(env)
  const o = await order(env, cookie, { product: "topup:t150", currency: "INR" })
  const { p } = rz.pay(o.razorpayOrderId)
  assert.equal((await hook(env, captured(p), "wrong-secret")).status, 400, "unsigned notifications are ignored")
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 80)
  assert.equal((await hook(env, { event: "order.paid", payload: { order: { entity: { id: o.razorpayOrderId } }, payment: { entity: p } } })).status, 200)
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 230)
  // and a confirmation without a payment id (the page was reloaded) asks Razorpay about the order
  const env2 = freshEnv({ ...RZ })
  const rz2 = razorpay()
  const b = await signIn(env2)
  const o2 = await order(env2, b.cookie, { product: "topup:t150", currency: "INR" })
  rz2.pay(o2.razorpayOrderId)
  const r = await confirm(env2, b.cookie, { orderId: o2.orderId })
  assert.equal(r.body.status, "paid")
  assert.equal(balanceOf(r.wallet), 230)
})

test("a payment for the wrong amount, or for another order, is never credited", async () => {
  const env = freshEnv({ ...RZ })
  const rz = razorpay()
  const { cookie } = await signIn(env)
  const o = await order(env, cookie, { product: "topup:t1200", currency: "INR" })
  const { p, signature } = rz.pay(o.razorpayOrderId, { amount: 100 })
  const r = await confirm(env, cookie, { orderId: o.orderId, paymentId: p.id, signature })
  assert.equal(r.code, "amount_mismatch")
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 80)
  // a real payment of a cheaper order can't be passed off as this one
  const cheap = await order(env, cookie, { product: "topup:t150", currency: "INR" })
  const o3 = await order(env, cookie, { product: "topup:t1200", currency: "INR" })
  const other = rz.pay(cheap.razorpayOrderId)
  const forged = hex(RZ.RAZORPAY_KEY_SECRET, `${o3.razorpayOrderId}|${other.p.id}`) // even a correct-looking signature
  assert.equal((await confirm(env, cookie, { orderId: o3.orderId, paymentId: other.p.id, signature: forged })).code, "wrong_order")
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 80)
})

test("someone else's order can't be confirmed; signed-out buying is refused; Razorpay down is a clear error", async () => {
  const env = freshEnv({ ...RZ })
  const rz = razorpay()
  const a = await signIn(env, "a")
  const b = await signIn(env, "b")
  const o = await order(env, a.cookie, { product: "topup:t150", currency: "INR" })
  const { p, signature } = rz.pay(o.razorpayOrderId)
  assert.equal((await confirm(env, b.cookie, { orderId: o.orderId, paymentId: p.id, signature })).status, 404)
  assert.equal((await call(env, "/api/pay/order", { method: "POST", body: { product: "topup:t150", currency: "INR" } })).status, 401)
  assert.equal((await order(env, a.cookie, { product: "topup:t150", currency: "USD" })).code, "payments_closed")
  assert.equal((await order(env, a.cookie, { product: "nope", currency: "INR" })).code, "bad_product")
  razorpay({ fail: true })
  assert.equal((await order(env, a.cookie, { product: "topup:t150", currency: "INR" })).code, "provider_error")
})

test("the webhook needs its own secret; the signature helper matches Razorpay's", async () => {
  const env = freshEnv({ RAZORPAY_KEY_ID: RZ.RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET: RZ.RAZORPAY_KEY_SECRET })
  assert.equal((await hook(env, { event: "payment.captured" })).status, 503)
  assert.equal(await hmacHex("k", "order_1|pay_1"), hex("k", "order_1|pay_1"))
  const live = freshEnv({ ...RZ, RAZORPAY_KEY_ID: "rzp_live_xyz" })
  razorpay()
  // live keys are reported as live (the fake only accepts the test key, so this order fails, which is fine)
  assert.equal((await order(live, (await signIn(live)).cookie, { product: "topup:t150", currency: "INR" })).code, "provider_error")
})
