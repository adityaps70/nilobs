// Merging what two devices saved for one account. Pure functions, no React (tests: app/tests/sync.test.mjs).
//
// The server keeps one copy per account with a version number. A device that saved on an old version gets
// the newer copy back and merges it with its own using the rules below, then saves again.
//  - Wallet, same account on both sides: every spend, grant and refund either device made is kept (the ledger
//    is merged by entry id), and each credit bucket is worked out again from the spends both know about.
//    Monthly refills that both devices granted for the same month count once.
//  - Wallet, first sign-in on a device that was used signed-out: the account's wallet is used, and anything
//    bought on this device (top-ups, a pass, a plan) is added to it. Free welcome credits don't stack.
//  - Progress: never goes backwards. XP, streaks, stats take the higher value; badges, read stories and
//    flashcard schedules are combined.
//  - Other saved screens (profile, brief, ratings, chat): the most recently changed copy wins, per screen.
import { LEDGER_MAX, PLAN_RANK, type Bucket, type Entry, type WalletState } from "@/economy"

export const WALLET_KEY = "sr.wallet"
export const PROGRESS_KEY = "sr.progress"
/** Saved screens that follow the account. Photo thumbnails, the night setting and a half-done interview stay on the device. */
export const EXTRA_KEYS = ["sr.profile", "sr.ratings", "sr.saved", "sr.lib", "sr.brief", "sr.ask", "sr.explain", "sr.currency", "sr.streak"]
export const MAX_EXTRA_CHARS = 80_000

export type Extras = Record<string, { v: unknown; t: number }>
export interface Synced {
  wallet: WalletState | null
  progress: Record<string, unknown> | null
  extras: Extras
}

/* ---------------- wallet ---------------- */
const latestPlanChange = (w: WalletState) =>
  Math.max(w.plan.started || 0, ...w.ledger.filter((e) => e.kind === "plan").map((e) => e.at))

/** Two copies of the same account's wallet → one. `a` is the server's copy, `b` this device's. */
export function mergeWallet(a: WalletState, b: WalletState): WalletState {
  // 1. ledger: union by id; a refund on either side marks the spend refunded
  const byId = new Map<string, Entry>()
  for (const e of [...a.ledger, ...b.ledger]) {
    const o = byId.get(e.id)
    byId.set(e.id, o ? { ...o, refunded: !!(o.refunded || e.refunded) } : { ...e })
  }
  const seen = new Set<string>()
  const ledger: Entry[] = []
  for (const e of [...byId.values()].sort((x, y) => y.at - x.at || (x.id < y.id ? -1 : 1))) {
    // refills and expiries are logged by each device on its own, at the same moment with the same words
    if (e.kind === "expire" || (e.kind === "plan" && e.delta > 0)) {
      const k = `${e.kind}|${e.at}|${e.label}`
      if (seen.has(k)) continue
      seen.add(k)
    }
    ledger.push(e)
  }

  // 2. buckets: union by id; the same month's refill granted on both devices counts once
  const buckets = new Map<string, Bucket>()
  const lefts = new Map<string, number[]>()
  for (const x of [...a.buckets, ...b.buckets]) {
    if (!buckets.has(x.id)) buckets.set(x.id, { ...x })
    lefts.set(x.id, [...(lefts.get(x.id) || []), x.left])
  }
  const alias = new Map<string, string>()
  const refills = new Map<string, string>()
  for (const x of [...buckets.values()].sort((p, q) => (p.id < q.id ? -1 : 1))) {
    if (x.kind !== "monthly") continue
    const k = `${x.at}|${x.expires}|${x.amount}`
    const keep = refills.get(k)
    if (!keep) {
      refills.set(k, x.id)
      continue
    }
    alias.set(x.id, keep)
    lefts.set(keep, [...(lefts.get(keep) || []), ...(lefts.get(x.id) || [])])
    buckets.delete(x.id)
  }
  // 3. what is left in each bucket: its amount minus every spend either device made from it,
  //    never more than either copy had (older spends may have dropped off the ledger)
  const used = new Map<string, number>()
  for (const e of ledger) {
    if (e.kind !== "spend" || e.refunded) continue
    for (const [id, n] of e.alloc || []) {
      const k = alias.get(id) ?? id
      used.set(k, (used.get(k) || 0) + n)
    }
  }
  for (const x of buckets.values()) {
    const fromSpends = Math.max(0, x.amount - (used.get(x.id) || 0))
    x.left = Math.min(fromSpends, Math.max(0, ...(lefts.get(x.id) || [0])))
  }

  // 4. plan: the copy that changed it last; the same plan keeps its furthest refill dates
  const side = latestPlanChange(b) > latestPlanChange(a) ? b : a
  let plan = { ...side.plan }
  if (a.plan.id === b.plan.id && a.plan.cycle === b.plan.cycle)
    plan = { ...plan, started: Math.max(a.plan.started, b.plan.started), renews: Math.max(a.plan.renews, b.plan.renews), term: Math.max(a.plan.term, b.plan.term) }
  const pass = !a.pass ? b.pass : !b.pass ? a.pass : a.pass.until >= b.pass.until ? a.pass : b.pass

  const usage = { ...a.usage }
  for (const [k, v] of Object.entries(b.usage)) (usage as Record<string, number>)[k] = Math.max((usage as Record<string, number>)[k] || 0, v || 0)
  const share =
    a.share.month === b.share.month
      ? { day: a.share.day > b.share.day ? a.share.day : b.share.day, month: a.share.month, n: Math.max(a.share.n, b.share.n), seen: [...new Set([...a.share.seen, ...b.share.seen])].slice(-40) }
      : a.share.month > b.share.month
        ? a.share
        : b.share

  return {
    ...a,
    created: Math.min(a.created, b.created),
    buckets: [...buckets.values()],
    ledger: ledger.slice(0, LEDGER_MAX),
    unlocked: [...new Set([...a.unlocked, ...b.unlocked])],
    decks: [...new Set([...a.decks, ...b.decks])],
    plan,
    pass,
    usage,
    share,
    // an AI call still running belongs to the device that started it
    holds: b.holds.filter((h) => byId.has(h.id) && !byId.get(h.id)!.refunded),
    paid: Math.max(a.paid, b.paid),
  }
}

/**
 * First sign-in on a device that was used signed-out, to an account that already has a wallet.
 * The account's wallet wins; purchases made on this device are added; its free credits are not.
 */
export function adoptWallet(account: WalletState, device: WalletState): WalletState {
  const have = new Set(account.buckets.map((x) => x.id))
  const takePlan = PLAN_RANK[device.plan.id] > PLAN_RANK[account.plan.id]
  const bought = device.buckets.filter(
    (x) => !have.has(x.id) && (x.kind === "topup" || x.kind === "pass" || (takePlan && x.kind === "monthly" && x.at === device.plan.started))
  )
  const entries = device.ledger.filter((e) => (e.kind === "purchase" || (takePlan && e.kind === "plan" && e.at === device.plan.started)) && !account.ledger.some((y) => y.id === e.id))
  const pass = !device.pass ? account.pass : !account.pass || device.pass.until > account.pass.until ? device.pass : account.pass
  return {
    ...account,
    buckets: [...account.buckets, ...bought.map((x) => ({ ...x }))],
    ledger: [...entries, ...account.ledger].sort((x, y) => y.at - x.at).slice(0, LEDGER_MAX),
    unlocked: account.unlocked,
    plan: takePlan ? { ...device.plan } : account.plan,
    pass,
    holds: [],
    paid: account.paid + device.paid,
  }
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
  const wallet =
    server.wallet && local.wallet ? (sameAccount ? mergeWallet(server.wallet, local.wallet) : adoptWallet(server.wallet, local.wallet)) : server.wallet ?? local.wallet
  return {
    wallet,
    progress: server.progress && local.progress ? mergeProgress(server.progress, local.progress) : server.progress ?? local.progress,
    extras: mergeExtras(server.extras || {}, local.extras || {}, !sameAccount),
  }
}
