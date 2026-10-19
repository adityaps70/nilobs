// Payments through Cashfree: credits only once Cashfree says an order is paid, each payment once.
import test from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { balanceOf, call, fakeProviders, freshEnv, json, signIn } from "./helpers.mjs"
import { cashfreeSignature } from "../worker/pay.js"

const CF = { CASHFREE_APP_ID: "cf-app-123", CASHFREE_SECRET_KEY: "cf-secret" }
const PHONE = "9876543210"
const sign = (ts, raw, secret = CF.CASHFREE_SECRET_KEY) => createHmac("sha256", secret).update(ts + raw).digest("base64")

/** A fake Cashfree that remembers orders. `env` decides which environment the keys belong to. */
function cashfree({ keysFor = "production", fail = false } = {}) {
  const st = { orders: new Map(), calls: [] }
  fakeProviders.handler = async (u, init = {}) => {
    const host = u.startsWith("https://api.cashfree.com/") ? "production" : "sandbox"
    st.calls.push({ host, u, init })
    const h = init.headers || {}
    if (h["x-client-id"] !== CF.CASHFREE_APP_ID || h["x-client-secret"] !== CF.CASHFREE_SECRET_KEY || host !== keysFor)
      return new Response(JSON.stringify({ message: "authentication Failed", code: "request_failed", type: "authentication_error" }), { status: 401 })
    if (!h["x-api-version"]) return new Response(JSON.stringify({ message: "x-api-version missing" }), { status: 400 })
    if (fail) return new Response(JSON.stringify({ message: "down" }), { status: 500 })
    const path = u.replace(/^https:\/\/[^/]+\/pg/, "")
    if (path === "/orders" && init.method === "POST") {
      const b = JSON.parse(init.body)
      const o = { ...b, cf_order_id: "cf_" + st.orders.size, payment_session_id: "session_" + b.order_id, order_status: "ACTIVE", idem: h["x-idempotency-key"] }
      st.orders.set(b.order_id, o)
      return new Response(JSON.stringify(o))
    }
    const m = path.match(/^\/orders\/(.+)$/)
    if (m) {
      const o = st.orders.get(decodeURIComponent(m[1]))
      return o ? new Response(JSON.stringify(o)) : new Response(JSON.stringify({ message: "order not found" }), { status: 404 })
    }
    return new Response("unexpected " + u, { status: 500 })
  }
  return st
}
const order = (env, cookie, body) => call(env, "/api/pay/order", { method: "POST", cookie, body: { phone: PHONE, ...body } }).then(json)
const confirm = (env, cookie, orderId) => call(env, "/api/pay/cashfree/confirm", { method: "POST", cookie, body: { orderId } }).then(json)
const wallet = (env, cookie) => call(env, "/api/wallet", { cookie }).then(json)
const hook = (env, ev, { secret, ts = String(Date.now()) } = {}) => {
  const raw = JSON.stringify(ev)
  return call(env, "/api/pay/cashfree/webhook", { method: "POST", body: raw, origin: "https://cashfree.com", headers: { "x-webhook-timestamp": ts, "x-webhook-signature": sign(ts, raw, secret) } })
}
const success = (o, amount = o.order_amount, currency = o.order_currency) => ({
  type: "PAYMENT_SUCCESS_WEBHOOK",
  event_time: new Date().toISOString(),
  data: { order: { order_id: o.order_id, order_amount: o.order_amount, order_currency: o.order_currency }, payment: { cf_payment_id: 555, payment_status: "SUCCESS", payment_amount: amount, payment_currency: currency } },
})

test("checkout says which currencies are open: rupees with Cashfree's keys, dollars only when switched on", async () => {
  const env = freshEnv({ ...CF })
  const { cookie } = await signIn(env)
  assert.deepEqual((await wallet(env, cookie)).checkout, { INR: "cashfree", USD: null })
  const env2 = freshEnv({ ...CF, CASHFREE_CURRENCIES: "INR,USD" })
  assert.deepEqual((await wallet(env2, (await signIn(env2)).cookie)).checkout, { INR: "cashfree", USD: "cashfree" })
  const env3 = freshEnv()
  assert.deepEqual((await wallet(env3, (await signIn(env3)).cookie)).checkout, { INR: null, USD: null })
})

test("an order is made at the server's price, with the phone, return and notify addresses; secrets stay on the server", async () => {
  const st = cashfree()
  const env = freshEnv({ ...CF })
  const { cookie } = await signIn(env)
  assert.equal((await call(env, "/api/pay/order", { method: "POST", body: { product: "topup:t500", currency: "INR", phone: PHONE } })).status, 401)
  assert.equal((await order(env, cookie, { product: "topup:t9999", currency: "INR" })).status, 400)
  const noPhone = await order(env, cookie, { product: "topup:t500", currency: "INR", phone: "123" })
  assert.equal(noPhone.status, 400)
  assert.equal(noPhone.code, "bad_phone")
  const o = await order(env, cookie, { product: "topup:t500", currency: "INR", amount: 1, order_amount: 1, phone: "98765 43210" })
  assert.equal(o.status, 200)
  assert.equal(o.provider, "cashfree")
  assert.equal(o.mode, "production")
  assert.equal(o.sessionId, "session_" + o.orderId)
  assert.ok(!JSON.stringify(o).includes("cf-secret"), "the secret never reaches the browser")
  const sent = st.orders.get(o.orderId)
  assert.equal(sent.order_amount, 699, "₹699, whatever the browser sent")
  assert.equal(sent.order_currency, "INR")
  assert.equal(sent.customer_details.customer_phone, PHONE)
  assert.match(sent.customer_details.customer_id, /^[A-Za-z0-9]{3,50}$/)
  assert.equal(sent.customer_details.customer_email, "g-1@example.com")
  assert.equal(sent.order_meta.return_url, `https://nilobs.com/?checkout=cashfree&order_id=${o.orderId}#app/wallet`)
  assert.equal(sent.order_meta.notify_url, "https://nilobs.com/api/pay/cashfree/webhook")
  assert.equal(sent.idem, o.orderId, "idempotency key = our order id")
  assert.match(o.orderId, /^[A-Za-z0-9_-]{3,45}$/)
  const c = st.calls.at(-1)
  assert.equal(c.init.headers["x-api-version"], "2025-01-01")
})

test("test keys are found to belong to the sandbox, and the browser is told to open the sandbox checkout", async () => {
  const st = cashfree({ keysFor: "sandbox" })
  const env = freshEnv({ ...CF })
  const { cookie } = await signIn(env)
  const o = await order(env, cookie, { product: "topup:t150", currency: "INR" })
  assert.equal(o.status, 200)
  assert.equal(o.mode, "sandbox")
  const before = st.calls.length
  await order(env, cookie, { product: "topup:t150", currency: "INR" })
  assert.equal(st.calls.length - before, 1, "remembered: straight to the sandbox next time")
  // CASHFREE_ENV fixes it without guessing
  cashfree({ keysFor: "sandbox" })
  const env2 = freshEnv({ ...CF, CASHFREE_ENV: "production" })
  assert.equal((await order(env2, (await signIn(env2)).cookie, { product: "topup:t150", currency: "INR" })).status, 502)
})

test("confirming: credited only when Cashfree says PAID, once, and only for the buyer", async () => {
  const st = cashfree()
  const env = freshEnv({ ...CF })
  const { cookie } = await signIn(env)
  const o = await order(env, cookie, { product: "topup:t500", currency: "INR" })
  const pending = await confirm(env, cookie, o.orderId)
  assert.equal(pending.status, 200)
  assert.equal(pending.body.status, "pending")
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 80)
  assert.equal((await confirm(env, cookie, "pay_madeup000000000000")).status, 404)
  st.orders.get(o.orderId).order_status = "PAID"
  const other = await signIn(env, "g-2")
  assert.equal((await confirm(env, other.cookie, o.orderId)).status, 404, "someone else's order")
  const paid = await confirm(env, cookie, o.orderId)
  assert.equal(paid.body.status, "paid")
  assert.equal(balanceOf(paid.wallet), 580)
  assert.match(paid.wallet.ledger[0].label, /₹699 via Cashfree/)
  assert.equal(balanceOf((await confirm(env, cookie, o.orderId)).wallet), 580, "confirming again adds nothing")
  assert.equal((await hook(env, success(st.orders.get(o.orderId)))).status, 200)
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 580, "and nor does Cashfree's notification")
  // an expired order says so
  const o2 = await order(env, cookie, { product: "pass", currency: "INR" })
  st.orders.get(o2.orderId).order_status = "EXPIRED"
  assert.equal((await confirm(env, cookie, o2.orderId)).body.status, "failed")
})

test("Cashfree's notification credits a closed tab; a bad signature or wrong amount doesn't", async () => {
  const st = cashfree()
  const env = freshEnv({ ...CF })
  const { cookie } = await signIn(env)
  const o = await order(env, cookie, { product: "pass", currency: "INR" })
  const sent = st.orders.get(o.orderId)
  assert.equal((await hook(env, success(sent), { secret: "wrong" })).status, 400)
  const raw = JSON.stringify(success(sent))
  assert.equal((await call(env, "/api/pay/cashfree/webhook", { method: "POST", body: raw })).status, 400, "no signature")
  assert.equal((await hook(env, success(sent, 1))).status, 200, "answered so Cashfree stops retrying")
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 80, "₹1 doesn't buy a pass")
  assert.equal(env.DB.sqlite.prepare("SELECT status FROM payments WHERE id = ?").get(o.orderId).status, "mismatch")
  assert.equal((await confirm(env, cookie, o.orderId)).code, "amount_mismatch")
  // a failed payment is ignored; a correct one for a fresh order is credited
  const o2 = await order(env, cookie, { product: "pass", currency: "INR" })
  const s2 = st.orders.get(o2.orderId)
  assert.equal((await hook(env, { ...success(s2), type: "PAYMENT_FAILED_WEBHOOK", data: { ...success(s2).data, payment: { payment_status: "FAILED" } } })).status, 200)
  assert.ok(!(await wallet(env, cookie)).wallet.pass)
  assert.equal((await hook(env, success(s2, "1199.00"))).status, 200)
  const w = (await wallet(env, cookie)).wallet
  assert.ok(w.pass?.until > Date.now(), "pass active")
  // an order this server never made
  assert.equal((await hook(env, success({ order_id: "pay_unknown", order_amount: 1, order_currency: "INR" }))).status, 200)
  // the signature is Cashfree's scheme: base64 HMAC-SHA256 of timestamp + raw body
  assert.equal(await cashfreeSignature("k", "1700000000000", '{"a":1}'), createHmac("sha256", "k").update('1700000000000{"a":1}').digest("base64"))
})

test("dollars go through Cashfree only when switched on", async () => {
  const st = cashfree()
  const env = freshEnv({ ...CF })
  const { cookie } = await signIn(env)
  const closed = await order(env, cookie, { product: "topup:t150", currency: "USD" })
  assert.equal(closed.status, 503)
  assert.match(closed.error, /pay in rupees/)
  const env2 = freshEnv({ ...CF, CASHFREE_CURRENCIES: "INR,USD" })
  const c2 = (await signIn(env2)).cookie
  const o = await order(env2, c2, { product: "topup:t150", currency: "USD" })
  const sent = st.orders.get(o.orderId)
  assert.equal(sent.order_amount, 3)
  assert.equal(sent.order_currency, "USD")
  sent.order_status = "PAID"
  const p = await confirm(env2, c2, o.orderId)
  assert.equal(balanceOf(p.wallet), 230)
  assert.match(p.wallet.ledger[0].label, /\$3 via Cashfree/)
})

test("plans are prepaid: the same plan extends, a lower one waits, a higher one starts now", async () => {
  const st = cashfree()
  const env = freshEnv({ ...CF })
  const { cookie } = await signIn(env)
  const pay = async (product) => {
    const o = await order(env, cookie, { product, currency: "INR" })
    if (o.status !== 200) return o
    st.orders.get(o.orderId).order_status = "PAID"
    return confirm(env, cookie, o.orderId)
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
  const st = cashfree()
  const env = freshEnv({ ...CF })
  const { cookie } = await signIn(env)
  const watch = await order(env, cookie, { product: "plan:watch:monthly", currency: "INR" })
  const command = await order(env, cookie, { product: "plan:command:monthly", currency: "INR" })
  st.orders.get(command.orderId).order_status = "PAID"
  st.orders.get(watch.orderId).order_status = "PAID"
  const c = await confirm(env, cookie, command.orderId)
  const before = balanceOf(c.wallet)
  const w = await confirm(env, cookie, watch.orderId)
  assert.equal(w.wallet.plan.id, "command")
  assert.equal(balanceOf(w.wallet) - before, 400, "Watch's credits added, and they don't expire")
  assert.equal(w.wallet.buckets.at(-1).expires, null)
})

test("a Cashfree error doesn't create an order; payments closed without keys; other sites can't start one", async () => {
  cashfree({ fail: true })
  const env = freshEnv({ ...CF })
  const { cookie } = await signIn(env)
  assert.equal((await order(env, cookie, { product: "topup:t150", currency: "INR" })).status, 502)
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM payments").get().n, 0)
  const env2 = freshEnv()
  const c2 = (await signIn(env2)).cookie
  const closed = await order(env2, c2, { product: "topup:t150", currency: "INR" })
  assert.equal(closed.status, 503)
  assert.equal(closed.code, "payments_closed")
  assert.equal((await call(env2, "/api/pay/cashfree/webhook", { method: "POST", body: "{}" })).status, 503, "no secret: refused")
  assert.equal((await call(env, "/api/pay/order", { method: "POST", cookie, origin: "https://evil.example", body: { product: "topup:t150", currency: "INR", phone: PHONE } })).status, 403)
})
