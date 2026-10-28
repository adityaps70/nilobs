// Auto-renewing plans through Razorpay Subscriptions: each charge credited once, renewals from the webhook,
// turning it off, and nothing charged after an account is deleted.
import test from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { call, fakeProviders, freshEnv, json, signIn } from "./helpers.mjs"

const RZ = { RAZORPAY_KEY_ID: "rzp_test_abc123", RAZORPAY_KEY_SECRET: "rz-secret", RAZORPAY_WEBHOOK_SECRET: "wh-secret" }
const hex = (secret, text) => createHmac("sha256", secret).update(text).digest("hex")
const r = (x, status = 200) => new Response(JSON.stringify(x), { status })

/** A fake Razorpay with plans, subscriptions, invoices and payments. `off`: Subscriptions not switched on. */
function razorpay({ off = false, rejectDaily360 = false } = {}) {
  const st = { plans: new Map(), subs: new Map(), payments: new Map(), invoices: [], calls: [] }
  /** The buyer pays the subscription's first (or next) charge. */
  st.charge = (subId, { amount, status = "captured" } = {}) => {
    const s = st.subs.get(subId)
    const plan = st.plans.get(s.plan_id)
    const id = "pay_sub" + st.payments.size
    const p = { id, entity: "payment", order_id: "order_inv" + st.payments.size, invoice_id: "inv_" + st.payments.size, amount: amount ?? plan.item.amount, currency: "INR", status }
    st.payments.set(id, p)
    if (status === "captured") {
      st.invoices.push({ id: p.invoice_id, subscription_id: subId, payment_id: id, status: "paid" })
      s.status = "active"
      s.paid_count++
    }
    return { p, signature: hex(RZ.RAZORPAY_KEY_SECRET, `${id}|${subId}`) }
  }
  fakeProviders.handler = async (u, init = {}) => {
    st.calls.push({ u, init })
    if ((init.headers || {}).authorization !== "Basic " + Buffer.from(`${RZ.RAZORPAY_KEY_ID}:${RZ.RAZORPAY_KEY_SECRET}`).toString("base64")) return r({ error: { description: "Authentication failed" } }, 401)
    const path = u.replace("https://api.razorpay.com/v1", "")
    if (off && path.startsWith("/plans")) return r({ error: { code: "BAD_REQUEST_ERROR", description: "The requested URL was not found on the server." } }, 400)
    if (path.startsWith("/plans?") && (init.method || "GET") === "GET") return r({ entity: "collection", count: st.plans.size, items: [...st.plans.values()].slice(0, 1) })
    if (path === "/plans" && init.method === "POST") {
      const b = JSON.parse(init.body)
      if (rejectDaily360 && b.period === "daily" && b.interval > 300) return r({ error: { code: "BAD_REQUEST_ERROR", description: "interval is too large" } }, 400)
      const p = { id: "plan_" + st.plans.size, entity: "plan", period: b.period, interval: b.interval, item: b.item }
      st.plans.set(p.id, p)
      return r(p)
    }
    if (path === "/orders" && init.method === "POST") return r({ id: "order_x", entity: "order", ...JSON.parse(init.body), status: "created" })
    if (path === "/subscriptions" && init.method === "POST") {
      const b = JSON.parse(init.body)
      if (!st.plans.has(b.plan_id) || !b.total_count) return r({ error: { description: "bad" } }, 400)
      const s = { id: "sub_" + st.subs.size, entity: "subscription", plan_id: b.plan_id, total_count: b.total_count, notes: b.notes, status: "created", paid_count: 0, customer_notify: b.customer_notify, short_url: "https://rzp.io/i/x" }
      st.subs.set(s.id, s)
      return r(s)
    }
    let m = path.match(/^\/subscriptions\/([^/]+)\/cancel$/)
    if (m && init.method === "POST") {
      const s = st.subs.get(decodeURIComponent(m[1]))
      if (!s || ["cancelled", "expired"].includes(s.status)) return r({ error: { description: `Subscription is not cancellable in ${s?.status} status.` } }, 400)
      assert.equal(JSON.parse(init.body).cancel_at_cycle_end, false)
      s.status = "cancelled"
      return r(s)
    }
    m = path.match(/^\/subscriptions\/([^/?]+)$/)
    if (m) {
      const s = st.subs.get(decodeURIComponent(m[1]))
      return s ? r(s) : r({ error: {} }, 400)
    }
    m = path.match(/^\/invoices\?subscription_id=(.+)$/)
    if (m) return r({ entity: "collection", items: st.invoices.filter((i) => i.subscription_id === decodeURIComponent(m[1])) })
    m = path.match(/^\/payments\/([^/]+)$/)
    if (m) {
      const p = st.payments.get(decodeURIComponent(m[1]))
      return p ? r(p) : r({ error: {} }, 400)
    }
    return r({ error: { description: "unexpected " + path } }, 500)
  }
  return st
}
const post = (env, cookie, path, body = {}) => call(env, path, { method: "POST", cookie, body }).then(json)
const get = (env, cookie, path) => call(env, path, { cookie }).then(json)
const hook = (env, ev) => {
  const raw = JSON.stringify(ev)
  return call(env, "/api/pay/razorpay/webhook", { method: "POST", body: raw, origin: "https://razorpay.com", headers: { "x-razorpay-signature": hex(RZ.RAZORPAY_WEBHOOK_SECRET, raw) } })
}
const charged = (sub, p) => ({ entity: "event", event: "subscription.charged", payload: { subscription: { entity: { id: sub.id, status: "active", paid_count: sub.paid_count } }, payment: { entity: p } } })
const subEvent = (event, id, status) => ({ entity: "event", event, payload: { subscription: { entity: { id, status } } } })

test("auto-renew: offered when Razorpay has Subscriptions; the first charge starts the plan once, renewals come by webhook", async () => {
  const env = freshEnv({ ...RZ })
  const rz = razorpay()
  const { cookie } = await signIn(env)
  const before = await get(env, cookie, "/api/pay/subscription")
  assert.equal(before.available, "razorpay")
  assert.equal(before.sub, null)
  // only plans renew; the price is the server's
  assert.equal((await post(env, cookie, "/api/pay/subscribe", { product: "topup:t500" })).status, 400)
  const s = await post(env, cookie, "/api/pay/subscribe", { product: "plan:watch:monthly", price: 1 })
  assert.equal(s.status, 200)
  assert.equal(s.provider, "razorpay")
  assert.match(s.subscriptionId, /^sub_/)
  assert.equal(s.keyId, RZ.RAZORPAY_KEY_ID)
  assert.equal(s.amount, 49900)
  const plan = [...rz.plans.values()][0]
  assert.deepEqual([plan.period, plan.interval, plan.item.amount, plan.item.currency], ["daily", 30, 49900, "INR"], "repeats every 30 days, like the plan")
  const sub = rz.subs.get(s.subscriptionId)
  assert.equal(sub.total_count, 60)
  assert.equal(sub.notes.product, "plan:watch:monthly")
  // the plan is made once and remembered
  assert.equal((await post(env, cookie, "/api/pay/subscribe", { product: "plan:watch:monthly" })).status, 200)
  assert.equal(rz.plans.size, 1)

  // Checkout's handler: a forged signature is refused, the real one credits the plan
  const { p, signature } = rz.charge(s.subscriptionId)
  assert.equal((await post(env, cookie, "/api/pay/razorpay/subscription/confirm", { subscriptionId: s.subscriptionId, paymentId: p.id, signature: "0".repeat(64) })).code, "bad_signature")
  const ok = await post(env, cookie, "/api/pay/razorpay/subscription/confirm", { subscriptionId: s.subscriptionId, paymentId: p.id, signature })
  assert.equal(ok.body.status, "paid")
  assert.equal(ok.wallet.plan.id, "watch")
  assert.equal(ok.wallet.plan.renewing, true)
  assert.equal(ok.sub.on, true)
  assert.equal(ok.sub.status, "active")
  const term = ok.wallet.plan.term
  // the webhook for the same charge changes nothing
  assert.equal((await hook(env, charged(sub, p))).status, 200)
  const w1 = (await get(env, cookie, "/api/wallet")).wallet
  assert.equal(w1.plan.term, term)
  assert.equal(w1.ledger.filter((e) => /via Razorpay \(auto-renew\)/.test(e.label)).length, 1, "credited once")
  // a renewal 30 days on, from the webhook only (no browser)
  const next = rz.charge(s.subscriptionId)
  await hook(env, charged(sub, next.p))
  await hook(env, charged(sub, next.p))
  const w2 = (await get(env, cookie, "/api/wallet")).wallet
  assert.equal(w2.plan.term, term + 30 * 86400000, "extended by 30 days, once")
  const rec = await get(env, cookie, "/api/pay/receipts")
  assert.equal(rec.receipts.length, 2, "a receipt for each charge")
  assert.ok(rec.receipts.every((x) => x.amount === 499 && /Watchkeeper/.test(x.item)))
  const st = await get(env, cookie, "/api/pay/subscription")
  assert.equal(st.sub.paidCount, 2)

  // only one auto-renew at a time, and no one-off purchase of another plan while it's on
  assert.equal((await post(env, cookie, "/api/pay/subscribe", { product: "plan:command:monthly" })).code, "already_on")
  const other = await post(env, cookie, "/api/pay/order", { product: "plan:command:monthly", currency: "INR" })
  assert.equal(other.status, 409)
  assert.match(other.error, /Turn it off/)
  // top-ups are fine
  assert.equal((await post(env, cookie, "/api/pay/order", { product: "topup:t150", currency: "INR" })).status, 200)
})

test("auto-renew: a payment Checkout didn't hand back is found through the subscription's invoices", async () => {
  const env = freshEnv({ ...RZ })
  const rz = razorpay()
  const { cookie } = await signIn(env)
  const s = await post(env, cookie, "/api/pay/subscribe", { product: "plan:command:annual" })
  const plan = [...rz.plans.values()][0]
  assert.deepEqual([plan.period, plan.interval, plan.item.amount], ["daily", 360, 1299000])
  assert.equal(rz.subs.get(s.subscriptionId).total_count, 5)
  // nothing paid yet: pending
  assert.equal((await post(env, cookie, "/api/pay/razorpay/subscription/confirm", { subscriptionId: s.subscriptionId })).body.status, "pending")
  rz.charge(s.subscriptionId)
  const ok = await post(env, cookie, "/api/pay/razorpay/subscription/confirm", { subscriptionId: s.subscriptionId })
  assert.equal(ok.body.status, "paid")
  assert.equal(ok.wallet.plan.id, "command")
  assert.equal(ok.wallet.plan.cycle, "annual")
  // someone else can't confirm it
  const b = await signIn(env, "g-2")
  assert.equal((await call(env, "/api/pay/razorpay/subscription/confirm", { method: "POST", cookie: b.cookie, body: { subscriptionId: s.subscriptionId } })).status, 404)
})

test("auto-renew: yearly falls back to Razorpay's yearly period if 360 days isn't accepted", async () => {
  const env = freshEnv({ ...RZ })
  const rz = razorpay({ rejectDaily360: true })
  const { cookie } = await signIn(env)
  assert.equal((await post(env, cookie, "/api/pay/subscribe", { product: "plan:watch:annual" })).status, 200)
  assert.deepEqual([...rz.plans.values()].map((p) => [p.period, p.interval]), [["yearly", 1]])
})

test("auto-renew: turning it off stops Razorpay at once; the plan runs to the end of what's paid", async () => {
  const env = freshEnv({ ...RZ })
  const rz = razorpay()
  const { cookie } = await signIn(env)
  const s = await post(env, cookie, "/api/pay/subscribe", { product: "plan:watch:monthly" })
  const { p, signature } = rz.charge(s.subscriptionId)
  await post(env, cookie, "/api/pay/razorpay/subscription/confirm", { subscriptionId: s.subscriptionId, paymentId: p.id, signature })
  // a renewal first, by webhook
  const sub = rz.subs.get(s.subscriptionId)
  await hook(env, charged(sub, rz.charge(s.subscriptionId).p))
  const ok = await get(env, cookie, "/api/wallet")
  const off = await post(env, cookie, "/api/pay/subscription/cancel")
  assert.equal(off.sub.status, "cancelled")
  assert.equal(off.sub.on, false)
  assert.equal(rz.subs.get(s.subscriptionId).status, "cancelled", "cancelled at Razorpay")
  assert.equal(off.wallet.plan.id, "watch")
  assert.equal(off.wallet.plan.renewing, undefined)
  assert.equal(off.wallet.plan.term, ok.wallet.plan.term, "still paid up to the same day")
  // a late "cancelled" webhook and a second cancel are harmless; a new auto-renew can start
  await hook(env, subEvent("subscription.cancelled", s.subscriptionId, "cancelled"))
  assert.equal((await post(env, cookie, "/api/pay/subscription/cancel")).sub.status, "cancelled")
  assert.equal((await post(env, cookie, "/api/pay/subscribe", { product: "plan:watch:monthly" })).status, 200)
})

test("auto-renew: Razorpay giving up on renewals (halted) ends it; the plan isn't kept waiting", async () => {
  const env = freshEnv({ ...RZ })
  const rz = razorpay()
  const { cookie } = await signIn(env)
  const s = await post(env, cookie, "/api/pay/subscribe", { product: "plan:watch:monthly" })
  const { p, signature } = rz.charge(s.subscriptionId)
  await post(env, cookie, "/api/pay/razorpay/subscription/confirm", { subscriptionId: s.subscriptionId, paymentId: p.id, signature })
  await hook(env, subEvent("subscription.pending", s.subscriptionId, "pending"))
  let st = await get(env, cookie, "/api/pay/subscription")
  assert.equal(st.sub.status, "pending")
  assert.equal(st.sub.on, true, "Razorpay is still retrying")
  await hook(env, subEvent("subscription.halted", s.subscriptionId, "halted"))
  st = await get(env, cookie, "/api/pay/subscription")
  assert.equal(st.sub.on, false)
  assert.equal((await get(env, cookie, "/api/wallet")).wallet.plan.renewing, undefined)
  // a stray "authenticated" after "active" doesn't undo anything; unknown subscriptions are ignored
  assert.equal((await hook(env, subEvent("subscription.activated", "sub_nobody", "active"))).status, 200)
})

test("auto-renew: deleting the account cancels it at Razorpay first", async () => {
  const env = freshEnv({ ...RZ })
  const rz = razorpay()
  const { cookie } = await signIn(env)
  const s = await post(env, cookie, "/api/pay/subscribe", { product: "plan:watch:monthly" })
  const { p, signature } = rz.charge(s.subscriptionId)
  await post(env, cookie, "/api/pay/razorpay/subscription/confirm", { subscriptionId: s.subscriptionId, paymentId: p.id, signature })
  assert.equal((await call(env, "/api/me", { method: "DELETE", cookie })).status, 200)
  assert.equal(rz.subs.get(s.subscriptionId).status, "cancelled")
})

test("auto-renew: not offered when Subscriptions is off at Razorpay (remembered), nor without Razorpay", async () => {
  const env = freshEnv({ ...RZ })
  const rz = razorpay({ off: true })
  const { cookie } = await signIn(env)
  assert.equal((await get(env, cookie, "/api/pay/subscription")).available, null)
  const n = rz.calls.length
  assert.equal((await get(env, cookie, "/api/pay/subscription")).available, null)
  assert.equal(rz.calls.length, n, "asked once, then remembered")
  assert.equal((await post(env, cookie, "/api/pay/subscribe", { product: "plan:watch:monthly" })).code, "subscriptions_off")
  // switched off by setting
  const env2 = freshEnv({ ...RZ, RAZORPAY_SUBSCRIPTIONS: "0" })
  razorpay()
  assert.equal((await get(env2, (await signIn(env2)).cookie, "/api/pay/subscription")).available, null)
  // test purchases (no Razorpay): auto-renew is simulated, starts at once and can be turned off
  const env3 = freshEnv({ NILOBS_SIMULATED_CHECKOUT: "1" })
  const c3 = (await signIn(env3)).cookie
  assert.equal((await get(env3, c3, "/api/pay/subscription")).available, "simulated")
  const sim = await post(env3, c3, "/api/pay/subscribe", { product: "plan:watch:monthly" })
  assert.equal(sim.provider, "simulated")
  assert.equal(sim.wallet.plan.id, "watch")
  assert.equal(sim.wallet.plan.renewing, true)
  assert.equal(sim.sub.on, true)
  assert.equal((await post(env3, c3, "/api/pay/subscription/cancel")).sub.on, false)
})
