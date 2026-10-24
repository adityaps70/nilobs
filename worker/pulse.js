// The inspection pulse: what inspectors are asking right now, from debriefs NilObs users share.
// A shared debrief is kept privately as sent; Claude checks it's a real inspection debrief and rewrites it for
// other crews with every name taken out (ships, people, companies, oil majors, terminals; ports become regions).
// Only that rewrite is ever shown. The owner can hide any of them from the admin dashboard.
//
//   POST /api/pulse   { text }   share a debrief (signed in; a few a day)
//   GET  /api/pulse              the latest shared debriefs and this fortnight's trending topics (signed in)
import { DAY, claudeJson, cleanTopics, ensureLiveSchema, json, plain, sideOfRank, TOPICS } from "./live.js"
import { ROLES } from "../app/src/roles.ts"

const ROLE = new Map(ROLES.map((r) => [r.id, r]))
const PER_DAY = 3
const KINDS = ["SIRE 2.0", "PSC", "CDI", "Terminal", "Other"]
const SIDE_LABEL = { deck: "Deck officer", engine: "Engineer", ratings: "Rating", shore: "Shore staff", other: "Crew" }

const SYSTEM = `You receive a seafarer's own debrief of a ship inspection (SIRE 2.0 vetting, port state control, CDI or a terminal inspection).
First decide whether it is a genuine debrief of a real inspection (not a test, spam, advertising, abuse or a question).
Then rewrite it for other crews preparing for the same kind of inspection, completely anonymously:
no names of ships, people, companies, oil majors, terminals, ports or flags; no IMO numbers; no dates. A port becomes a broad region ("a Middle East Gulf port", "a North European port").
Paraphrase in your own words; keep what the inspector looked at and asked, and what went well or badly.
Answer with JSON only:
{"ok": true or false, "reason": "why not, if false",
 "summary": "what this inspection focused on and how it went, max 260 characters",
 "questions": ["something the inspector asked or checked, paraphrased, max 140 characters", "... up to 6"],
 "topics": up to 3 of ${JSON.stringify(TOPICS)},
 "region": "broad region or empty",
 "inspection": one of ${JSON.stringify(KINDS)}}`

/** A last line of defence after the AI: ship prefixes with a name, IMO numbers and email addresses go. */
export function scrub(s) {
  return String(s || "")
    .replace(/\b(?:M\/?T|M\/?V|MV|MT|SS)\s+["“]?[A-Z][\w-]*(?:\s+[A-Z][\w-]*){0,2}["”]?/g, "the ship")
    .replace(/\bIMO\s*(?:No\.?|number)?\s*\d{7}\b/gi, "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Have the AI check and de-identify one debrief, then publish or reject it. */
export async function processDebrief(env, id, fetchImpl = fetch) {
  const row = await env.DB.prepare("SELECT id, raw FROM debriefs WHERE id = ?").bind(id).first()
  if (!row) return null
  const out = await claudeJson(env, { system: SYSTEM, prompt: `Debrief:\n${row.raw}`, maxTokens: 900 }, fetchImpl)
  if (!out || typeof out !== "object") {
    await env.DB.prepare("UPDATE debriefs SET status = 'pending' WHERE id = ?").bind(id).run() // tried again by the next scheduled run
    return "pending"
  }
  if (!out.ok) {
    await env.DB.prepare("UPDATE debriefs SET status = 'rejected', pub = ? WHERE id = ?").bind(JSON.stringify({ reason: plain(out.reason, 200) }), id).run()
    return "rejected"
  }
  const pub = {
    summary: scrub(plain(out.summary, 280)),
    questions: (Array.isArray(out.questions) ? out.questions : []).map((q) => scrub(plain(q, 160))).filter(Boolean).slice(0, 6),
    region: scrub(plain(out.region, 60)),
    inspection: KINDS.includes(out.inspection) ? out.inspection : "Other",
  }
  if (!pub.summary && !pub.questions.length) {
    await env.DB.prepare("UPDATE debriefs SET status = 'rejected', pub = ? WHERE id = ?").bind(JSON.stringify({ reason: "nothing to share" }), id).run()
    return "rejected"
  }
  await env.DB.prepare("UPDATE debriefs SET status = 'live', pub = ?, topics = ? WHERE id = ?").bind(JSON.stringify(pub), JSON.stringify(cleanTopics(out.topics)), id).run()
  return "live"
}
/** Debriefs the AI couldn't get to (it was busy) are tried again on the scheduled run. */
export async function runPulse(env, fetchImpl = fetch) {
  await ensureLiveSchema(env.DB)
  // waiting for the AI, or left half-done by a Worker that stopped
  const rows = (await env.DB.prepare("SELECT id FROM debriefs WHERE status = 'pending' OR (status = 'checking' AND created_at < ?) ORDER BY created_at LIMIT 5").bind(Date.now() - 10 * 60000).all()).results || []
  for (const r of rows) await processDebrief(env, r.id, fetchImpl)
  return rows.length
}

const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {})
function publicItem(r, now) {
  let pub = {}
  let topics = []
  try {
    pub = JSON.parse(r.pub || "{}")
    topics = JSON.parse(r.topics || "[]")
  } catch {
    /* shown without its details */
  }
  return {
    id: r.id,
    day: Math.floor(r.created_at / DAY) * DAY, // to the day, never the minute
    daysAgo: Math.max(0, Math.floor((now - r.created_at) / DAY)),
    ship: r.ship || "",
    role: SIDE_LABEL[r.role] || "Crew",
    region: pub.region || "",
    inspection: pub.inspection || "Other",
    summary: pub.summary || "",
    questions: pub.questions || [],
    topics,
  }
}
export async function pulseView(db, now = Date.now()) {
  await ensureLiveSchema(db)
  const rows = (await db.prepare("SELECT * FROM debriefs WHERE status = 'live' ORDER BY created_at DESC LIMIT 40").all()).results || []
  const recent = (await db.prepare("SELECT topics FROM debriefs WHERE status = 'live' AND created_at > ?").bind(now - 14 * DAY).all()).results || []
  const count = new Map()
  for (const r of recent) {
    let t = []
    try {
      t = JSON.parse(r.topics || "[]")
    } catch {
      /* skip */
    }
    for (const x of t) count.set(x, (count.get(x) || 0) + 1)
  }
  const week = (await db.prepare("SELECT COUNT(*) AS n FROM debriefs WHERE status = 'live' AND created_at > ?").bind(now - 7 * DAY).first())?.n || 0
  return {
    items: rows.map((r) => publicItem(r, now)),
    trending: [...count.entries()].map(([topic, n]) => ({ topic, n })).sort((a, b) => b.n - a.n).slice(0, 8),
    week: Number(week),
  }
}

export async function handlePulse(request, env, user, ctx, fetchImpl = fetch) {
  await ensureLiveSchema(env.DB)
  if (!user) return json(401, { error: "Sign in first" })
  if (request.method === "GET") return json(200, await pulseView(env.DB))
  if (request.method !== "POST") return json(405, { error: "Use GET or POST" })
  let body = {}
  try {
    body = await request.json()
  } catch {
    return json(400, { error: "Body must be JSON" })
  }
  const text = String(body?.text || "").trim().slice(0, 4000)
  if (text.length < 40) return json(400, { error: "Write a little more about what the inspector looked at.", code: "too_short" })
  const now = Date.now()
  const today = (await env.DB.prepare("SELECT COUNT(*) AS n FROM debriefs WHERE user_id = ? AND created_at > ?").bind(user.id, now - DAY).first())?.n || 0
  if (today >= PER_DAY) return json(429, { error: "Thanks! That's plenty for today. Share more tomorrow.", code: "limit" })
  // who shared it (shown only as a rough role and ship type) comes from the account, not the browser
  const st = await env.DB.prepare("SELECT data FROM user_state WHERE user_id = ?").bind(user.id).first().catch(() => null)
  let profile = {}
  try {
    profile = obj(obj(obj(JSON.parse(st?.data || "{}").extras)["sr.profile"]).v)
  } catch {
    /* no profile yet */
  }
  const id = "db_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20)
  await env.DB.prepare("INSERT INTO debriefs (id, user_id, created_at, status, ship, role, raw) VALUES (?, ?, ?, 'checking', ?, ?, ?)")
    .bind(id, user.id, now, typeof profile.ship === "string" ? profile.ship.slice(0, 20) : "", sideOfRank(profile.rank, ROLE), text).run()
  // usually the AI answers in a few seconds, so the sharer sees the result; if not, it finishes in the background
  const job = processDebrief(env, id, fetchImpl).catch(() => "pending")
  ctx?.waitUntil?.(job)
  const status = await Promise.race([job, new Promise((r) => setTimeout(() => r("checking"), 8000))])
  return json(200, { ok: true, id, status })
}
