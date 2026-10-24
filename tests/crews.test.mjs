// Sign-in by email code, crews and fleet plans, certificates, receipts, and the small routes that go with them.
import test from "node:test"
import assert from "node:assert/strict"
import { call, freshEnv, json, signIn, google, CLIENT } from "./helpers.mjs"
import { ROLES } from "../app/src/roles.ts"
import { FLEET, fleetQuote, grantSeat, fresh as freshWallet, PLANS } from "../app/src/economy.ts"
import { certChecks } from "../app/src/cert.ts"
import { topicScore } from "../worker/crews.js"

const DAY = 86400000
const mailbox = () => {
  const sent = []
  return { sent, EMAIL: { send: async (m) => void sent.push(m) } }
}
const codeIn = (m) => (m.subject.match(/\d{6}/) || [""])[0]
const cookieOf = (res) => (res.headers.get("set-cookie") || "").split(";")[0]

/* ---------------- email codes ---------------- */
test("sign in with an email code: one account per address, shared with Google", async () => {
  const box = mailbox()
  const env = freshEnv({ EMAIL: box.EMAIL })
  assert.equal((await call(env, "/api/auth/config").then(json)).email, true)
  assert.equal((await call(env, "/api/auth/email/start", { method: "POST", body: { email: "not an email" } })).status, 400)
  const start = await call(env, "/api/auth/email/start", { method: "POST", body: { email: " Cook@Example.com " } })
  assert.equal(start.status, 200)
  assert.equal(box.sent.length, 1)
  assert.equal(box.sent[0].to, "cook@example.com")
  assert.deepEqual(box.sent[0].from, { email: "signin@nilobs.com", name: "NilObs" })
  const code = codeIn(box.sent[0])
  assert.match(box.sent[0].text, new RegExp(code))
  assert.equal((await call(env, "/api/auth/email/start", { method: "POST", body: { email: "cook@example.com" } })).status, 429, "half a minute between codes")
  // wrong codes count; the fifth ends that code
  const wrong = code === "000000" ? "111111" : "000000"
  for (let i = 0; i < 4; i++) assert.equal((await call(env, "/api/auth/email/verify", { method: "POST", body: { email: "cook@example.com", code: wrong } })).status, 400)
  const last = await call(env, "/api/auth/email/verify", { method: "POST", body: { email: "cook@example.com", code: wrong } }).then(json)
  assert.equal(last.code, "wrong")
  assert.equal((await call(env, "/api/auth/email/verify", { method: "POST", body: { email: "cook@example.com", code } })).status, 429, "too many tries: even the right code is refused")
  // a new code works
  await env.DB.prepare("UPDATE email_codes SET sent_at = 0").run()
  await call(env, "/api/auth/email/start", { method: "POST", body: { email: "cook@example.com" } })
  const code2 = codeIn(box.sent[1])
  const ok = await call(env, "/api/auth/email/verify", { method: "POST", body: { email: "cook@example.com", code: code2 } })
  assert.equal(ok.status, 200)
  const user = (await ok.json()).user
  assert.equal(user.email, "cook@example.com")
  const me = await call(env, "/api/me", { cookie: cookieOf(ok) }).then(json)
  assert.equal(me.user.id, user.id)
  assert.equal((await call(env, "/api/auth/email/verify", { method: "POST", body: { email: "cook@example.com", code: code2 } })).status, 400, "a code works once")
  // later, Google with the same address opens the same account
  const credential = await google.sign({ aud: CLIENT, sub: "g-cook", email: "cook@example.com", name: "Ship Cook" })
  const g = await call(env, "/api/auth/google", { method: "POST", body: { credential } }).then(json)
  assert.equal(g.user.id, user.id)
  assert.equal(g.user.name, "Ship Cook")
  // and the other way round: a Google account first, then a code to its address
  const officer = await signIn(env, "officer")
  await call(env, "/api/auth/email/start", { method: "POST", body: { email: "officer@example.com" } })
  const v = await call(env, "/api/auth/email/verify", { method: "POST", body: { email: "officer@example.com", code: codeIn(box.sent[2]) } }).then(json)
  assert.equal(v.user.id, officer.user.id)
})

test("no email sender set up: the email route says so, Google still works", async () => {
  const env = freshEnv()
  assert.equal((await call(env, "/api/auth/config").then(json)).email, false)
  assert.equal((await call(env, "/api/auth/email/start", { method: "POST", body: { email: "a@b.co" } })).status, 404)
  const failing = freshEnv({ EMAIL: { send: async () => { throw Object.assign(new Error("not verified"), { code: "E_SENDER_NOT_VERIFIED" }) } } })
  const r = await call(failing, "/api/auth/email/start", { method: "POST", body: { email: "a@b.co" } }).then(json)
  assert.equal(r.status, 502)
  assert.match(r.error, /Couldn't send/)
})

/* ---------------- crews and fleets ---------------- */
const post = (env, cookie, body) => call(env, "/api/crews", { method: "POST", cookie, body }).then(json)
const get = (env, cookie, path) => call(env, path, { cookie }).then(json)

test("fleet maths: prices, renewals, extra seats and seats on a wallet", () => {
  const now = Date.parse("2026-11-01T00:00:00Z")
  const q = fleetQuote("new", 5, "monthly", "INR", null, now)
  assert.equal(q.ok && q.amount, 5 * FLEET.price.INR.monthly)
  assert.equal(fleetQuote("new", 4, "monthly", "INR", null, now).ok, false, "at least five seats")
  const a = fleetQuote("new", 10, "annual", "USD", null, now)
  assert.equal(a.ok && a.amount, 10 * FLEET.price.USD.annual)
  const active = { seats: 5, until: now + 10 * DAY, cycle: "monthly" }
  assert.equal(fleetQuote("new", 5, "monthly", "INR", active, now).ok, false)
  const add = fleetQuote("add", 2, "monthly", "INR", active, now)
  assert.equal(add.ok && add.amount, 2 * FLEET.price.INR.monthly, "the rest of this month")
  const r = fleetQuote("renew", 0, "monthly", "INR", active, now)
  assert.equal(r.ok && r.until, active.until + 30 * DAY)
  // a seat on a wallet: Watchkeeper to the fleet's end, with this month's credits
  const w = freshWallet(now)
  const s = grantSeat(w, now + 30 * DAY, "Fleet seat from Test", now)
  assert.equal(s.ok, true)
  assert.equal(s.state.plan.id, "watch")
  assert.equal(s.state.plan.cancelAt, now + 30 * DAY)
  assert.equal(grantSeat(s.state, now + 20 * DAY, "x", now).ok, false, "a shorter seat changes nothing")
  assert.equal(topicScore({ c: [4, 5], s: [0, 0], i: [0, 0] }), 80)
  assert.equal(topicScore({}), null)
})

test("crews: invite link, private board, and a fleet plan with seats and a readiness report", async () => {
  const env = freshEnv({ NILOBS_SIMULATED_CHECKOUT: "1" })
  const boss = await signIn(env, "boss")
  const crew = []
  for (const n of ["a1", "a2", "a3", "a4", "a5"]) crew.push(await signIn(env, n))
  assert.equal((await post(env, boss.cookie, { action: "create", name: "<b>" })).status, 400)
  const made = await post(env, boss.cookie, { action: "create", name: "Product tanker crew" })
  assert.equal(made.status, 200)
  const { id, code } = made.crew
  assert.match(code, /^[A-Z2-9]{8}$/)
  // a link anyone can open
  const link = await call(env, `/join/${code.toLowerCase()}`)
  assert.equal(link.status, 302)
  assert.equal(link.headers.get("location"), `https://nilobs.com/#app/crew/${code}`)
  const preview = await call(env, `/api/crews/preview?code=${code}`).then(json)
  assert.equal(preview.name, "Product tanker crew")
  assert.equal(preview.members, 1)
  for (const c of crew) assert.equal((await post(env, c.cookie, { action: "join", code })).status, 200)
  assert.equal((await post(env, crew[0].cookie, { action: "join", code: "WRONG123" })).status, 404)
  // the board: members only, first names and weekly XP, no emails
  const today = new Date().toISOString().slice(0, 10)
  await call(env, "/api/state", { method: "PUT", cookie: crew[0].cookie, body: { base: 0, data: { progress: { days: { [today]: 120 }, streak: { n: 3, last: today }, drill: { day: today, done: 4 }, topic: { ECDIS: { c: [8, 10], s: [0, 0], i: [0, 0] } } }, extras: { "sr.profile": { v: { rank: "2/O" }, t: 1 } } } } })
  const board = await get(env, crew[1].cookie, `/api/crews/board?id=${id}`)
  assert.equal(board.members.length, 6)
  assert.equal(board.members[0].xp, 120)
  assert.equal(board.members[0].streak, 3)
  assert.equal(board.members[0].drillToday, true)
  assert.equal(board.members[0].role, "Second Officer")
  assert.ok(!JSON.stringify(board.body).includes("@"), "no emails on the board")
  assert.equal((await get(env, (await signIn(env, "stranger")).cookie, `/api/crews/board?id=${id}`)).status, 404)
  assert.equal((await get(env, boss.cookie, `/api/crews/report?id=${id}`)).status, 404, "a free crew has no report")
  // only the owner buys the fleet plan
  assert.equal((await call(env, "/api/pay/order", { method: "POST", cookie: crew[0].cookie, body: { product: `fleet:${id}:new:5:monthly`, currency: "INR" } })).status, 409)
  const paid = await call(env, "/api/pay/order", { method: "POST", cookie: boss.cookie, body: { product: `fleet:${id}:new:5:monthly`, currency: "INR" } }).then(json)
  assert.equal(paid.provider, "simulated")
  const mine = (await get(env, boss.cookie, "/api/crews")).crews[0]
  assert.equal(mine.fleet.seats, 5)
  assert.equal(mine.fleet.used, 5)
  assert.equal(mine.fleet.active, true)
  // the first five members hold seats: Watchkeeper on their wallets, paid by the company
  const w0 = await get(env, crew[0].cookie, "/api/wallet")
  assert.equal(w0.wallet.plan.id, "watch")
  assert.ok(w0.wallet.ledger.some((e) => /Fleet seat from Product tanker crew/.test(e.label)))
  const w5 = await get(env, crew[4].cookie, "/api/wallet")
  assert.equal(w5.wallet.plan.id, "free", "the sixth member waits for a seat")
  assert.equal((await get(env, crew[4].cookie, "/api/crews")).crews[0].seatUntil, 0)
  // one more seat
  await call(env, "/api/pay/order", { method: "POST", cookie: boss.cookie, body: { product: `fleet:${id}:add:1:monthly`, currency: "INR" } })
  assert.equal((await get(env, crew[4].cookie, "/api/wallet")).wallet.plan.id, "watch")
  // the owner's report: names, emails, practice scores by topic; never chats
  const rep = await get(env, boss.cookie, `/api/crews/report?id=${id}`)
  assert.equal(rep.status, 200)
  const a1 = rep.members.find((m) => m.email === "a1@example.com")
  assert.equal(a1.scores.ECDIS, 80)
  assert.equal(a1.drills, 4)
  assert.equal(a1.weekXp, 120)
  assert.equal(a1.seat, true)
  assert.equal((await get(env, crew[0].cookie, `/api/crews/report?id=${id}`)).status, 404, "members don't see the report")
  // someone who leaves keeps their seat to the end of the period; the owner can remove people
  assert.equal((await post(env, crew[1].cookie, { action: "leave", id })).status, 200)
  assert.equal((await get(env, crew[1].cookie, "/api/wallet")).wallet.plan.id, "watch")
  const key = board.members.find((m) => m.name.startsWith("Officer") && !m.you && !m.owner)?.key
  assert.ok(key)
  assert.equal((await post(env, crew[2].cookie, { action: "remove", id, member: key })).status, 403, "only the owner")
  assert.equal((await post(env, boss.cookie, { action: "newcode", id })).crew.code === code, false, "a new invite link")
  assert.equal((await call(env, `/api/crews/preview?code=${code}`)).status, 404, "the old link stops working")
  // renewing adds a month
  const before = (await get(env, boss.cookie, "/api/crews")).crews[0].fleet.until
  await call(env, "/api/pay/order", { method: "POST", cookie: boss.cookie, body: { product: `fleet:${id}:renew:0:monthly`, currency: "INR" } })
  assert.equal((await get(env, boss.cookie, "/api/crews")).crews[0].fleet.until, before + 30 * DAY)
  // receipts for the owner's fleet payments
  const rec = await get(env, boss.cookie, "/api/pay/receipts")
  assert.equal(rec.receipts.length, 3)
  assert.match(rec.receipts.map((r) => r.item).join("|"), /Fleet plan: 5 seats, 1 month/)
})

test("a crew owner deleting their account closes the crew", async () => {
  const env = freshEnv()
  const boss = await signIn(env, "boss")
  const mate = await signIn(env, "mate")
  const { crew } = await post(env, boss.cookie, { action: "create", name: "Night watch" })
  await post(env, mate.cookie, { action: "join", code: crew.code })
  assert.equal((await call(env, "/api/me", { method: "DELETE", cookie: boss.cookie })).status, 200)
  assert.equal((await get(env, mate.cookie, "/api/crews")).crews.length, 0)
  assert.equal((await call(env, `/api/crews/preview?code=${crew.code}`)).status, 404)
})

/* ---------------- certificates ---------------- */
test("certificate: earned from synced progress, public page to check it", async () => {
  const env = freshEnv()
  const u = await signIn(env, "ana")
  let st = await get(env, u.cookie, "/api/cert")
  assert.equal(st.ready, false)
  assert.equal(st.cert, null)
  assert.equal((await call(env, "/api/cert", { method: "POST", cookie: u.cookie, body: { name: "Ana Lopez" } })).status, 409)
  const topics = ROLES.find((r) => r.id === "2/O").topics
  const progress = { topic: Object.fromEntries(topics.map((t) => [t, { c: [4, 6], s: [0, 0], i: [0, 0] }])), drill: { day: "2026-10-01", done: 7 }, interviews: [{ at: 1, rank: "2/O", avg: 7.2, n: 5, items: [] }] }
  assert.ok(certChecks(progress, { rank: "2/O" }).every((c) => c.done))
  await call(env, "/api/state", { method: "PUT", cookie: u.cookie, body: { base: 0, data: { progress, extras: { "sr.profile": { v: { rank: "2/O" }, t: 1 } } } } })
  st = await get(env, u.cookie, "/api/cert")
  assert.equal(st.ready, true)
  assert.equal((await call(env, "/api/cert", { method: "POST", cookie: u.cookie, body: { name: "<script>x</script>" } })).status, 400)
  const made = await call(env, "/api/cert", { method: "POST", cookie: u.cookie, body: { name: "Ana López" } }).then(json)
  assert.equal(made.status, 200)
  assert.match(made.cert.id, /^[A-Z2-9]{10}$/)
  const page = await call(env, `/c/${made.cert.id}`)
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.match(html, /Ana López/)
  assert.match(html, /Second Officer/)
  assert.match(html, /not an official, STCW/)
  assert.match(page.headers.get("content-security-policy"), /script-src 'nonce-/)
  assert.equal((await call(env, "/c/AAAAAAAAAA")).status, 404)
  // the name can be corrected; the number stays
  const again = await call(env, "/api/cert", { method: "POST", cookie: u.cookie, body: { name: "Ana Lopez" } }).then(json)
  assert.equal(again.cert.id, made.cert.id)
  // deleting the account removes it
  await call(env, "/api/me", { method: "DELETE", cookie: u.cookie })
  assert.equal((await call(env, `/c/${made.cert.id}`)).status, 404)
})

/* ---------------- receipts ---------------- */
test("receipts: a printable page for the account that paid, nobody else", async () => {
  const env = freshEnv({ NILOBS_SIMULATED_CHECKOUT: "1" })
  const u = await signIn(env, "payer")
  await call(env, "/api/pay/order", { method: "POST", cookie: u.cookie, body: { product: "topup:t150", currency: "INR" } })
  const list = await get(env, u.cookie, "/api/pay/receipts")
  assert.equal(list.receipts.length, 1)
  assert.equal(list.receipts[0].item, "150 credits")
  assert.equal(list.receipts[0].amount, 249)
  const page = await call(env, `/receipt/${list.receipts[0].id}`, { cookie: u.cookie })
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.match(html, /Sea N Shore IT Solutions LLP/)
  assert.match(html, /150 credits/)
  assert.match(html, /No GST was charged/)
  assert.equal(page.headers.get("cache-control"), "no-store")
  const other = await signIn(env, "other")
  assert.equal(await (await call(env, `/receipt/${list.receipts[0].id}`, { cookie: other.cookie })).text(), "site")
  assert.equal(await (await call(env, `/receipt/${list.receipts[0].id}`)).text(), "site")
})

test("the Android app's site link, only once it's set up", async () => {
  assert.equal(await (await call(freshEnv(), "/.well-known/assetlinks.json")).text(), "site")
  const env = freshEnv({ ANDROID_PACKAGE: "com.nilobs.app", ANDROID_CERT_SHA256: "aa:bb, CC:DD" })
  const j = await (await call(env, "/.well-known/assetlinks.json")).json()
  assert.equal(j[0].target.package_name, "com.nilobs.app")
  assert.deepEqual(j[0].target.sha256_cert_fingerprints, ["AA:BB", "CC:DD"])
  assert.ok(PLANS.watch.credits > 0)
})
