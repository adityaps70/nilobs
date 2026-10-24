// Merging what two devices saved for one account. Pure functions, no React (tests: app/tests/sync.test.mjs).
//
// The server keeps one copy per account with a version number. A device that saved on an old version gets
// the newer copy back and merges it with its own using the rules below, then saves again.
//  - Progress: never goes backwards. XP, streaks, stats take the higher value; badges, read stories and
//    flashcard schedules are combined.
//  - Other saved screens (profile, brief, ratings, chat): the most recently changed copy wins, per screen.
// Credits are not synced this way: signed in, the server keeps the wallet itself (worker/wallet.js), and
// whatever a browser sends as a wallet is ignored.

export const WALLET_KEY = "sr.wallet"
export const WALLET_ACCOUNT_KEY = "sr.wallet.acct"
export const PROGRESS_KEY = "sr.progress"
/** Saved screens that follow the account. Photo thumbnails, the night setting and a half-done interview stay on the device. */
export const EXTRA_KEYS = ["sr.profile", "sr.ratings", "sr.saved", "sr.lib", "sr.brief", "sr.ask", "sr.explain", "sr.currency", "sr.streak", "sr.rolepack", "sr.league"]
export const MAX_EXTRA_CHARS = 80_000

export type Extras = Record<string, { v: unknown; t: number }>
export interface Synced {
  progress: Record<string, unknown> | null
  extras: Extras
}

/* ---------------- progress ---------------- */
type R = Record<string, unknown>
const obj = (x: unknown): R => (x && typeof x === "object" && !Array.isArray(x) ? (x as R) : {})
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0)
const str = (x: unknown) => (typeof x === "string" ? x : "")
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
const maxNums = (x: unknown, y: unknown) => {
  const out: R = { ...obj(x) }
  for (const [k, v] of Object.entries(obj(y))) out[k] = typeof v === "number" ? Math.max(num(out[k]), v) : out[k] ?? v
  return out
}
const later = <T extends R>(x: T, y: T, key: string) => (str(y[key]) > str(x[key]) ? y : x)

/** Progress never goes backwards: two copies → the best of both. */
export function mergeProgress(aIn: unknown, bIn: unknown): R {
  const a = obj(aIn), b = obj(bIn)
  if (!Object.keys(a).length) return b
  if (!Object.keys(b).length) return a
  const sa = obj(a.streak), sb = obj(b.streak)
  const streakSide = str(sb.last) > str(sa.last) || (str(sb.last) === str(sa.last) && num(sb.n) > num(sa.n)) ? sb : sa
  const ma = obj(a.missions), mb = obj(b.missions)
  const missions =
    str(ma.day) === str(mb.day)
      ? { ...maxNums(ma, mb), day: ma.day, claimed: !!(ma.claimed || mb.claimed) }
      : later(ma, mb, "day")
  const srs: R = { ...obj(a.srs) }
  for (const [k, v] of Object.entries(obj(b.srs))) {
    const x = arr(srs[k]), y = arr(v)
    srs[k] = !x.length ? y : num(y[1]) > num(x[1]) || (num(y[1]) === num(x[1]) && num(y[0]) > num(x[0])) ? y : x
  }
  const badges: R = { ...obj(b.badges), ...obj(a.badges) }
  for (const [k, v] of Object.entries(obj(b.badges))) if (str(v) && (!str(badges[k]) || str(v) < str(badges[k]))) badges[k] = v
  const topic: R = { ...obj(a.topic) }
  for (const [k, v] of Object.entries(obj(b.topic))) {
    const x = obj(topic[k]), y = obj(v)
    const pick = (f: string) => (num(arr(y[f])[1]) > num(arr(x[f])[1]) ? y[f] : x[f] ?? y[f])
    topic[k] = { c: pick("c"), s: pick("s"), i: pick("i") }
  }
  const interviews = [...new Map([...arr(a.interviews), ...arr(b.interviews)].map((r) => [num(obj(r).at), r])).values()]
    .sort((x, y) => num(obj(y).at) - num(obj(x).at))
    .slice(0, 30)
  const ai = obj(a.aiToday), bi = obj(b.aiToday)
  return {
    ...a,
    xp: Math.max(num(a.xp), num(b.xp)),
    days: maxNums(a.days, b.days),
    streak: { ...streakSide, best: Math.max(num(sa.best), num(sb.best)) },
    missions,
    stats: maxNums(a.stats, b.stats),
    srs,
    badges,
    decks: [...new Set([...arr(a.decks), ...arr(b.decks)])],
    kit: { ...obj(a.kit), ...obj(b.kit) },
    read: [...new Set([...arr(a.read), ...arr(b.read)])],
    topic,
    interviews,
    ood: later(obj(a.ood), obj(b.ood), "day"),
    aiToday: str(ai.day) === str(bi.day) ? { day: ai.day, n: Math.max(num(ai.n), num(bi.n)) } : later(ai, bi, "day"),
    levelPaid: Math.max(num(a.levelPaid), num(b.levelPaid)),
    milestones: [...new Set([...arr(a.milestones), ...arr(b.milestones)])],
    freezeMonth: str(a.freezeMonth) > str(b.freezeMonth) ? a.freezeMonth : b.freezeMonth,
    drill: (() => {
      const da = obj(a.drill), db = obj(b.drill)
      return { day: str(db.day) > str(da.day) ? db.day : da.day ?? "", done: Math.max(num(da.done), num(db.done)) }
    })(),
  }
}

/* ---------------- saved screens ---------------- */
/** Per screen, the copy changed most recently wins. With `fillOnly`, `b` only fills screens `a` doesn't have. */
export function mergeExtras(a: Extras, b: Extras, fillOnly = false): Extras {
  const out: Extras = { ...a }
  for (const [k, v] of Object.entries(b || {})) {
    if (!EXTRA_KEYS.includes(k) || !v || typeof v !== "object") continue
    if (!out[k] || (!fillOnly && num(v.t) > num(out[k].t))) out[k] = v
  }
  return out
}

/**
 * The server's copy and this device's → what both should hold.
 * `sameAccount`: this device has synced with this account before (otherwise it was used signed-out).
 */
export function mergeAll(server: Synced, local: Synced, sameAccount: boolean): Synced {
  return {
    progress: server.progress && local.progress ? mergeProgress(server.progress, local.progress) : server.progress ?? local.progress,
    extras: mergeExtras(server.extras || {}, local.extras || {}, !sameAccount),
  }
}
