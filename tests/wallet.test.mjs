// The server wallet: charges, tickets, refunds and earning can't be faked from the browser.
import test from "node:test"
import assert from "node:assert/strict"
import { balanceOf, call, fakeClaude, fakeVoice, freshEnv, json, ref, signIn, textReply } from "./helpers.mjs"

const spend = (env, cookie, item, r = ref()) => call(env, "/api/wallet/spend", { method: "POST", cookie, body: { item, ref: r } }).then(json)
const ai = (env, cookie, body) => call(env, "/api/ai", { method: "POST", cookie, body: { messages: [{ role: "user", content: "hi" }], ...body } })
const wallet = (env, cookie) => call(env, "/api/wallet", { cookie }).then(json)

test("a new account starts with 80 credits on the server; payments closed without keys", async () => {
  const env = freshEnv()
  const { cookie } = await signIn(env)
  const w = await wallet(env, cookie)
  assert.equal(w.status, 200)
  assert.equal(balanceOf(w.wallet), 80)
  assert.deepEqual(w.checkout, { INR: null, USD: null })
  assert.equal((await call(env, "/api/wallet")).status, 401, "signed out: no wallet")
})

test("an answer delivered keeps the charge; the ticket can't be reused or refunded", async () => {
  const env = freshEnv()
  const { cookie } = await signIn(env)
  const s = await spend(env, cookie, { kind: "askQuick" }, "ask-ticket-01")
  assert.equal(s.status, 200)
  assert.equal(balanceOf(s.wallet), 79)
  assert.equal(s.wallet.holds.length, 1, "held until the answer arrives")
  fakeClaude.next = () => textReply("Check ", "the log")
  const r = await ai(env, cookie, { ticket: "ask-ticket-01", tier: "quick" })
  assert.equal(await r.text(), "Check the log")
  const w = await wallet(env, cookie)
  assert.equal(w.wallet.holds.length, 0, "settled")
  assert.equal(balanceOf(w.wallet), 79)
  assert.equal((await ai(env, cookie, { ticket: "ask-ticket-01", tier: "quick" })).status, 402, "one answer per ticket")
  const ref1 = await call(env, "/api/wallet/refund", { method: "POST", cookie, body: { ticket: "ask-ticket-01" } }).then(json)
  assert.equal(ref1.status, 409)
  assert.equal(ref1.code, "delivered")
})

test("no answer: the call is given back and the charge can be refunded", async () => {
  const env = freshEnv()
  const { cookie } = await signIn(env)
  await spend(env, cookie, { kind: "askDeep" }, "deep-ticket-01")
  fakeClaude.next = () => new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 })
  assert.equal((await ai(env, cookie, { ticket: "deep-ticket-01", tier: "default" })).status, 502)
  const r = await call(env, "/api/wallet/refund", { method: "POST", cookie, body: { ticket: "deep-ticket-01" } }).then(json)
  assert.equal(r.status, 200)
  assert.equal(balanceOf(r.wallet), 80)
  // a refunded ticket can't then be used
  fakeClaude.next = null
  assert.equal((await ai(env, cookie, { ticket: "deep-ticket-01", tier: "default" })).status, 402)
})

test("a ticket pays for its own feature only: model, photos, size, owner, expiry", async () => {
  const env = freshEnv()
  const { cookie } = await signIn(env)
  await spend(env, cookie, { kind: "askQuick" }, "quick-ticket-1")
  assert.equal((await ai(env, cookie, { ticket: "quick-ticket-1", tier: "complex" })).status, 403, "a 1-credit ticket can't use the expensive model")
  assert.equal((await ai(env, cookie, { ticket: "quick-ticket-1", tier: "quick", messages: [{ role: "user", content: "x".repeat(70000) }] })).status, 413)
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg=="
  assert.equal((await ai(env, cookie, { ticket: "quick-ticket-1", tier: "quick", images: [{ media_type: "image/png", data: PNG }] })).status, 403, "no photos on an ask ticket")
  await spend(env, cookie, { kind: "photo", n: 1 }, "photo-ticket-1")
  assert.equal((await ai(env, cookie, { ticket: "photo-ticket-1", tier: "default", images: [{ media_type: "image/png", data: PNG }, { media_type: "image/png", data: PNG }] })).status, 403, "two photos on a one-photo charge")
  assert.equal((await ai(env, cookie, { ticket: "made-up-ticket" , tier: "quick" })).status, 402)
  assert.equal((await ai(env, cookie, { tier: "quick" })).status, 402, "no ticket at all")
  const other = await signIn(env, "g-2")
  assert.equal((await ai(env, other.cookie, { ticket: "quick-ticket-1", tier: "quick" })).status, 402, "someone else's ticket")
  // expiry
  const row = env.DB.sqlite.prepare("SELECT data FROM wallets LIMIT 1").get()
  const data = JSON.parse(row.data)
  data.tickets.forEach((t) => (t.exp = Date.now() - 1000))
  env.DB.sqlite.prepare("UPDATE wallets SET data = ?").run(JSON.stringify(data))
  const expired = await json(await ai(env, cookie, { ticket: "quick-ticket-1", tier: "quick" }))
  assert.equal(expired.status, 402)
  assert.equal(expired.code, "expired_ticket")
})

test("prices and plan rules are the server's: expert needs Command, short balance refused, a retried ref charges once", async () => {
  const env = freshEnv()
  const { cookie } = await signIn(env)
  const ex = await spend(env, cookie, { kind: "askExpert" })
  assert.equal(ex.status, 402)
  assert.equal(ex.code, "not_allowed")
  const r1 = await spend(env, cookie, { kind: "brief" }, "same-ref-0001")
  const r2 = await spend(env, cookie, { kind: "brief" }, "same-ref-0001")
  assert.equal(balanceOf(r2.wallet), 60, "20 once, not twice")
  assert.equal(r1.ticket.id, r2.ticket.id)
  await spend(env, cookie, { kind: "deck", id: "ecdis" })
  await spend(env, cookie, { kind: "deck", id: "ecdis" })
  const w = await wallet(env, cookie)
  assert.equal(balanceOf(w.wallet), 20, "a deck is bought once")
  assert.deepEqual(w.wallet.decks, ["ecdis"])
  const short = await spend(env, cookie, { kind: "deck", id: "cdi" })
  assert.equal(short.status, 402)
  assert.equal(short.code, "short")
  assert.equal((await spend(env, cookie, { kind: "deck", id: "made-up" })).status, 402)
  assert.equal((await spend(env, cookie, { kind: "lottery" })).status, 400)
  assert.equal((await call(env, "/api/wallet/spend", { method: "POST", cookie, body: { item: { kind: "askQuick" }, ref: "x" } })).status, 400, "bad ref")
})

test("photo check: bad JSON or not-a-ship sends nothing useful and can be refunded; a real result can't", async () => {
  const env = freshEnv()
  const { cookie } = await signIn(env)
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg=="
  const img = [{ media_type: "image/png", data: PNG }]
  // a prompt trying to get a free essay through the photo check
  await spend(env, cookie, { kind: "photo", n: 1 }, "photo-leak-01")
  fakeClaude.next = () => textReply("Here is a long free essay about ", "everything you asked")
  const leak = await (await ai(env, cookie, { ticket: "photo-leak-01", tier: "default", images: img, json: true })).text()
  assert.ok(!leak.includes("essay"), "nothing leaked: " + leak)
  assert.match(leak, /invalid_json/)
  assert.equal((await call(env, "/api/wallet/refund", { method: "POST", cookie, body: { ticket: "photo-leak-01" } })).status, 200)
  // not a ship, with something smuggled in the reply
  await spend(env, cookie, { kind: "photo", n: 1 }, "photo-ship-01")
  fakeClaude.next = () => textReply(JSON.stringify({ relevant: false, summary: "smuggled answer", findings: [] }))
  const ns = await (await ai(env, cookie, { ticket: "photo-ship-01", tier: "default", images: img })).text()
  assert.equal(ns, '{"relevant":false,"findings":[]}')
  assert.equal((await call(env, "/api/wallet/refund", { method: "POST", cookie, body: { ticket: "photo-ship-01" } })).status, 200)
  // a real result is delivered and kept
  await spend(env, cookie, { kind: "photo", n: 1 }, "photo-real-01")
  fakeClaude.next = () => textReply('{"relevant": true, "findings": [{"title": "Rust"}]}')
  const ok = await (await ai(env, cookie, { ticket: "photo-real-01", tier: "default", images: img })).text()
  assert.match(ok, /Rust/)
  assert.equal((await call(env, "/api/wallet/refund", { method: "POST", cookie, body: { ticket: "photo-real-01" } })).status, 409)
  const w = await wallet(env, cookie)
  assert.equal(balanceOf(w.wallet), 77, "only the real check cost 3")
})

test("AI inspector: one charge covers the interview; failed grades don't use it up but tries are capped", async () => {
  const env = freshEnv()
  const { cookie } = await signIn(env)
  await spend(env, cookie, { kind: "interview" }, "interview-001")
  fakeClaude.next = () => textReply("not json at all")
  for (let i = 0; i < 6; i++) await (await ai(env, cookie, { ticket: "interview-001", tier: "quick", json: true })).text()
  fakeClaude.next = () => textReply('{"score": 7}')
  let r = await ai(env, cookie, { ticket: "interview-001", tier: "quick", json: true })
  assert.equal(await r.text(), '{"score": 7}')
  // a grade was delivered: no refund now
  assert.equal((await call(env, "/api/wallet/refund", { method: "POST", cookie, body: { ticket: "interview-001" } })).status, 409)
  // the 14-answer allowance minus tries: hammering it stops
  let last = 200
  for (let i = 0; i < 30 && last === 200; i++) {
    r = await ai(env, cookie, { ticket: "interview-001", tier: "quick" })
    last = r.status
    await r.text().catch(() => "")
  }
  assert.ok(last === 402 || last === 429, "stops at the allowance: " + last)
  assert.ok(fakeClaude.calls < 30)
})

test("voice: a listen pays for one line; a failed line is given back", async () => {
  const env = freshEnv()
  const { cookie } = await signIn(env)
  await spend(env, cookie, { kind: "listen" }, "listen-00001")
  fakeVoice.fail = true
  assert.equal((await call(env, "/api/voice", { method: "POST", cookie, body: { ticket: "listen-00001", text: "Hello" } })).status, 502)
  fakeVoice.fail = false
  assert.equal((await call(env, "/api/voice", { method: "POST", cookie, body: { ticket: "listen-00001", text: "Hello" } })).status, 200)
  assert.equal((await call(env, "/api/voice", { method: "POST", cookie, body: { ticket: "listen-00001", text: "Again" } })).status, 402)
  assert.equal((await call(env, "/api/voice", { method: "POST", cookie, body: { text: "Free?" } })).status, 402)
})

test("earning: each badge, level and streak pays once; chests once a day; debriefs within limits", async () => {
  const env = freshEnv()
  const { cookie } = await signIn(env)
  const earn = (body) => call(env, "/api/wallet/earn", { method: "POST", cookie, body }).then(json)
  assert.equal((await earn({ kind: "badge", key: "first" })).granted, 5)
  assert.equal((await earn({ kind: "badge", key: "first" })).granted, 0)
  assert.equal((await earn({ kind: "badge", key: "made-up" })).status, 400)
  assert.equal((await earn({ kind: "level", key: 5 })).granted, 30)
  assert.equal((await earn({ kind: "level", key: 11 })).status, 400)
  assert.equal((await earn({ kind: "streak", key: 7 })).granted, 10)
  const today = new Date().toISOString().slice(0, 10)
  assert.equal((await earn({ kind: "chest", key: today })).granted, 3)
  assert.equal((await earn({ kind: "chest", key: today })).granted, 0)
  assert.equal((await earn({ kind: "chest", key: "2020-01-01" })).status, 400)
  assert.equal((await earn({ kind: "share", text: "too short" })).status, 400)
  const debrief = "The inspector focused on the gas detector calibration records and asked the C/O to show the last bump test."
  assert.equal((await earn({ kind: "share", text: debrief })).granted, 25)
  assert.equal((await earn({ kind: "share", text: debrief + " More." })).status, 409, "one a day")
  assert.equal((await earn({ kind: "amount", key: 1000000 })).status, 400)
  // catching up after sign-in pays only what wasn't claimed
  const c = await call(env, "/api/wallet/claims", { method: "POST", cookie, body: { badges: ["first", "chest", "nope"], level: 5, streakBest: 30 } }).then(json)
  assert.equal(c.granted, 5 + (10 + 15 + 20) + 40, "chest badge, levels 2-4, 30-day streak")
  const again = await call(env, "/api/wallet/claims", { method: "POST", cookie, body: { badges: ["first", "chest"], level: 5, streakBest: 30 } }).then(json)
  assert.equal(again.granted, 0)
  assert.equal(balanceOf(again.wallet), 80 + 5 + 30 + 10 + 3 + 25 + 5 + 45 + 40)
})

test("tampering: a wallet in synced state is ignored, and buying needs a real payment", async () => {
  const env = freshEnv()
  const { cookie } = await signIn(env)
  await call(env, "/api/state", { method: "PUT", cookie, body: { base: 0, data: { wallet: { v: 2, buckets: [{ id: "x", kind: "topup", amount: 999999, left: 999999, at: 0, expires: null }] }, progress: {} } } })
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 80)
  const buy = await call(env, "/api/wallet/buy", { method: "POST", cookie, body: { product: "topup:t1200", currency: "INR" } })
  assert.equal(buy.status, 403)
  const order = await call(env, "/api/pay/order", { method: "POST", cookie, body: { product: "topup:t1200", currency: "INR" } }).then(json)
  assert.equal(order.status, 503)
  assert.equal(order.code, "payments_closed")
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 80)
})

test("demo mode: simulated buying works only when switched on", async () => {
  const env = freshEnv({ NILOBS_SIMULATED_CHECKOUT: "1" })
  const { cookie } = await signIn(env)
  const r = await call(env, "/api/pay/order", { method: "POST", cookie, body: { product: "plan:watch:monthly", currency: "INR" } }).then(json)
  assert.equal(r.provider, "simulated")
  assert.equal(r.wallet.plan.id, "watch")
  assert.ok(r.wallet.plan.cancelAt, "prepaid: doesn't renew")
  assert.equal(balanceOf(r.wallet), 480)
  assert.equal((await call(env, "/api/pay/order", { method: "POST", cookie, body: { product: "plan:watch:monthly", currency: "INR" } }).then(json)).wallet.plan.id, "watch")
})

test("a held charge whose answer never came back is refunded after 10 minutes", async () => {
  const env = freshEnv()
  const { cookie } = await signIn(env)
  await spend(env, cookie, { kind: "askDeep" }, "stuck-ticket-1")
  const data = JSON.parse(env.DB.sqlite.prepare("SELECT data FROM wallets").get().data)
  data.w.holds.forEach((h) => (h.at -= 11 * 60000))
  env.DB.sqlite.prepare("UPDATE wallets SET data = ?").run(JSON.stringify(data))
  const w = await wallet(env, cookie)
  assert.equal(balanceOf(w.wallet), 80)
  assert.ok(!w.tickets.some((t) => t.id === "stuck-ticket-1"), "the ticket is closed")
})

test("many spends at once are all counted (no lost updates)", async () => {
  const env = freshEnv()
  const { cookie } = await signIn(env)
  const rs = await Promise.all(Array.from({ length: 6 }, () => spend(env, cookie, { kind: "askQuick" })))
  assert.ok(rs.every((r) => r.status === 200))
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 74)
})

test("deleting the account deletes its wallet, and signing up again doesn't bring back the free credits", async () => {
  const env = freshEnv({ NILOBS_SIMULATED_CHECKOUT: "1" })
  let { cookie } = await signIn(env, "g-del")
  await call(env, "/api/pay/order", { method: "POST", cookie, body: { product: "topup:t150", currency: "INR" } })
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 230)
  assert.equal((await call(env, "/api/me", { method: "DELETE", cookie })).status, 200)
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM wallets").get().n, 0)
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM payments").get().n, 1, "the payment record stays for the accounts")
  assert.ok(!JSON.stringify(env.DB.sqlite.prepare("SELECT * FROM starts").all()).includes("g-del"), "only a one-way code is kept")
  ;({ cookie } = await signIn(env, "g-del"))
  assert.equal(balanceOf((await wallet(env, cookie)).wallet), 0)
  const other = await signIn(env, "g-new")
  assert.equal(balanceOf((await wallet(env, other.cookie)).wallet), 80, "a new Google account still gets them")
})

test("voice interview: cancelling after the first question is read still refunds; a long listen-fest doesn't", async () => {
  const env = freshEnv()
  const { cookie } = await signIn(env)
  const say = (t, text) => call(env, "/api/voice", { method: "POST", cookie, body: { ticket: t, text } })
  const refund = (t) => call(env, "/api/wallet/refund", { method: "POST", cookie, body: { ticket: t } })
  await spend(env, cookie, { kind: "voiceInterview" }, "voice-int-0001")
  assert.equal((await say("voice-int-0001", "Question one")).status, 200)
  assert.equal((await refund("voice-int-0001")).status, 200, "only the first question was heard")
  await spend(env, cookie, { kind: "voiceInterview" }, "voice-int-0002")
  for (const q of ["One", "Two", "Three"]) assert.equal((await say("voice-int-0002", q)).status, 200)
  assert.equal((await refund("voice-int-0002")).status, 409, "three lines spoken: kept")
  // a listen is only voice: once heard, it's kept (and its hold is settled, not refunded later)
  await spend(env, cookie, { kind: "listen" }, "listen-hold-01")
  assert.equal((await say("listen-hold-01", "An answer")).status, 200)
  assert.equal((await refund("listen-hold-01")).status, 409)
  const w = await wallet(env, cookie)
  assert.equal(w.wallet.holds.length, 0, "listen settled")
  assert.equal(balanceOf(w.wallet), 80 - 12 - 1)
})

test("role pack: 3 credits, one JSON answer on the standard model; a garbled one is refundable", async () => {
  const env = freshEnv()
  const { cookie } = await signIn(env)
  const s = await spend(env, cookie, { kind: "rolePack" }, "role-pack-0001")
  assert.equal(s.status, 200)
  assert.equal(balanceOf(s.wallet), 77)
  assert.equal((await ai(env, cookie, { ticket: "role-pack-0001", tier: "complex" })).status, 403, "standard model only")
  fakeClaude.next = () => textReply("not json")
  await (await ai(env, cookie, { ticket: "role-pack-0001", tier: "default" })).text()
  assert.equal((await call(env, "/api/wallet/refund", { method: "POST", cookie, body: { ticket: "role-pack-0001" } })).status, 200)
  await spend(env, cookie, { kind: "rolePack" }, "role-pack-0002")
  fakeClaude.next = () => textReply('{"cards": [{"q": "Q", "a": "A", "topic": "Cargo"}], "checklist": ["x"]}')
  assert.match(await (await ai(env, cookie, { ticket: "role-pack-0002", tier: "default" })).text(), /checklist/)
  assert.equal((await call(env, "/api/wallet/refund", { method: "POST", cookie, body: { ticket: "role-pack-0002" } })).status, 409)
  fakeClaude.next = null
})
