// Crews and fleet plans.
//
// A crew is a private group with an invite link: a ship's crew, a class, a company's officers. Members see a
// private weekly board (first names, weekly XP, streak, today's drill). Free for anyone.
// A fleet plan is a crew the company pays for: N seats, each a Watchkeeper plan for whoever holds it while the
// fleet is paid up (worker/pay.js takes the payment; the seat reaches the member's wallet the next time it's
// read, see seatFor and worker/wallet.js). The owner of a fleet also gets a crew-readiness report: practice
// scores by topic, streaks and drills. Members are told this before they join a fleet. Never chats or photos.
//
//   GET  /api/crews                     your crews
//   GET  /api/crews/preview?code=       a crew's name before joining
//   GET  /api/crews/board?id=           the weekly board (members)
//   GET  /api/crews/report?id=          the readiness report (the owner of a fleet)
//   POST /api/crews { action, ... }     create, join, leave, rename, newcode, remove, delete
import * as E from "../app/src/economy.ts"
import { ROLES } from "../app/src/roles.ts"
import { json, sha256hex, sideOfRank } from "./live.js"
import { DAY_CAP, weekOf } from "./league.js"

const ROLE = new Map(ROLES.map((r) => [r.id, r]))
export const MAX_CREWS = 5 // crews one person can be in
export const MAX_MEMBERS = 300
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no 0/O, 1/I

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS crews (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, code TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, seats INTEGER NOT NULL DEFAULT 0, paid_until INTEGER NOT NULL DEFAULT 0, cycle TEXT)",
  "CREATE INDEX IF NOT EXISTS crews_owner ON crews (owner_id)",
  // left_at: someone who left or was removed keeps a seat they were given until seat_until (the period they had)
  "CREATE TABLE IF NOT EXISTS crew_members (crew_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_at INTEGER NOT NULL, seat_until INTEGER NOT NULL DEFAULT 0, left_at INTEGER, PRIMARY KEY (crew_id, user_id))",
  "CREATE INDEX IF NOT EXISTS crew_members_user ON crew_members (user_id)",
]
const ready = new WeakMap() // per D1 binding: the tables are created once
export function ensureCrewSchema(db) {
  let p = ready.get(db)
  if (!p) {
    p = db.batch(SCHEMA.map((q) => db.prepare(q))).catch((e) => {
      ready.delete(db)
      throw e
    })
    ready.set(db, p)
  }
  return p
}
export const resetCrewSchemaFlag = () => {} // (kept for tests; the tables are tracked per database)

/* ---------------- helpers ---------------- */
export function cleanCrewName(s) {
  const t = String(s || "").replace(/\s+/g, " ").trim()
  if (t.length < 2 || t.length > 40 || /https?:|www\.|@/i.test(t) || !/^[\p{L}\p{N} .,'&()/#-]+$/u.test(t)) return null
  return t
}
const newCode = () => {
  const b = crypto.getRandomValues(new Uint8Array(8))
  return [...b].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join("")
}
export const cleanCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)
const memberKey = async (crewId, userId) => (await sha256hex(`crew:${crewId}:${userId}`)).slice(0, 12)
const parse = (s, d) => {
  try {
    return s == null ? d : JSON.parse(s)
  } catch {
    return d
  }
}
const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {})
const firstName = (u) => {
  const n = String(u.name || "").trim()
  if (n) {
    const parts = n.split(/\s+/)
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
  }
  return String(u.email || "Crew").split("@")[0].slice(0, 16)
}
const roleNameOf = (p) => (p.rank === "Other" ? String(p.roleName || "").trim().slice(0, 30) || "Crew" : ROLE.get(p.rank)?.name || "Crew")
const isActive = (c, now) => c.seats > 0 && c.paid_until > now

/** Seats taken right now: current members with a seat, plus people who left but keep theirs to the end of their period. */
async function seatsUsed(db, crewId, now) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM crew_members WHERE crew_id = ? AND seat_until > ?").bind(crewId, now).first()
  return Number(r?.n) || 0
}

/**
 * Give free seats to members waiting for one (oldest first), up to the fleet's seats, until its paid end.
 * Members who already hold a seat are extended to the new end.
 */
export async function assignSeats(db, crewId, now = Date.now()) {
  const c = await db.prepare("SELECT seats, paid_until FROM crews WHERE id = ?").bind(crewId).first()
  if (!c || !isActive(c, now)) return 0
  const rows = (await db.prepare("SELECT user_id, seat_until, left_at FROM crew_members WHERE crew_id = ? ORDER BY joined_at, rowid").bind(crewId).all()).results || []
  const keepers = rows.filter((r) => r.left_at != null && r.seat_until > now).length
  let free = c.seats - keepers
  const give = []
  for (const r of rows) {
    if (r.left_at != null) continue
    if (free <= 0) break
    give.push(r.user_id)
    free--
  }
  for (let i = 0; i < give.length; i += 90) {
    const chunk = give.slice(i, i + 90)
    await db.prepare(`UPDATE crew_members SET seat_until = ? WHERE crew_id = ? AND user_id IN (${chunk.map(() => "?").join(",")})`).bind(c.paid_until, crewId, ...chunk).run()
  }
  return give.length
}

/** The best fleet seat this user holds now ({ until, name }) or null. Read with the wallet (worker/wallet.js). */
export async function seatFor(db, userId, now = Date.now()) {
  await ensureCrewSchema(db)
  return db.prepare("SELECT m.seat_until AS until, c.name FROM crew_members m JOIN crews c ON c.id = m.crew_id WHERE m.user_id = ? AND m.seat_until > ? ORDER BY m.seat_until DESC LIMIT 1").bind(userId, now).first()
}

/* ---------------- fleet purchases (worker/pay.js) ---------------- */
/** "fleet:<crew id>:<new|renew|add>:<seats>:<monthly|annual>" */
export function parseFleetKey(key) {
  const [kind, crewId, action, seats, cycle] = String(key || "").split(":")
  if (kind !== "fleet" || !/^[a-z0-9]{8,32}$/.test(crewId || "") || !["new", "renew", "add"].includes(action) || !["monthly", "annual"].includes(cycle)) return null
  const n = Math.round(Number(seats))
  if (!Number.isFinite(n) || n < 0) return null
  return { crewId, action, seats: n, cycle }
}
/** What a fleet order costs, checked against the crew as it is now. Only its owner can buy. */
export async function fleetOrder(db, user, key, cur, now = Date.now()) {
  const k = parseFleetKey(key)
  if (!k) return { ok: false, why: "Unknown product" }
  await ensureCrewSchema(db)
  const c = await db.prepare("SELECT * FROM crews WHERE id = ?").bind(k.crewId).first()
  if (!c || c.owner_id !== user.id) return { ok: false, why: "Only the crew's owner can buy its fleet plan." }
  const q = E.fleetQuote(k.action, k.seats, k.cycle, cur, isActive(c, now) ? { seats: c.seats, until: c.paid_until, cycle: c.cycle || "monthly" } : null, now)
  if (!q.ok) return q
  return { ok: true, amount: q.amount, name: `${q.name} (${c.name})` }
}
/** Apply a paid fleet order (once: the caller has just marked the payment paid). */
export async function applyFleet(db, key, now = Date.now()) {
  const k = parseFleetKey(key)
  if (!k) return false
  await ensureCrewSchema(db)
  const c = await db.prepare("SELECT * FROM crews WHERE id = ?").bind(k.crewId).first()
  if (!c) return false
  const term = E.fleetTerm(k.cycle)
  const active = isActive(c, now)
  let seats = c.seats
  let until = c.paid_until
  if (k.action === "new") {
    if (active) {
      until += term
      seats = Math.max(seats, k.seats)
    } else {
      seats = k.seats
      until = now + term
    }
  } else if (k.action === "renew") until = Math.max(until, now) + term
  else seats = seats + k.seats
  await db.prepare("UPDATE crews SET seats = ?, paid_until = ?, cycle = ? WHERE id = ?").bind(seats, until, k.cycle, c.id).run()
  await assignSeats(db, c.id, now)
  return true
}

/* ---------------- reading ---------------- */
async function crewView(db, c, userId, now) {
  const owner = c.owner_id === userId
  const n = await db.prepare("SELECT COUNT(*) AS n FROM crew_members WHERE crew_id = ? AND left_at IS NULL").bind(c.id).first()
  const me = await db.prepare("SELECT seat_until FROM crew_members WHERE crew_id = ? AND user_id = ?").bind(c.id, userId).first()
  const active = isActive(c, now)
  return {
    id: c.id,
    name: c.name,
    owner,
    code: c.code,
    members: Number(n?.n) || 0,
    fleet: c.seats > 0 ? { seats: c.seats, used: await seatsUsed(db, c.id, now), until: c.paid_until, cycle: c.cycle || "monthly", active } : null,
    seatUntil: me?.seat_until > now ? me.seat_until : 0,
  }
}
async function myCrews(db, userId, now) {
  const rows = (await db.prepare("SELECT c.* FROM crews c JOIN crew_members m ON m.crew_id = c.id WHERE m.user_id = ? AND m.left_at IS NULL ORDER BY m.joined_at").bind(userId).all()).results || []
  const out = []
  for (const c of rows) out.push(await crewView(db, c, userId, now))
  return out
}
async function memberOf(db, crewId, userId) {
  return db.prepare("SELECT c.* FROM crews c JOIN crew_members m ON m.crew_id = c.id WHERE c.id = ? AND m.user_id = ? AND m.left_at IS NULL").bind(crewId, userId).first()
}

const MEMBER_ROWS = `SELECT m.user_id, m.joined_at, m.seat_until, u.name, u.email, u.last_seen,
  json_extract(s.data, '$.progress.days') AS days, json_extract(s.data, '$.progress.streak') AS streak,
  json_extract(s.data, '$.progress.drill') AS drill, json_extract(s.data, '$.extras."sr.profile".v') AS profile,
  json_extract(s.data, '$.extras."sr.league".v') AS league, json_extract(s.data, '$.progress.topic') AS topic,
  json_extract(s.data, '$.progress.interviews') AS interviews
  FROM crew_members m JOIN users u ON u.id = m.user_id LEFT JOIN user_state s ON s.user_id = m.user_id
  WHERE m.crew_id = ? AND m.left_at IS NULL ORDER BY m.joined_at, m.rowid LIMIT ${MAX_MEMBERS}`

function weekXp(days, wk) {
  const d = obj(parse(days, {}))
  return wk.days.reduce((sum, k) => sum + Math.min(DAY_CAP, Math.max(0, Math.round(Number(d[k]) || 0))), 0)
}
const liveStreak = (st, today) => {
  const s = obj(parse(st, {}))
  const n = Math.max(0, Math.round(Number(s.n) || 0))
  if (!n || !s.last) return 0
  const gap = Math.round((Date.parse(today) - Date.parse(s.last)) / 86400000)
  return gap <= 1 ? n : 0
}

export async function boardView(db, crew, userId, now = Date.now()) {
  const wk = weekOf(now)
  const today = new Date(now).toISOString().slice(0, 10)
  const rows = (await db.prepare(MEMBER_ROWS).bind(crew.id).all()).results || []
  const members = []
  for (const r of rows) {
    const p = obj(parse(r.profile, {}))
    const league = obj(parse(r.league, {}))
    const drill = obj(parse(r.drill, {}))
    members.push({
      key: await memberKey(crew.id, r.user_id),
      name: (league.show && String(league.name || "").trim().slice(0, 24)) || firstName(r),
      role: roleNameOf(p),
      xp: weekXp(r.days, wk),
      streak: liveStreak(r.streak, today),
      drillToday: drill.day === today,
      you: r.user_id === userId,
      owner: r.user_id === crew.owner_id,
    })
  }
  members.sort((a, b) => b.xp - a.xp || b.streak - a.streak || a.name.localeCompare(b.name))
  return { week: { start: wk.start, end: wk.end }, members }
}

/** Practice score for a topic from synced topic stats (cards, spot-the-finding, AI inspector), like the app's readiness. */
export function topicScore(st) {
  const s = obj(st)
  const pair = (x) => (Array.isArray(x) ? [Number(x[0]) || 0, Number(x[1]) || 0] : [0, 0])
  const [c0, c1] = pair(s.c), [s0, s1] = pair(s.s), [i0, i1] = pair(s.i)
  const parts = []
  if (c1 >= 2) parts.push([c0 / c1, 0.4])
  if (s1 >= 3) parts.push([s0 / s1, 0.2])
  if (i1 >= 1) parts.push([i0 / (i1 * 10), 0.4])
  if (!parts.length) return null
  const ws = parts.reduce((a, [, w]) => a + w, 0)
  return Math.round((parts.reduce((a, [v, w]) => a + Math.min(1, Math.max(0, v)) * w, 0) / ws) * 100)
}

export async function reportView(db, crew, now = Date.now()) {
  const wk = weekOf(now)
  const today = new Date(now).toISOString().slice(0, 10)
  const rows = (await db.prepare(MEMBER_ROWS).bind(crew.id).all()).results || []
  const members = []
  for (const r of rows) {
    const p = obj(parse(r.profile, {}))
    const drill = obj(parse(r.drill, {}))
    const topicStats = obj(parse(r.topic, {}))
    const topics = ROLE.get(p.rank)?.topics || Object.keys(topicStats).slice(0, 10)
    const scores = {}
    for (const t of topics) scores[t] = topicScore(topicStats[t])
    const known = Object.values(scores).filter((v) => v != null)
    const iv = Array.isArray(parse(r.interviews, [])) ? parse(r.interviews, []) : []
    members.push({
      key: await memberKey(crew.id, r.user_id),
      name: String(r.name || "").slice(0, 80) || String(r.email || "").split("@")[0],
      email: String(r.email || ""),
      role: roleNameOf(p),
      side: sideOfRank(p.rank, ROLE),
      lastSeen: Number(r.last_seen) || 0,
      streak: liveStreak(r.streak, today),
      weekXp: weekXp(r.days, wk),
      drills: Math.max(0, Math.round(Number(drill.done) || 0)),
      drillToday: drill.day === today,
      interviews: iv.length,
      scores,
      avg: known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : null,
      covered: known.length,
      topics: topics.length,
      weak: Object.entries(scores).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([t]) => t),
      seat: r.seat_until > now,
      owner: r.user_id === crew.owner_id,
    })
  }
  return { crew: { id: crew.id, name: crew.name }, members, at: now }
}

/* ---------------- routes ---------------- */
export async function handleCrews(request, env, user, now = Date.now()) {
  const db = env.DB
  await ensureCrewSchema(db)
  const url = new URL(request.url)
  const path = url.pathname

  if (path === "/api/crews/preview" && request.method === "GET") {
    const code = cleanCode(url.searchParams.get("code"))
    const c = code.length >= 6 ? await db.prepare("SELECT * FROM crews WHERE code = ?").bind(code).first() : null
    if (!c) return json(404, { error: "That invite link isn't valid any more. Ask for a new one." })
    const n = await db.prepare("SELECT COUNT(*) AS n FROM crew_members WHERE crew_id = ? AND left_at IS NULL").bind(c.id).first()
    const owner = await db.prepare("SELECT name, email FROM users WHERE id = ?").bind(c.owner_id).first()
    return json(200, { name: c.name, members: Number(n?.n) || 0, fleet: isActive(c, now), by: owner ? firstName(owner) : "", seatsFree: isActive(c, now) ? Math.max(0, c.seats - (await seatsUsed(db, c.id, now))) : 0 })
  }
  if (!user) return json(401, { error: "Sign in first" })

  if (request.method === "GET") {
    if (path === "/api/crews") return json(200, { crews: await myCrews(db, user.id, now) })
    const id = String(url.searchParams.get("id") || "")
    const c = await memberOf(db, id, user.id)
    if (!c) return json(404, { error: "Not found" })
    if (path === "/api/crews/board") return json(200, await boardView(db, c, user.id, now))
    if (path === "/api/crews/report") {
      if (c.owner_id !== user.id || c.seats <= 0) return json(404, { error: "Not found" })
      return json(200, await reportView(db, c, now))
    }
    return json(404, { error: "Not found" })
  }
  if (request.method !== "POST" || path !== "/api/crews") return json(405, { error: "Use POST" })
  let body = {}
  try {
    body = await request.json()
  } catch {
    return json(400, { error: "Body must be JSON" })
  }
  const action = String(body?.action || "")
  const count = async () => Number((await db.prepare("SELECT COUNT(*) AS n FROM crew_members WHERE user_id = ? AND left_at IS NULL").bind(user.id).first())?.n) || 0

  if (action === "create") {
    const name = cleanCrewName(body.name)
    if (!name) return json(400, { error: "Give the crew a name of 2 to 40 letters or numbers." })
    if ((await count()) >= MAX_CREWS) return json(409, { error: `You can be in up to ${MAX_CREWS} crews. Leave one first.` })
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16)
    let code = newCode()
    for (let i = 0; i < 3 && (await db.prepare("SELECT id FROM crews WHERE code = ?").bind(code).first()); i++) code = newCode()
    await db.batch([
      db.prepare("INSERT INTO crews (id, name, owner_id, code, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, name, user.id, code, now),
      db.prepare("INSERT INTO crew_members (crew_id, user_id, joined_at) VALUES (?, ?, ?)").bind(id, user.id, now),
    ])
    return json(200, { crew: await crewView(db, await db.prepare("SELECT * FROM crews WHERE id = ?").bind(id).first(), user.id, now), crews: await myCrews(db, user.id, now) })
  }

  if (action === "join") {
    const code = cleanCode(body.code)
    const c = code.length >= 6 ? await db.prepare("SELECT * FROM crews WHERE code = ?").bind(code).first() : null
    if (!c) return json(404, { error: "That invite link isn't valid any more. Ask for a new one." })
    const was = await db.prepare("SELECT left_at FROM crew_members WHERE crew_id = ? AND user_id = ?").bind(c.id, user.id).first()
    if (!was || was.left_at != null) {
      if ((await count()) >= MAX_CREWS) return json(409, { error: `You can be in up to ${MAX_CREWS} crews. Leave one first.` })
      const n = await db.prepare("SELECT COUNT(*) AS n FROM crew_members WHERE crew_id = ? AND left_at IS NULL").bind(c.id).first()
      if ((Number(n?.n) || 0) >= MAX_MEMBERS) return json(409, { error: "That crew is full." })
      if (was) await db.prepare("UPDATE crew_members SET left_at = NULL, joined_at = ? WHERE crew_id = ? AND user_id = ?").bind(now, c.id, user.id).run()
      else await db.prepare("INSERT INTO crew_members (crew_id, user_id, joined_at) VALUES (?, ?, ?)").bind(c.id, user.id, now).run()
      if (isActive(c, now)) await assignSeats(db, c.id, now)
    }
    return json(200, { crew: await crewView(db, c, user.id, now), crews: await myCrews(db, user.id, now) })
  }

  const id = String(body?.id || "")
  const c = await memberOf(db, id, user.id)
  if (!c) return json(404, { error: "Not found" })
  const owner = c.owner_id === user.id

  if (action === "leave") {
    if (owner) return json(409, { error: "You own this crew. Delete it instead, or keep it." })
    await db.prepare("UPDATE crew_members SET left_at = ? WHERE crew_id = ? AND user_id = ?").bind(now, c.id, user.id).run()
    return json(200, { crews: await myCrews(db, user.id, now) })
  }
  if (!owner) return json(403, { error: "Only the crew's owner can do that." })
  if (action === "rename") {
    const name = cleanCrewName(body.name)
    if (!name) return json(400, { error: "Give the crew a name of 2 to 40 letters or numbers." })
    await db.prepare("UPDATE crews SET name = ? WHERE id = ?").bind(name, c.id).run()
  } else if (action === "newcode") {
    await db.prepare("UPDATE crews SET code = ? WHERE id = ?").bind(newCode(), c.id).run()
  } else if (action === "remove") {
    const rows = (await db.prepare("SELECT user_id FROM crew_members WHERE crew_id = ? AND left_at IS NULL").bind(c.id).all()).results || []
    let who = null
    for (const r of rows) if ((await memberKey(c.id, r.user_id)) === String(body.member || "")) who = r.user_id
    if (!who || who === user.id) return json(404, { error: "Not found" })
    await db.prepare("UPDATE crew_members SET left_at = ? WHERE crew_id = ? AND user_id = ?").bind(now, c.id, who).run()
  } else if (action === "delete") {
    // people keep any seat they were given until the end of the period they had
    await db.batch([
      db.prepare("DELETE FROM crew_members WHERE crew_id = ? AND seat_until <= ?").bind(c.id, now),
      db.prepare("UPDATE crew_members SET left_at = ? WHERE crew_id = ? AND left_at IS NULL").bind(now, c.id),
      db.prepare("UPDATE crews SET code = ?, owner_id = ? WHERE id = ?").bind(`X${newCode()}${newCode()}`, `deleted:${c.owner_id}`, c.id),
    ])
    return json(200, { crews: await myCrews(db, user.id, now) })
  } else return json(400, { error: "Unknown action" })
  return json(200, { crew: await crewView(db, await db.prepare("SELECT * FROM crews WHERE id = ?").bind(c.id).first(), user.id, now), crews: await myCrews(db, user.id, now) })
}

/** Account deletion: leave every crew; crews you own close (members keep seats they hold to the end of their period). */
export async function crewsOnDelete(db, userId, now = Date.now()) {
  await ensureCrewSchema(db)
  return [
    db.prepare("UPDATE crew_members SET left_at = ? WHERE crew_id IN (SELECT id FROM crews WHERE owner_id = ?) AND left_at IS NULL").bind(now, userId),
    db.prepare("UPDATE crews SET owner_id = 'deleted', code = 'X' || id WHERE owner_id = ?").bind(userId),
    db.prepare("DELETE FROM crew_members WHERE user_id = ?").bind(userId),
  ]
}
