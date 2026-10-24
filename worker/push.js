// Daily reminders (opt-in web push). A browser that turns them on gives us its push address and the hour it
// wants reminding, in its own time zone. Every 15 minutes (worker/index.js → scheduled) the Worker sends an empty
// push to each browser whose hour has come and that hasn't had one today; the service worker (public/sw.js)
// then asks /api/push/message what to say, so the message is personal and always current.
//
// Pushes are signed with a key the Worker makes for itself on first use and keeps in D1 (VAPID, RFC 8292), so there
// is nothing to set up. Empty pushes need no payload encryption. Only the big browsers' push services are accepted
// as addresses, so the Worker never posts anywhere else.
//
//   GET  /api/push/key          the public key a browser subscribes with
//   POST /api/push/subscribe    { endpoint, hour, tz } (signed in)
//   POST /api/push/unsubscribe  { endpoint } (signed in)
//   POST /api/push/test         send this account's browsers a reminder now (signed in)
//   GET  /api/push/message      what the reminder says right now (signed in; the service worker asks)
import { DAY, b64url, ensureLiveSchema, enc, json } from "./live.js"
import { latestFeed } from "./feed.js"
import { ROLES } from "../app/src/roles.ts"
import { sideOfRank } from "./live.js"

const ROLE = new Map(ROLES.map((r) => [r.id, r]))
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/, /^([a-z0-9-]+\.)*notify\.windows\.com$/]
export const pushHostOk = (endpoint) => {
  try {
    const u = new URL(endpoint)
    return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname)) && endpoint.length < 1000
  } catch {
    return false
  }
}

/* ---------------- the signing key ---------------- */
const keys = new WeakMap() // D1 binding → { pub, key }
export async function vapid(db) {
  if (keys.has(db)) return keys.get(db)
  await ensureLiveSchema(db)
  let row = await db.prepare("SELECT v FROM app_keys WHERE k = 'vapid'").first()
  if (!row) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
    const v = { jwk: await crypto.subtle.exportKey("jwk", pair.privateKey), pub: b64url(await crypto.subtle.exportKey("raw", pair.publicKey)) }
    await db.prepare("INSERT OR IGNORE INTO app_keys (k, v) VALUES ('vapid', ?)").bind(JSON.stringify(v)).run()
    row = await db.prepare("SELECT v FROM app_keys WHERE k = 'vapid'").first() // two isolates at once: everyone uses the first
  }
  const v = JSON.parse(row.v)
  const out = { pub: v.pub, key: await crypto.subtle.importKey("jwk", v.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]) }
  keys.set(db, out)
  return out
}
/** The VAPID Authorization header for one push service: an ES256 token for its origin, valid 12 hours. */
export async function vapidAuth(endpoint, v, now = Date.now(), subject = "https://nilobs.com") {
  const head = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })))
  const body = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })))
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, v.key, enc.encode(`${head}.${body}`))
  return `vapid t=${head}.${body}.${b64url(sig)}, k=${v.pub}`
}

/* ---------------- sending ---------------- */
const localOf = (now, tz) => {
  const d = new Date(now + tz * 60000)
  return { hour: d.getUTCHours(), day: d.toISOString().slice(0, 10) }
}
async function send(env, v, sub, now, fetchImpl) {
  const res = await fetchImpl(sub.endpoint, {
    method: "POST",
    headers: { ttl: "43200", urgency: "normal", authorization: await vapidAuth(sub.endpoint, v, now, env.NILOBS_PUSH_SUBJECT || "https://nilobs.com") },
    body: new Uint8Array(0),
  })
  return res.status
}
/** Send one reminder; returns the outcome and the database changes it calls for (run together in one batch). */
async function deliver(env, sub, now, fetchImpl, v) {
  let status = 0
  try {
    status = await send(env, v, sub, now, fetchImpl)
  } catch {
    status = 0
  }
  const db = env.DB
  if (status === 404 || status === 410) return ["gone", [db.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(sub.endpoint)]]
  if (status >= 200 && status < 300) return ["sent", [db.prepare("UPDATE push_subs SET last_day = ?, fails = 0 WHERE endpoint = ?").bind(localOf(now, sub.tz).day, sub.endpoint)]]
  // a push service having a bad moment: try again later, give up after five failures in a row
  return ["failed", [db.prepare("UPDATE push_subs SET fails = fails + 1 WHERE endpoint = ?").bind(sub.endpoint), db.prepare("DELETE FROM push_subs WHERE endpoint = ? AND fails >= 5").bind(sub.endpoint)]]
}
/** Remind every browser whose hour has come today and that hasn't been reminded yet (at most `limit` per run). */
export async function runPush(env, now = Date.now(), fetchImpl = fetch, limit = 30) {
  await ensureLiveSchema(env.DB)
  const subs = (await env.DB.prepare("SELECT * FROM push_subs ORDER BY created_at LIMIT 5000").all()).results || []
  const due = subs.filter((s) => {
    const l = localOf(now, s.tz)
    return l.hour === s.hour && s.last_day !== l.day
  })
  const report = { due: due.length, sent: 0, gone: 0, failed: 0 }
  if (!due.length) return report
  const v = await vapid(env.DB)
  const changes = []
  for (const s of due.slice(0, limit)) {
    const [outcome, stmts] = await deliver(env, s, now, fetchImpl, v)
    report[outcome]++
    changes.push(...stmts)
  }
  if (changes.length) await env.DB.batch(changes)
  return report
}

/* ---------------- what the reminder says ---------------- */
const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {})
const dayKey = (t) => new Date(t).toISOString().slice(0, 10)
/** A short, personal, honest reminder: the inspection countdown, the streak, today's drill, new updates. */
export async function messageFor(db, userId, now = Date.now(), tz = 0) {
  const row = await db.prepare("SELECT data FROM user_state WHERE user_id = ?").bind(userId).first().catch(() => null)
  let data = {}
  try {
    data = JSON.parse(row?.data || "{}")
  } catch {
    /* no saved progress yet */
  }
  const progress = obj(data.progress)
  const extras = obj(data.extras)
  const profile = obj(obj(extras["sr.profile"]).v)
  const briefRaw = obj(obj(extras["sr.brief"]).v)
  const today = dayKey(now + tz * 60000)
  const yesterday = dayKey(now + tz * 60000 - DAY)
  const streak = obj(progress.streak)
  const liveStreak = streak.last === today || streak.last === yesterday ? Number(streak.n) || 0 : 0
  const drillDone = obj(progress.drill).day === today
  const side = sideOfRank(profile.rank, ROLE)
  const items = await latestFeed(db, { limit: 20 }).catch(() => [])
  const fresh = items.filter((i) => i.publishedAt > now - DAY && (!i.roles.length || side === "other" || i.roles.includes(side)))
  const updates = fresh.length ? ` ${fresh.length} new industry update${fresh.length === 1 ? "" : "s"} for you.` : ""
  const date = typeof briefRaw.date === "string" ? Date.parse(briefRaw.date + "T00:00:00Z") : NaN
  const daysTo = Number.isFinite(date) ? Math.ceil((date - (now + tz * 60000)) / DAY) : null
  const url = "/#app/daily"
  if (drillDone) return { title: fresh.length ? "New for you today" : "You're done for today", body: fresh.length ? fresh[0].title.slice(0, 120) : "Today's drill is done. Come back tomorrow for a new one.", url: fresh.length ? "/#app/live" : "/#app/today" }
  if (daysTo != null && daysTo >= 0 && daysTo <= 14)
    return { title: daysTo === 0 ? "Inspection day" : `Inspection in ${daysTo} day${daysTo === 1 ? "" : "s"}`, body: `Today's 5-minute drill is on your weakest topics.${updates}`, url }
  if (liveStreak >= 2 && streak.last !== today) return { title: `Keep your ${liveStreak}-day streak`, body: `Today's drill is ready: 5 minutes.${updates}`, url }
  return { title: "Today's drill is ready", body: `5 minutes on your weak spots.${updates}`, url }
}

/* ---------------- routes ---------------- */
export async function handlePush(request, env, user, fetchImpl = fetch) {
  const url = new URL(request.url)
  const path = url.pathname
  await ensureLiveSchema(env.DB)
  if (path === "/api/push/key") return json(200, { publicKey: (await vapid(env.DB)).pub })
  if (!user) return json(401, { error: "Sign in first" })
  if (path === "/api/push/message") {
    const tz = Math.max(-840, Math.min(840, Number(url.searchParams.get("tz")) || 0))
    return json(200, await messageFor(env.DB, user.id, Date.now(), tz))
  }
  if (request.method !== "POST") return json(405, { error: "Use POST" })
  let body = {}
  try {
    body = await request.json()
  } catch {
    return json(400, { error: "Body must be JSON" })
  }
  if (path === "/api/push/subscribe") {
    const endpoint = String(body?.endpoint || "")
    const hour = Math.round(Number(body?.hour))
    const tz = Math.round(Number(body?.tz))
    if (!pushHostOk(endpoint)) return json(400, { error: "That browser's notifications aren't supported.", code: "bad_endpoint" })
    if (!(hour >= 0 && hour <= 23) || !(tz >= -840 && tz <= 840)) return json(400, { error: "Pick a time for the reminder.", code: "bad_time" })
    await env.DB.prepare("INSERT INTO push_subs (endpoint, user_id, hour, tz, created_at, last_day, fails) VALUES (?, ?, ?, ?, ?, NULL, 0) ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, hour = excluded.hour, tz = excluded.tz, fails = 0")
      .bind(endpoint, user.id, hour, tz, Date.now()).run()
    // a few browsers per person is plenty
    await env.DB.prepare("DELETE FROM push_subs WHERE user_id = ? AND endpoint NOT IN (SELECT endpoint FROM push_subs WHERE user_id = ? ORDER BY created_at DESC LIMIT 5)").bind(user.id, user.id).run()
    return json(200, { ok: true, hour, tz })
  }
  if (path === "/api/push/unsubscribe") {
    await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?").bind(String(body?.endpoint || ""), user.id).run()
    return json(200, { ok: true })
  }
  if (path === "/api/push/test") {
    const subs = (await env.DB.prepare("SELECT * FROM push_subs WHERE user_id = ?").bind(user.id).all()).results || []
    if (!subs.length) return json(404, { error: "Reminders aren't on in this browser yet.", code: "no_subscription" })
    const v = await vapid(env.DB)
    let sent = 0
    for (const s of subs.slice(0, 5)) {
      const status = await send(env, v, s, Date.now(), fetchImpl).catch(() => 0)
      if (status === 404 || status === 410) await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(s.endpoint).run()
      else if (status >= 200 && status < 300) sent++
    }
    return json(200, { sent })
  }
  return json(404, { error: "Not found" })
}
