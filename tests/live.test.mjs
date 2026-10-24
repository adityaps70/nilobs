// The live features: the industry feed, daily reminders, the inspection pulse and weekly leagues.
import test from "node:test"
import assert from "node:assert/strict"
import { call, fakeClaude, freshEnv, json, signIn } from "./helpers.mjs"
import { discoverFeeds, dueSources, parseFeed, parseGovUk, runFeed, PER_RUN, REFRESH_MS, RETRY_MS, SOURCES } from "../worker/feed.js"
import { pushHostOk, runPush, vapid, vapidAuth } from "../worker/push.js"
import { scrub } from "../worker/pulse.js"
import { cleanName, resetLeagueCache, weekOf } from "../worker/league.js"
import { resetLiveSchemaFlag } from "../worker/live.js"
import worker from "../worker/index.js"

const fresh = (extra) => {
  resetLiveSchemaFlag()
  return freshEnv(extra)
}
const DAYMS = 86400000
const claudeText = (text) => new Response(JSON.stringify({ content: [{ type: "text", text }] }), { headers: { "content-type": "application/json" } })

/* ---------------- the industry feed ---------------- */
const RSS = (items) => `<?xml version="1.0"?><rss version="2.0"><channel><title>News</title>${items
  .map((i) => `<item><title><![CDATA[${i.t}]]></title><link>${i.u}</link><pubDate>${new Date(i.at).toUTCString()}</pubDate><description><![CDATA[<p>${i.d}</p>]]></description></item>`)
  .join("")}</channel></rss>`
const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom &amp; news</title><link rel="alternate" href="https://example.org/a"/><updated>2026-10-20T10:00:00Z</updated><summary>Short &lt;b&gt;summary&lt;/b&gt;</summary></entry></feed>`

test("feeds are read: RSS, Atom and GOV.UK search results", () => {
  const now = Date.parse("2026-10-24T00:00:00Z")
  const r = parseFeed(RSS([{ t: "PSC campaign on fire safety", u: "https://news.example/psc", at: now, d: "Inspectors will focus on fire doors &amp; dampers." }]))
  assert.deepEqual(r[0], { title: "PSC campaign on fire safety", url: "https://news.example/psc", excerpt: "Inspectors will focus on fire doors & dampers.", at: now })
  const a = parseFeed(ATOM)
  assert.equal(a[0].title, "Atom & news")
  assert.equal(a[0].url, "https://example.org/a")
  assert.equal(a[0].excerpt, "Short summary")
  const g = parseGovUk({ results: [{ title: "Grounding of a tanker", link: "/maib-reports/grounding", description: "Report", public_timestamp: "2026-10-20T09:00:00Z" }] })
  assert.equal(g[0].url, "https://www.gov.uk/maib-reports/grounding")
})

function feedWorld(now) {
  const calls = { ai: 0, prompts: [] }
  const fetchImpl = async (url, init = {}) => {
    const u = String(url)
    if (u.startsWith("https://api.anthropic.com/")) {
      calls.ai++
      const body = JSON.parse(init.body)
      calls.prompts.push(body.messages[0].content)
      const n = (body.messages[0].content.match(/^Item \d+/gm) || []).length
      const out = Array.from({ length: n }, (_, i) => {
        const headline = body.messages[0].content.split(/^Item \d+$/m)[i + 1] || ""
        const relevant = /tanker|PSC|cargo/i.test(headline)
        return { n: i + 1, relevance: relevant ? 85 : 10, kind: /PSC/.test(headline) ? "detention" : "industry", takeaway: relevant ? "What happened, in our words." : "", check: "Check the fire dampers close fully.", roles: ["deck", "nonsense"], topics: ["Emergency equipment", "Made up"] }
      })
      return claudeText(JSON.stringify(out))
    }
    if (u.includes("gov.uk/api/search.json")) return new Response(JSON.stringify({ results: [{ title: "Explosion on a product tanker during cargo operations", link: "/maib-reports/explosion", description: "Investigation report.", public_timestamp: new Date(now - DAYMS).toISOString() }] }))
    if (u === "https://safety4sea.com/feed/") return new Response(RSS([{ t: "Tokyo MOU PSC campaign on fire safety starts", u: "https://safety4sea.com/psc", at: now - 3600000, d: "Three-month campaign." }, { t: "Shipping company appoints new CEO", u: "https://safety4sea.com/ceo", at: now - 7200000, d: "Appointment." }, { t: "Old story about a tanker", u: "https://safety4sea.com/old", at: now - 40 * DAYMS, d: "Old." }]))
    if (u === "https://splash247.com/feed/") return new Response("down", { status: 503 })
    return new Response(RSS([]))
  }
  return { fetchImpl, calls }
}

/** Run the feed job until every source has had its turn (each run reads a few, oldest first). */
async function runAll(env, now, fetchImpl) {
  const all = { sources: {}, added: 0, read: 0, live: 0, runs: 0 }
  for (let i = 0; i < Math.ceil(SOURCES.length / PER_RUN) + 1; i++) {
    const r = await runFeed(env, now, fetchImpl)
    if (!Object.keys(r.sources).length && !r.read) break
    all.runs++
    Object.assign(all.sources, r.sources)
    all.added += r.added
    all.read += r.read || 0
    all.live += r.live || 0
  }
  return all
}

test("the feed job keeps what's new and relevant, writes takeaways, records each source's health", async () => {
  const env = fresh()
  const now = Date.now()
  const { fetchImpl, calls } = feedWorld(now)
  const first = await runFeed(env, now, fetchImpl)
  assert.equal(Object.keys(first.sources).length, PER_RUN, "a few sources per run")
  const r = await runAll(env, now, fetchImpl)
  Object.assign(r.sources, first.sources)
  r.live += first.live
  assert.equal(Object.keys(r.sources).length, SOURCES.length, "every source gets its turn")
  assert.equal(r.sources.splash.ok, false)
  assert.match(r.sources.splash.error, /503/)
  assert.equal(r.sources.safety4sea.recent, 2, "the 40-day-old story is skipped")
  assert.equal(r.live, 2, "the MAIB report (found by both GOV.UK searches, stored once) + the PSC story; the CEO story is skipped")
  assert.ok(!calls.prompts.join("").includes("Old story"), "old items never reach the AI")
  const feed = await call(env, "/api/feed").then(json)
  assert.equal(feed.status, 200)
  const psc = feed.items.find((i) => i.url === "https://safety4sea.com/psc")
  assert.equal(psc.kind, "detention")
  assert.equal(psc.sourceName, "SAFETY4SEA")
  assert.deepEqual(psc.roles, ["deck"], "unknown roles dropped")
  assert.deepEqual(psc.topics, ["Emergency equipment"], "only the app's own topics")
  assert.ok(!feed.items.some((i) => /CEO/.test(i.title)))
  const maib = feed.items.find((i) => i.source === "maib")
  assert.equal(maib.official, true)
  // nothing is due straight after: a run reads nothing and asks the AI nothing
  const before = calls.ai
  const r2 = await runFeed(env, now + 1000, fetchImpl)
  assert.deepEqual(r2.sources, {})
  assert.equal(r2.added, 0)
  assert.equal(calls.ai, before)
  // three hours on, the sources that worked are read again (oldest first); the ones that failed wait 12 hours
  const later = await runFeed(env, now + REFRESH_MS + 60000, fetchImpl)
  assert.ok(Object.keys(later.sources).length > 0)
  assert.ok(!("splash" in later.sources), "a failing source isn't retried yet")
  assert.equal(later.added, 0, "the same stories aren't stored twice")
  const rows = (await env.DB.prepare("SELECT * FROM feed_sources").all()).results
  assert.ok(dueSources(rows, now + RETRY_MS + 3600000).some((s) => s.id === "splash"), "retried after 12 hours")
  const health = (await env.DB.prepare("SELECT * FROM feed_sources WHERE id = 'splash'").first())
  assert.match(health.last_error, /503/)
  assert.ok(SOURCES.length >= 4)
})

test("a source without a fixed feed address: found from its page, then remembered", async () => {
  const env = fresh()
  const now = Date.now()
  const html = `<html><head><link rel="alternate" type="application/rss+xml" title="News" href="/rss/news.xml"><link rel="alternate" type="application/rss+xml" href="/comments/feed"></head></html>`
  assert.deepEqual(discoverFeeds(html, "https://www.news.uscg.mil/maritime-commons/"), ["https://www.news.uscg.mil/rss/news.xml"])
  const seen = []
  const fetchImpl = async (url, init) => {
    const u = String(url)
    seen.push(u)
    if (u.startsWith("https://api.anthropic.com/")) return claudeText("[]")
    if (u === "https://www.news.uscg.mil/maritime-commons/") return new Response(html, { headers: { "content-type": "text/html" } })
    if (u === "https://www.news.uscg.mil/rss/news.xml") return new Response(RSS([{ t: "Marine safety alert: tanker cargo pump room fire", u: "https://www.news.uscg.mil/a/1", at: now - 3600000, d: "Alert." }]))
    if (u.includes("gov.uk")) return new Response(JSON.stringify({ results: [] }))
    return new Response("nope", { status: 404 })
  }
  const r = await runFeed(env, now, fetchImpl)
  assert.equal(r.sources.uscg.ok, true)
  assert.equal(r.sources.uscg.recent, 1)
  const key = await env.DB.prepare("SELECT v FROM app_keys WHERE k = 'feed_url:uscg'").first()
  assert.equal(key.v, "https://www.news.uscg.mil/rss/news.xml")
  seen.length = 0
  for (let i = 0; i < 8; i++) if ("uscg" in (await runFeed(env, now + REFRESH_MS + 60000, fetchImpl)).sources) break
  assert.ok(seen.includes("https://www.news.uscg.mil/rss/news.xml"))
  assert.ok(!seen.includes("https://www.news.uscg.mil/maritime-commons/"), "the page isn't fetched again")
})

test("without the AI, new items wait (nothing half-written is shown)", async () => {
  const env = fresh({ ANTHROPIC_API_KEY: "" })
  const now = Date.now()
  const { fetchImpl } = feedWorld(now)
  const r = await runAll(env, now, fetchImpl)
  assert.ok(r.added > 0)
  assert.equal(r.read, 0)
  assert.equal((await call(env, "/api/feed").then(json)).items.length, 0)
})

/* ---------------- reminders ---------------- */
test("reminders: only real push services, a stable signing key, a valid ES256 token", async () => {
  assert.ok(pushHostOk("https://fcm.googleapis.com/fcm/send/abc"))
  assert.ok(pushHostOk("https://web.push.apple.com/QXBwbGU"))
  assert.ok(pushHostOk("https://updates.push.services.mozilla.com/wpush/v2/x"))
  assert.ok(!pushHostOk("http://fcm.googleapis.com/x"))
  assert.ok(!pushHostOk("https://evil.example/push"))
  assert.ok(!pushHostOk("https://fcm.googleapis.com.evil.example/x"))
  const env = fresh()
  const v = await vapid(env.DB)
  const pub = await call(env, "/api/push/key").then(json)
  assert.equal(pub.publicKey, v.pub)
  assert.equal(pub.publicKey.length, 87, "65 raw bytes, base64url")
  const h = await vapidAuth("https://fcm.googleapis.com/fcm/send/abc", v, Date.parse("2026-10-24T00:00:00Z"))
  const [, token, k] = h.match(/^vapid t=([^,]+), k=(.+)$/)
  assert.equal(k, v.pub)
  const [head, body, sig] = token.split(".")
  const claims = JSON.parse(Buffer.from(body, "base64url").toString())
  assert.equal(claims.aud, "https://fcm.googleapis.com")
  assert.equal(claims.sub, "https://nilobs.com")
  const pubKey = await crypto.subtle.importKey("raw", Buffer.from(v.pub, "base64url"), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"])
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, Buffer.from(sig, "base64url"), new TextEncoder().encode(`${head}.${body}`)))
})

test("reminders go out once a day at each person's own hour; dead addresses are removed", async () => {
  const env = fresh()
  const { cookie } = await signIn(env, "sailor")
  const sub = (endpoint, hour, tz) => call(env, "/api/push/subscribe", { method: "POST", cookie, body: { endpoint, hour, tz } }).then(json)
  assert.equal((await sub("https://evil.example/x", 19, 330)).code, "bad_endpoint")
  assert.equal((await sub("https://fcm.googleapis.com/fcm/send/ist", 25, 330)).code, "bad_time")
  assert.equal((await sub("https://fcm.googleapis.com/fcm/send/ist", 19, 330)).status, 200) // 19:00 in India
  assert.equal((await sub("https://updates.push.services.mozilla.com/wpush/v2/gone", 13, 0)).status, 200) // 13:00 UTC
  assert.equal((await call(env, "/api/push/subscribe", { method: "POST", body: { endpoint: "https://fcm.googleapis.com/x", hour: 1, tz: 0 } })).status, 401)
  const sent = []
  const fetchImpl = async (url, init) => {
    sent.push({ url: String(url), auth: init.headers.authorization, ttl: init.headers.ttl })
    return new Response("", { status: String(url).includes("/gone") ? 410 : 201 })
  }
  // 13:30 UTC = 19:00 in India: both are due
  const t = Date.parse("2026-10-24T13:30:00Z")
  const r = await runPush(env, t, fetchImpl)
  assert.deepEqual([r.due, r.sent, r.gone], [2, 1, 1])
  assert.match(sent[0].auth, /^vapid t=.+, k=.+/)
  assert.equal(sent[0].ttl, "43200")
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subs").first()).n, 1, "the dead address is gone")
  // fifteen minutes later: already reminded today
  assert.equal((await runPush(env, t + 15 * 60000, fetchImpl)).due, 0)
  // the next day at the same time: again
  assert.equal((await runPush(env, t + DAYMS, fetchImpl)).sent, 1)
  // not at another hour
  assert.equal((await runPush(env, t + DAYMS + 2 * 3600000, fetchImpl)).due, 0)
  // unsubscribe
  await call(env, "/api/push/unsubscribe", { method: "POST", cookie, body: { endpoint: "https://fcm.googleapis.com/fcm/send/ist" } })
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subs").first()).n, 0)
})

test("the reminder message is personal: inspection countdown, streak, today's drill, new updates", async () => {
  const env = fresh()
  const { cookie } = await signIn(env, "cadet")
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - DAYMS).toISOString().slice(0, 10)
  const msg = () => call(env, "/api/push/message?tz=0", { cookie }).then(json)
  assert.equal((await msg()).title, "Today's drill is ready")
  const put = (base, data) => call(env, "/api/state", { method: "PUT", cookie, body: { base, data } })
  await put(0, { progress: { streak: { n: 6, last: yesterday, best: 6 } }, extras: { "sr.profile": { v: { rank: "2/O" }, t: 1 } } })
  const m = await msg()
  assert.equal(m.title, "Keep your 6-day streak")
  assert.equal(m.url, "/#app/daily")
  const inFive = new Date(Date.now() + 5 * DAYMS).toISOString().slice(0, 10)
  await put(1, { progress: { streak: { n: 6, last: yesterday, best: 6 } }, extras: { "sr.profile": { v: { rank: "2/O" }, t: 1 }, "sr.brief": { v: { date: inFive }, t: 1 } } })
  assert.match((await msg()).title, /^Inspection in [56] days$/)
  await put(2, { progress: { drill: { day: today, done: 5 } }, extras: {} })
  assert.equal((await msg()).title, "You're done for today")
})

/* ---------------- the inspection pulse ---------------- */
test("a shared debrief is checked and de-identified by the AI before anyone sees it", async () => {
  const env = fresh()
  const a = await signIn(env, "sharer")
  const b = await signIn(env, "reader")
  await call(env, "/api/state", { method: "PUT", cookie: a.cookie, body: { base: 0, data: { progress: {}, extras: { "sr.profile": { v: { rank: "C/O", ship: "Crude" }, t: 1 } } } } })
  const text = "SIRE at Fujairah on MT Ocean Star (IMO 9123456) with the Shell inspector John Smith. He spent two hours on the cargo control room, asked for the ODME log and the last P/V valve test, and checked rest hours. Mail me at jo@example.com"
  fakeClaude.next = (body) => {
    assert.match(body.system, /completely anonymously/)
    return claudeText(JSON.stringify({ ok: true, summary: "A long look at cargo control on MT Ocean Star: records first.", questions: ["Show the ODME log", "When were the P/V valves last tested?", "Rest hours for last week (IMO 9123456)"], topics: ["Cargo", "Rest hours & drills", "Nonsense"], region: "a Middle East Gulf port", inspection: "SIRE 2.0" }))
  }
  assert.equal((await call(env, "/api/pulse", { method: "POST", cookie: a.cookie, body: { text: "too short" } })).status, 400)
  const r = await call(env, "/api/pulse", { method: "POST", cookie: a.cookie, body: { text } }).then(json)
  assert.equal(r.status, 200)
  assert.equal(r.body.status, "live")
  const view = await call(env, "/api/pulse", { cookie: b.cookie }).then(json)
  const raw = JSON.stringify(view.body)
  for (const bad of ["Ocean Star", "9123456", "John Smith", "Shell", "jo@example.com", "Fujairah", "sharer"]) assert.ok(!raw.includes(bad), "leaked: " + bad)
  const it = view.items[0]
  assert.equal(it.role, "Deck officer")
  assert.equal(it.ship, "Crude")
  assert.equal(it.region, "a Middle East Gulf port")
  assert.deepEqual(it.topics, ["Cargo", "Rest hours & drills"])
  assert.match(it.summary, /the ship/)
  assert.deepEqual(view.trending.map((t) => t.topic).sort(), ["Cargo", "Rest hours & drills"])
  assert.equal(view.week, 1)
  assert.equal((await call(env, "/api/pulse")).status, 401, "members only")
  // not a debrief: rejected, never shown
  fakeClaude.next = () => claudeText(JSON.stringify({ ok: false, reason: "advertising" }))
  const spam = await call(env, "/api/pulse", { method: "POST", cookie: a.cookie, body: { text: "Buy cheap certificates now, best prices, contact us today for a great deal on everything!" } }).then(json)
  assert.equal(spam.body.status, "rejected")
  assert.equal((await call(env, "/api/pulse", { cookie: b.cookie }).then(json)).items.length, 1)
  // three a day at most
  fakeClaude.next = () => claudeText(JSON.stringify({ ok: true, summary: "Another inspection focused on mooring.", questions: [], topics: ["Mooring & access"], region: "", inspection: "PSC" }))
  assert.equal((await call(env, "/api/pulse", { method: "POST", cookie: a.cookie, body: { text: text + " again" } })).status, 200)
  assert.equal((await call(env, "/api/pulse", { method: "POST", cookie: a.cookie, body: { text: text + " once more" } })).status, 429)
  // deleting the account deletes what it shared
  await call(env, "/api/me", { method: "DELETE", cookie: a.cookie })
  assert.equal((await call(env, "/api/pulse", { cookie: b.cookie }).then(json)).items.length, 0)
  assert.equal(scrub("Inspection on M/T Blue Whale went well, IMO no. 9876543."), "Inspection on the ship went well, .")
})

test("if the AI is busy the debrief waits, and the scheduled run checks it later", async () => {
  const env = fresh()
  const a = await signIn(env, "late")
  fakeClaude.next = () => new Response("overloaded", { status: 529 })
  const r = await call(env, "/api/pulse", { method: "POST", cookie: a.cookie, body: { text: "PSC inspection, they looked at the oily water separator records and the oil record book in detail." } }).then(json)
  assert.equal(r.body.status, "pending")
  fakeClaude.next = () => claudeText(JSON.stringify({ ok: true, summary: "PSC focused on pollution prevention records.", questions: ["Oil record book entries"], topics: ["Pollution prevention"], region: "", inspection: "PSC" }))
  let waited = []
  await worker.scheduled({ scheduledTime: Date.parse("2026-10-24T10:20:00Z") }, env, { waitUntil: (p) => waited.push(p) })
  await Promise.all(waited)
  assert.equal((await call(env, "/api/pulse", { cookie: a.cookie }).then(json)).items.length, 1)
})

/* ---------------- weekly leagues ---------------- */
test("leagues: this week's XP by role group, anonymous unless you choose a name, daily cap", async () => {
  const env = fresh()
  const wk = weekOf(Date.now())
  const [mon, tue] = wk.days
  const lastWeek = new Date(wk.start - DAYMS).toISOString().slice(0, 10)
  const players = [
    ["p1", "2/O", { [mon]: 120, [tue]: 80 }, null],
    ["p2", "C/O", { [mon]: 300, [lastWeek]: 900 }, { show: true, name: "Captain Ana" }],
    ["p3", "3/E", { [mon]: 50 }, null],
    ["p4", "3/O", { [mon]: 99999 }, { show: true, name: "visit www.spam.com" }],
    ["p5", "Master", {}, null],
  ]
  const cookies = {}
  for (const [sub, rank, days, league] of players) {
    const { cookie } = await signIn(env, sub)
    cookies[sub] = cookie
    await call(env, "/api/state", { method: "PUT", cookie, body: { base: 0, data: { progress: { days }, extras: { "sr.profile": { v: { rank }, t: 1 }, ...(league ? { "sr.league": { v: league, t: 1 } } : {}) } } } })
  }
  resetLeagueCache(env.DB)
  const v = await call(env, "/api/league", { cookie: cookies.p1 }).then(json)
  assert.equal(v.group, "deck")
  assert.deepEqual(v.top.map((t) => t.xp), [500, 300, 200], "p4 capped at 500 a day; last week doesn't count")
  assert.equal(v.top[1].name, "Captain Ana")
  assert.match(v.top[0].name, /^Third Officer \d{4}$/, "a spammy name falls back to anonymous")
  assert.match(v.top[2].name, /^Second Officer \d{4}$/)
  assert.equal(v.top[2].you, true)
  assert.deepEqual([v.you.pos, v.you.xp, v.you.toNext], [3, 200, 101])
  assert.equal(v.players, 3, "the Master has no XP this week, so isn't listed")
  const eng = await call(env, "/api/league?group=engine", { cookie: cookies.p1 }).then(json)
  assert.equal(eng.top.length, 1)
  assert.equal(eng.you.inGroup, false)
  assert.ok(!JSON.stringify(v.body).includes("example.com"), "no emails")
  assert.equal(cleanName("Ana"), "Ana")
  assert.equal(cleanName("a"), null)
  assert.equal(cleanName("http://x"), null)
  assert.equal((await call(env, "/api/league")).status, 401)
})

test("when the AI can't be reached from the scheduled job, the next visit has it read the new items", async () => {
  const env = fresh()
  const now = Date.now()
  const { fetchImpl } = feedWorld(now)
  const blocked = async (url, init) => (String(url).startsWith("https://api.anthropic.com/") ? new Response("Request not allowed", { status: 403 }) : fetchImpl(url, init))
  const r = await runAll(env, now, blocked)
  assert.ok(r.added > 0)
  assert.equal(r.read, 0)
  // a visit: served at once with what's live (nothing yet), and the AI reads in the background
  const waits = []
  const { handleFeed } = await import("../worker/feed.js")
  fakeClaude.next = (body) => {
    const n = (body.messages[0].content.match(/^Item \d+/gm) || []).length
    return claudeText(JSON.stringify(Array.from({ length: n }, (_, i) => ({ n: i + 1, relevance: 80, kind: "alert", takeaway: "Takeaway.", check: "Check.", roles: ["deck"], topics: [] }))))
  }
  const res = await handleFeed(new Request("https://nilobs.com/api/feed"), env, { waitUntil: (p) => waits.push(p) })
  const first = await res.json()
  assert.ok(first.pending > 0)
  assert.equal(waits.length, 1)
  await Promise.all(waits)
  // a second visit straight after doesn't start another read (one at a time)
  const waits2 = []
  const second = await (await handleFeed(new Request("https://nilobs.com/api/feed"), env, { waitUntil: (p) => waits2.push(p) })).json()
  assert.equal(waits2.length, 0)
  assert.equal(second.pending, 0)
  assert.ok(second.items.length >= 2)
})
