// Weekly leagues: who earned the most XP this week, among people in the same kind of role (deck officers,
// engineers, ratings, shore staff, everyone else). Weeks run Monday to Sunday (UTC) and start from zero.
// Everyone is anonymous ("Second Officer 4821") unless they choose a display name in the app.
// XP comes from each account's synced progress; a day counts for at most DAY_CAP XP, so an edited browser can't
// run away with it.
//
//   GET /api/league?group=deck   the standings for a group (your own group by default) (signed in)
import { DAY, ensureLiveSchema, json, sha256hex, sideOfRank } from "./live.js"
import { ROLES } from "../app/src/roles.ts"

const ROLE = new Map(ROLES.map((r) => [r.id, r]))
export const DAY_CAP = 500
export const GROUPS = [
  { id: "deck", name: "Deck officers" },
  { id: "engine", name: "Engineers" },
  { id: "ratings", name: "Ratings & catering" },
  { id: "shore", name: "Shore staff" },
  { id: "other", name: "Everyone else" },
]
const SHOW = 30
const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {})

/** Monday 00:00 UTC of the week `now` falls in, and the day keys of that week. */
export function weekOf(now = Date.now()) {
  const d = new Date(now)
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * DAY
  const days = Array.from({ length: 7 }, (_, i) => new Date(start + i * DAY).toISOString().slice(0, 10))
  return { start, end: start + 7 * DAY, days }
}
/** A display name someone chose, if it's a reasonable one; otherwise null. */
export function cleanName(s) {
  const t = String(s || "").replace(/\s+/g, " ").trim()
  if (t.length < 2 || t.length > 24 || /https?:|www\.|@|\d{6,}/i.test(t) || !/^[\p{L}\p{N} .'-]+$/u.test(t)) return null
  return t
}

const cache = new WeakMap() // D1 binding → { at, week, stamp, rows }
async function players(db, now) {
  const wk = weekOf(now)
  await ensureLiveSchema(db)
  // recomputed as soon as anyone's progress is saved (a cheap check), otherwise reused for a few minutes
  const st = await db.prepare("SELECT COUNT(*) AS n, MAX(updated_at) AS t FROM user_state").first()
  const stamp = `${st?.n || 0}:${st?.t || 0}`
  const hit = cache.get(db)
  if (hit && hit.week === wk.start && hit.stamp === stamp && now - hit.at < 5 * 60000) return hit.rows
  const states = (await db.prepare("SELECT user_id, data FROM user_state LIMIT 20000").all()).results || []
  const rows = []
  for (const s of states) {
    let data = {}
    try {
      data = JSON.parse(s.data || "{}")
    } catch {
      continue
    }
    const days = obj(obj(data.progress).days)
    const xp = wk.days.reduce((sum, k) => sum + Math.min(DAY_CAP, Math.max(0, Math.round(Number(days[k]) || 0))), 0)
    const extras = obj(data.extras)
    const profile = obj(obj(extras["sr.profile"]).v)
    const league = obj(obj(extras["sr.league"]).v)
    const role = ROLE.get(profile.rank)
    const roleName = profile.rank === "Other" ? String(profile.roleName || "").trim().slice(0, 30) || "Crew" : role?.name || "Crew"
    const code = parseInt((await sha256hex(`league:${s.user_id}`)).slice(0, 6), 16) % 9000 + 1000
    const chosen = league.show ? cleanName(league.name) : null
    rows.push({ id: s.user_id, xp, group: sideOfRank(profile.rank, ROLE), name: chosen || `${roleName} ${code}`, role: roleName, named: !!chosen })
  }
  cache.set(db, { at: now, week: wk.start, stamp, rows })
  return rows
}
export const resetLeagueCache = (db) => cache.delete(db)

export async function leagueView(db, userId, wantGroup, now = Date.now()) {
  const all = await players(db, now)
  const me = all.find((p) => p.id === userId)
  const group = GROUPS.some((g) => g.id === wantGroup) ? wantGroup : me?.group || "other"
  const ranked = all.filter((p) => p.group === group && p.xp > 0).sort((a, b) => b.xp - a.xp || (a.id < b.id ? -1 : 1))
  const pos = ranked.findIndex((p) => p.id === userId)
  const wk = weekOf(now)
  return {
    week: { start: wk.start, end: wk.end },
    group,
    groups: GROUPS.map((g) => ({ ...g, players: all.filter((p) => p.group === g.id && p.xp > 0).length })),
    players: ranked.length,
    top: ranked.slice(0, SHOW).map((p, i) => ({ pos: i + 1, name: p.name, role: p.role, xp: p.xp, you: p.id === userId })),
    you: me
      ? { pos: pos >= 0 ? pos + 1 : null, xp: me.xp, name: me.name, named: me.named, inGroup: me.group === group, toNext: pos > 0 ? ranked[pos - 1].xp - me.xp + 1 : 0 }
      : null,
  }
}

export async function handleLeague(request, env, user) {
  if (!user) return json(401, { error: "Sign in first" })
  if (request.method !== "GET") return json(405, { error: "Use GET" })
  const url = new URL(request.url)
  return json(200, await leagueView(env.DB, user.id, url.searchParams.get("group") || "", Date.now()))
}
