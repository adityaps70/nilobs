// NilObs credit economy: plans, the Voyage pass, top-ups, and the rules for earning and spending.
// Pure functions over a plain state object (no React, no storage), so the rules are easy to test
// and can move to a server unchanged once there are real accounts and payments.
//
// How it works (modelled on usage-credit products such as Emergent):
// - Everyone starts on Free: 60 welcome credits (expire in 30 days) plus 20 credits every 30 days.
// - Plans refill their allowance every 30 days. Unused plan credits do not roll over.
// - The Voyage pass is a one-off: 1,000 credits and plan perks for 180 days, no subscription.
// - Top-ups never expire. Credits earned in the app (chest, levels, badges, streaks) last 60 days.
// - Spending always uses the credits that expire soonest first; top-ups go last.
// - AI actions that fail are refunded in full. A charge is "held" while the AI works; if the page
//   closes before it finishes, the hold is refunded automatically.
// - Upgrades keep the credits you already have; downgrades take effect at the next renewal;
//   a yearly plan runs for 12 refills (360 days) and cancelling keeps it to the end of that year.

export type Currency = "INR" | "USD"
export type PlanId = "free" | "watch" | "command"
export type Cycle = "monthly" | "annual"
export type BucketKind = "welcome" | "monthly" | "earned" | "pass" | "topup" | "legacy" | "refund"

export interface Bucket {
  id: string
  kind: BucketKind
  label: string
  amount: number
  left: number
  at: number
  expires: number | null
}
export interface Entry {
  id: string
  at: number
  delta: number
  label: string
  kind: "spend" | "grant" | "expire" | "refund" | "purchase" | "plan"
  alloc?: [string, number][]
  refunded?: boolean
}
export interface Usage {
  ai: number
  deep: number
  interviews: number
  briefs: number
  explains: number
  photos: number
  stories: number
  voice: number
  listen: number
  decks: number
  spent: number
}
export type UsageKey = Exclude<keyof Usage, "spent">
export interface WalletState {
  v: 2
  created: number
  buckets: Bucket[]
  ledger: Entry[]
  unlocked: number[]
  decks: string[]
  plan: PlanState
  pass: { until: number } | null
  usage: Usage
  share: { day: string; month: string; n: number; seen: string[] }
  holds: Hold[]
  paid: number // purchases made, for "returning customer" copy
}

export interface PlanState {
  id: PlanId
  cycle: Cycle
  started: number // start of the current 30-day refill cycle
  renews: number // next refill
  term: number // end of the paid term: the next refill for monthly plans, 12 refills for yearly
  cancelAt: number | null
  next: { id: PlanId; cycle: Cycle } | null // a downgrade waiting for the end of the term
}
/** A charge whose AI call is still running. Refunded automatically if it is never settled. */
export interface Hold {
  id: string
  usage?: UsageKey
  at: number
  page: string
}
export const HOLD_FOREIGN_MS = 90_000 // a hold from a page that has since closed or reloaded
export const HOLD_MAX_MS = 600_000 // any hold this old is stuck
export const PLAN_RANK: Record<PlanId, number> = { free: 0, watch: 1, command: 2 }

export const DAY = 86400000
export const CYCLE_DAYS = 30
export const YEAR_CYCLES = 12
export const WELCOME = { credits: 60, days: 30 }
export const EARNED_DAYS = 60
export const LEDGER_MAX = 120

/* ---------------- price list ---------------- */
export interface Plan {
  id: PlanId
  name: string
  credits: number
  price: Record<Currency, Record<Cycle, number>>
  tagline: string
  perks: string[]
}
export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    credits: 20,
    price: { INR: { monthly: 0, annual: 0 }, USD: { monthly: 0, annual: 0 } },
    tagline: "Learn every day, try every AI feature",
    perks: ["60 welcome credits, then 20 every month", "Flashcards, Spot the game, radar, ready kit and missions", "Every AI feature, paid per use", "Earn credits from missions, levels and badges"],
  },
  watch: {
    id: "watch",
    name: "Watchkeeper",
    credits: 400,
    price: { INR: { monthly: 499, annual: 4990 }, USD: { monthly: 7, annual: 70 } },
    tagline: "For officers with an inspection coming",
    perks: ["400 credits every month", "All 59 inspection stories included", "ECDIS, CDI and China coast decks included", "Voice interviews at no extra cost", "A free streak freeze every month"],
  },
  command: {
    id: "command",
    name: "Command",
    credits: 1500,
    price: { INR: { monthly: 1299, annual: 12990 }, USD: { monthly: 17, annual: 170 } },
    tagline: "For masters, chief officers and heavy users",
    perks: ["1,500 credits every month", "Everything in Watchkeeper", "Expert mode: the deepest AI answers and plans", "Lowest price per credit", "Two free streak freezes every month"],
  },
}
export const PLAN_ORDER: PlanId[] = ["free", "watch", "command"]

export const PASS = {
  id: "pass",
  name: "Voyage pass",
  credits: 1000,
  days: 180,
  price: { INR: 1199, USD: 15 } as Record<Currency, number>,
  perks: ["1,000 credits to use over 6 months", "Watchkeeper perks for 6 months", "Pay once. No subscription, nothing renews"],
}

export interface TopUp {
  id: string
  credits: number
  price: Record<Currency, number>
  tag?: string
}
export const TOPUPS: TopUp[] = [
  { id: "t150", credits: 150, price: { INR: 249, USD: 3 } },
  { id: "t500", credits: 500, price: { INR: 699, USD: 9 }, tag: "Popular" },
  { id: "t1200", credits: 1200, price: { INR: 1499, USD: 19 }, tag: "Best value" },
]

/** What things cost, in credits. */
export const COSTS = {
  askQuick: 1, // Ask NilObs, quick answer (fast model)
  askDeep: 4, // Ask NilObs, deep answer (strong model)
  askExpert: 8, // Ask NilObs, expert answer (strong model, high effort). Command plan only
  explain: 1, // why an observation was raised + close-out draft
  photo: 3, // Photo check: per photo, what an inspector would flag and how to fix it
  interview: 8, // AI inspector: five graded questions with follow-ups and a debrief
  voiceInterview: 12, // the same, with the inspector speaking each question
  brief: 20, // inspection brief + day-by-day AI plan
  planRedo: 3, // a fresh version of the AI plan
  story: 5, // one full inspection story, yours to keep
  deck: 40, // one specialist deck, yours to keep
  listen: 1, // hear an answer read aloud in the studio voice
  freeze: 10, // a streak freeze
} as const

/** What the app gives back for learning. */
export const EARN = {
  chest: 3,
  badge: 5,
  share: 25,
  sharePerMonth: 4,
  level: { 2: 10, 3: 15, 4: 20, 5: 30, 6: 40, 7: 50, 8: 60, 9: 80, 10: 100 } as Record<number, number>,
  streak: { 7: 10, 30: 40, 100: 100 } as Record<number, number>,
}

/* ---------------- helpers ---------------- */
const uid = () => Math.random().toString(36).slice(2, 10)
const num = (x: unknown, d = 0) => (typeof x === "number" && Number.isFinite(x) ? x : d)
const pad = (n: number) => String(n).padStart(2, "0")
export const dayOf = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const monthOf = (t: number) => dayOf(t).slice(0, 7)
const clone = <T,>(s: T): T => JSON.parse(JSON.stringify(s)) as T
const emptyUsage = (): Usage => ({ ai: 0, deep: 0, interviews: 0, briefs: 0, explains: 0, photos: 0, stories: 0, voice: 0, listen: 0, decks: 0, spent: 0 })
const termFrom = (start: number, cycle: Cycle) => start + (cycle === "annual" ? YEAR_CYCLES : 1) * CYCLE_DAYS * DAY

export function fmtPrice(n: number, cur: Currency) {
  if (cur === "INR") return "₹" + n.toLocaleString("en-IN")
  return "$" + (Number.isInteger(n) ? String(n) : n.toFixed(2))
}
/** Monthly equivalent of a plan price, for the annual toggle. */
export function perMonth(plan: Plan, cur: Currency, cycle: Cycle) {
  const p = plan.price[cur][cycle]
  if (cycle === "monthly") return p
  return cur === "INR" ? Math.round(p / 12) : Math.round((p / 12) * 100) / 100
}
export function defaultCurrency(): Currency {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz === "Asia/Kolkata" || tz === "Asia/Calcutta") return "INR"
    if (typeof navigator !== "undefined" && /-IN\b/i.test(navigator.language)) return "INR"
  } catch {
    /* fall through */
  }
  return "USD"
}

const isLive = (b: Bucket, now: number) => b.left > 0 && (b.expires == null || b.expires > now)
export const balance = (s: WalletState, now: number) => s.buckets.reduce((n, b) => n + (isLive(b, now) ? b.left : 0), 0)

function log(s: WalletState, e: Omit<Entry, "id">) {
  const entry = { id: uid(), ...e }
  s.ledger = [entry, ...s.ledger].slice(0, LEDGER_MAX)
  return entry
}
function addBucket(s: WalletState, kind: BucketKind, amount: number, label: string, expires: number | null, now: number) {
  const b: Bucket = { id: uid(), kind, label, amount, left: amount, at: now, expires }
  s.buckets.push(b)
  return b
}

/* ---------------- state ---------------- */
export function fresh(now: number): WalletState {
  const s: WalletState = {
    v: 2,
    created: now,
    buckets: [],
    ledger: [],
    unlocked: [],
    decks: [],
    plan: { id: "free", cycle: "monthly", started: now, renews: now + CYCLE_DAYS * DAY, term: now + CYCLE_DAYS * DAY, cancelAt: null, next: null },
    pass: null,
    usage: emptyUsage(),
    share: { day: "", month: "", n: 0, seen: [] },
    holds: [],
    paid: 0,
  }
  addBucket(s, "welcome", WELCOME.credits, "Welcome credits", now + WELCOME.days * DAY, now)
  log(s, { at: now, delta: WELCOME.credits, label: `Welcome credits (use within ${WELCOME.days} days)`, kind: "grant" })
  addBucket(s, "monthly", PLANS.free.credits, "Free plan: monthly credits", s.plan.renews, now)
  log(s, { at: now, delta: PLANS.free.credits, label: "Free plan: this month's credits", kind: "grant" })
  return s
}

/** Accepts anything read from storage (old v1 wallets, partial or corrupted data) and returns a valid state. */
export function migrate(raw: unknown, now: number): WalletState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const ids = (x: unknown) => (Array.isArray(x) ? x.filter((v) => typeof v === "number" && Number.isFinite(v)) : []) as number[]
  if (r.v === 2 && Array.isArray(r.buckets)) {
    const base = fresh(now)
    const plan = (r.plan || {}) as Partial<PlanState>
    const planId: PlanId = plan.id && plan.id in PLANS ? plan.id : "free"
    const s: WalletState = {
      ...base,
      created: num(r.created, now),
      buckets: (r.buckets as Bucket[])
        .filter((b) => b && typeof b === "object")
        .map((b) => ({
          id: String(b.id || uid()),
          kind: (b.kind || "legacy") as BucketKind,
          label: String(b.label || "Credits"),
          amount: Math.max(0, Math.round(num(b.amount))),
          left: Math.max(0, Math.round(num(b.left))),
          at: num(b.at, now),
          expires: b.expires == null ? null : num(b.expires, now),
        })),
      ledger: (Array.isArray(r.ledger) ? (r.ledger as Entry[]) : [])
        .filter((e) => e && typeof e === "object")
        .map((e) => ({ ...e, id: String(e.id || uid()), at: num(e.at, now), delta: Math.round(num(e.delta)), label: String(e.label || ""), kind: e.kind || "grant" }))
        .slice(0, LEDGER_MAX),
      unlocked: ids(r.unlocked),
      decks: Array.isArray(r.decks) ? (r.decks as unknown[]).filter((d) => typeof d === "string") as string[] : [],
      plan: (() => {
        const cycle: Cycle = plan.cycle === "annual" ? "annual" : "monthly"
        const started = num(plan.started, now)
        const renews = num(plan.renews, now + CYCLE_DAYS * DAY)
        const nx = plan.next && typeof plan.next === "object" && plan.next.id in PLANS ? { id: plan.next.id, cycle: plan.next.cycle === "annual" ? ("annual" as const) : ("monthly" as const) } : null
        return { id: planId, cycle, started, renews, term: num(plan.term, cycle === "annual" ? termFrom(started, cycle) : renews), cancelAt: plan.cancelAt == null ? null : num(plan.cancelAt, now), next: nx }
      })(),
      pass: r.pass && typeof r.pass === "object" ? { until: num((r.pass as { until?: number }).until, 0) } : null,
      usage: { ...emptyUsage(), ...Object.fromEntries(Object.entries((r.usage || {}) as Record<string, unknown>).map(([k, v]) => [k, Math.max(0, num(v))])) } as Usage,
      share: {
        day: String((r.share as { day?: string })?.day || ""),
        month: String((r.share as { month?: string })?.month || ""),
        n: num((r.share as { n?: number })?.n),
        seen: Array.isArray((r.share as { seen?: unknown })?.seen) ? ((r.share as { seen: unknown[] }).seen.filter((x) => typeof x === "string") as string[]).slice(-40) : [],
      },
      holds: (Array.isArray(r.holds) ? (r.holds as Hold[]) : []).filter((h) => h && typeof h.id === "string").map((h) => ({ id: h.id, usage: h.usage, at: num(h.at, now), page: String(h.page || "") })),
      paid: num(r.paid),
    }
    return tick(s, now)
  }
  // v1 (a single balance) or nothing usable: start fresh, carrying old credits over as never-expiring
  const s = fresh(now)
  const old = Math.max(0, Math.round(num(r.balance, -1)))
  if (Number.isFinite(old) && old > 0 && "balance" in r) {
    // the old wallet already included its own welcome credits, so replace the new welcome grant
    s.buckets = s.buckets.filter((b) => b.kind !== "welcome")
    s.ledger = s.ledger.filter((e) => !/^Welcome/.test(e.label))
    addBucket(s, "legacy", old, "Credits carried over", null, now)
    log(s, { at: now, delta: old, label: "Credits carried over from your earlier wallet", kind: "grant" })
  }
  s.unlocked = ids(r.unlocked)
  return s
}

/** Expire old credits, refund stuck holds, end passes, renew plans. Call before reading or changing the wallet. */
export function tick(state: WalletState, now: number, page?: string): WalletState {
  let s = clone(state)
  // 1. expiry
  for (const b of s.buckets) {
    if (b.left > 0 && b.expires != null && b.expires <= now) {
      log(s, { at: b.expires, delta: -b.left, label: `Expired: ${b.label.toLowerCase()}`, kind: "expire" })
      b.left = 0
    }
  }
  s.buckets = s.buckets.filter((b) => b.left > 0 || now - b.at < 90 * DAY)
  // 2. holds whose AI call never finished (the page closed or reloaded)
  for (const h of [...s.holds]) {
    const age = now - h.at
    if (age > HOLD_MAX_MS || (page && h.page !== page && age > HOLD_FOREIGN_MS)) s = refundInPlace(s, h.id, now, h.usage, "the answer never arrived")
  }
  // 3. pass
  if (s.pass && s.pass.until <= now) s.pass = null
  // 4. plan renewal (only the latest cycle's credits are granted, however long the gap)
  if (s.plan.renews <= now) {
    let p: PlanState = { ...s.plan }
    let note = ""
    while (p.renews <= now) {
      const started = p.renews
      const renews = started + CYCLE_DAYS * DAY
      const termEnded = started >= p.term
      if (p.cancelAt != null && p.cancelAt <= started) {
        p = { id: "free", cycle: "monthly", started, renews, term: renews, cancelAt: null, next: null }
        note = "lapsed"
      } else if (termEnded && p.next) {
        p = { id: p.next.id, cycle: p.next.cycle, started, renews, term: termFrom(started, p.next.cycle), cancelAt: null, next: null }
        note = "switched"
      } else if (termEnded) {
        p = { ...p, started, renews, term: p.cycle === "annual" ? termFrom(started, "annual") : renews }
        note = p.id === "free" ? "free" : p.cycle === "annual" ? "renewed-year" : "renewed"
      } else {
        p = { ...p, started, renews }
        note = "refill"
      }
    }
    s.plan = p
    const plan = PLANS[p.id]
    addBucket(s, "monthly", plan.credits, `${plan.name} plan: monthly credits`, p.renews, p.started)
    const label =
      note === "lapsed" ? `Back on Free: ${plan.credits} credits this month`
        : note === "switched" ? `Now on ${plan.name}: ${plan.credits} credits this month`
        : note === "free" ? `Free plan: ${plan.credits} new credits this month`
        : note === "renewed-year" ? `${plan.name} renewed for another year (prototype, no charge): ${plan.credits} credits`
        : note === "refill" ? `${plan.name}: this month's ${plan.credits} credits`
        : `${plan.name} renewed (prototype, no charge): ${plan.credits} credits`
    log(s, { at: p.started, delta: plan.credits, label, kind: "plan" })
  }
  return s
}

export type Spent = { ok: true; state: WalletState; entry: string } | { ok: false; state: WalletState; short: number }

/** Spend credits, soonest-expiring first. */
export function spend(state: WalletState, cost: number, label: string, now: number, usage?: UsageKey, hold?: string): Spent {
  const s = tick(state, now, hold)
  cost = Math.max(0, Math.round(cost))
  const have = balance(s, now)
  if (have < cost) return { ok: false, state: s, short: cost - have }
  const order = s.buckets
    .filter((b) => isLive(b, now))
    .sort((a, b) => (a.expires ?? Infinity) - (b.expires ?? Infinity) || a.at - b.at)
  const alloc: [string, number][] = []
  let need = cost
  for (const b of order) {
    if (!need) break
    const take = Math.min(b.left, need)
    b.left -= take
    need -= take
    alloc.push([b.id, take])
  }
  const e = log(s, { at: now, delta: -cost, label, kind: "spend", alloc })
  s.usage.spent += cost
  if (usage) s.usage[usage] += 1
  if (hold) s.holds = [...s.holds, { id: e.id, usage, at: now, page: hold }]
  return { ok: true, state: s, entry: e.id }
}

/** The AI call behind a held charge finished: keep the charge. */
export function settle(state: WalletState, entryId: string): WalletState {
  if (!state.holds.some((h) => h.id === entryId)) return state
  return { ...state, holds: state.holds.filter((h) => h.id !== entryId) }
}

/** Give back a spend (an AI call that failed). Credits return to the buckets they came from. */
export function refund(state: WalletState, entryId: string, now: number, usage?: UsageKey): WalletState {
  return refundInPlace(tick(state, now), entryId, now, usage)
}
function refundInPlace(state: WalletState, entryId: string, now: number, usage?: UsageKey, why?: string): WalletState {
  const s = clone(state)
  s.holds = s.holds.filter((h) => h.id !== entryId)
  const e = s.ledger.find((x) => x.id === entryId)
  if (!e || e.kind !== "spend" || e.refunded) return s
  let lost = 0
  for (const [id, n] of e.alloc || []) {
    const b = s.buckets.find((x) => x.id === id)
    if (b && (b.expires == null || b.expires > now)) b.left += n
    else lost += n
  }
  if (lost) addBucket(s, "refund", lost, "Refunded credits", now + 7 * DAY, now)
  e.refunded = true
  log(s, { at: now, delta: -e.delta, label: `Refund: ${e.label}${why ? ` (${why})` : ""}`, kind: "refund" })
  s.usage.spent = Math.max(0, s.usage.spent + e.delta)
  if (usage) s.usage[usage] = Math.max(0, s.usage[usage] - 1)
  return s
}

/** Credits earned in the app. They last EARNED_DAYS. */
export function earn(state: WalletState, amount: number, label: string, now: number): WalletState {
  const s = tick(state, now)
  if (amount <= 0) return s
  addBucket(s, "earned", amount, label, now + EARNED_DAYS * DAY, now)
  log(s, { at: now, delta: amount, label, kind: "grant" })
  return s
}

export function buyTopUp(state: WalletState, t: TopUp, cur: Currency, now: number): WalletState {
  const s = tick(state, now)
  addBucket(s, "topup", t.credits, `Top-up ${t.credits}`, null, now)
  log(s, { at: now, delta: t.credits, label: `Top-up: ${t.credits} credits, ${fmtPrice(t.price[cur], cur)} (prototype, no charge)`, kind: "purchase" })
  s.paid += 1
  return s
}

export function buyPass(state: WalletState, cur: Currency, now: number): WalletState {
  const s = tick(state, now)
  const until = Math.max(s.pass?.until ?? now, now) + PASS.days * DAY
  s.pass = { until }
  addBucket(s, "pass", PASS.credits, "Voyage pass credits", until, now)
  log(s, { at: now, delta: PASS.credits, label: `Voyage pass: ${PASS.credits} credits for ${PASS.days} days, ${fmtPrice(PASS.price[cur], cur)} (prototype, no charge)`, kind: "purchase" })
  s.paid += 1
  return s
}

/** When a change would take effect, for the UI. */
export function changeKind(s: WalletState, id: PlanId, cycle: Cycle): "same" | "keep" | "cycle" | "upgrade" | "downgrade" {
  if (s.plan.id === id && s.plan.cycle === cycle) return s.plan.cancelAt || s.plan.next ? "keep" : "same"
  if (s.plan.id === id) return "cycle"
  return PLAN_RANK[id] > PLAN_RANK[s.plan.id] ? "upgrade" : "downgrade"
}

/**
 * Start or change plan.
 * - Upgrade (or Free → paid): starts now; credits you already have stay until they expire.
 * - Downgrade: takes effect when the current term ends.
 * - Monthly ↔ yearly on the same plan: billing changes, credits untouched.
 * - Same plan while cancelled: keeps it.
 */
export function subscribe(state: WalletState, id: PlanId, cycle: Cycle, cur: Currency, now: number): WalletState {
  const s = tick(state, now)
  if (id === "free") return cancelPlan(s, now)
  const plan = PLANS[id]
  const kind = changeKind(s, id, cycle)
  if (kind === "same") return s
  if (kind === "keep") {
    s.plan = { ...s.plan, cancelAt: null, next: null }
    log(s, { at: now, delta: 0, label: `Kept your ${plan.name} plan`, kind: "plan" })
    return s
  }
  if (kind === "cycle") {
    s.plan = { ...s.plan, cycle, term: cycle === "annual" ? termFrom(s.plan.started, "annual") : s.plan.renews, cancelAt: null, next: null }
    log(s, { at: now, delta: 0, label: `${plan.name}: now billed ${cycle === "annual" ? `yearly, ${fmtPrice(plan.price[cur].annual, cur)}` : `monthly, ${fmtPrice(plan.price[cur].monthly, cur)}`} (prototype, no charge)`, kind: "plan" })
    if (cycle === "annual") s.paid += 1
    return s
  }
  if (kind === "downgrade") {
    const at = s.plan.cycle === "annual" ? s.plan.term : s.plan.renews
    s.plan = { ...s.plan, cancelAt: null, next: { id, cycle } }
    log(s, { at: now, delta: 0, label: `Switching to ${plan.name} on ${dayOf(at)}. Until then you keep ${PLANS[s.plan.id].name}`, kind: "plan" })
    return s
  }
  // upgrade: the old plan's credits stay until their refill date; the new allowance arrives now
  const renews = now + CYCLE_DAYS * DAY
  s.plan = { id, cycle, started: now, renews, term: termFrom(now, cycle), cancelAt: null, next: null }
  addBucket(s, "monthly", plan.credits, `${plan.name} plan: monthly credits`, renews, now)
  const price = plan.price[cur][cycle]
  log(s, { at: now, delta: plan.credits, label: `${plan.name} plan, ${fmtPrice(price, cur)}/${cycle === "annual" ? "year" : "month"} (prototype, no charge): ${plan.credits} credits`, kind: "plan" })
  s.paid += 1
  return s
}

/** Stop renewing. Perks and credits last until the end of the paid term (the month, or the year). */
export function cancelPlan(state: WalletState, now: number): WalletState {
  const s = tick(state, now)
  if (s.plan.id === "free") return s
  const end = s.plan.cycle === "annual" ? s.plan.term : s.plan.renews
  s.plan = { ...s.plan, cancelAt: end, next: null }
  log(s, { at: now, delta: 0, label: `${PLANS[s.plan.id].name} cancelled. It runs until ${dayOf(end)}`, kind: "plan" })
  return s
}

/* ---------------- what the wallet allows ---------------- */
export function perks(s: WalletState, now: number) {
  const pass = !!s.pass && s.pass.until > now
  const paid = s.plan.id !== "free" || pass
  return {
    paid,
    pass,
    allStories: paid,
    allDecks: paid,
    voice: true,
    voiceIncluded: paid,
    expert: s.plan.id === "command",
    freezesPerMonth: s.plan.id === "command" ? 2 : paid ? 1 : 0,
  }
}

/** Credits that expire within `days` (welcome, earned, pass), excluding the plan's own monthly refresh. */
export function expiringSoon(s: WalletState, now: number, days = 5) {
  const limit = now + days * DAY
  const soon = s.buckets.filter((b) => isLive(b, now) && b.kind !== "monthly" && b.expires != null && b.expires <= limit)
  if (!soon.length) return null
  return { n: soon.reduce((x, b) => x + b.left, 0), at: Math.min(...soon.map((b) => b.expires as number)) }
}

/** Breakdown of the balance for the wallet screen. */
export function breakdown(s: WalletState, now: number) {
  const live = s.buckets.filter((b) => isLive(b, now))
  const sum = (k: BucketKind[]) => live.filter((b) => k.includes(b.kind)).reduce((n, b) => n + b.left, 0)
  const nextExp = (k: BucketKind[]) => {
    const e = live.filter((b) => k.includes(b.kind) && b.expires != null).map((b) => b.expires as number)
    return e.length ? Math.min(...e) : null
  }
  return [
    { key: "monthly", label: `${PLANS[s.plan.id].name} plan`, n: sum(["monthly"]), note: `Refills ${dayOf(s.plan.renews)}`, expires: nextExp(["monthly"]) },
    { key: "welcome", label: "Welcome", n: sum(["welcome"]), note: "", expires: nextExp(["welcome"]) },
    { key: "pass", label: "Voyage pass", n: sum(["pass"]), note: "", expires: nextExp(["pass"]) },
    { key: "earned", label: "Earned in the app", n: sum(["earned", "refund"]), note: `Last ${EARNED_DAYS} days`, expires: nextExp(["earned", "refund"]) },
    { key: "topup", label: "Top-ups", n: sum(["topup", "legacy"]), note: "Never expire", expires: null },
  ].filter((r) => r.n > 0)
}

const textKey = (t: string) => {
  const norm = t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  let h = 0
  for (let i = 0; i < norm.length; i++) h = (Math.imul(h, 31) + norm.charCodeAt(i)) | 0
  return `${norm.length}:${h}`
}
/** Sharing a debrief earns credits once a day, up to EARN.sharePerMonth a month, never twice for the same text. */
export function shareStatus(s: WalletState, now: number, text?: string) {
  const day = dayOf(now), month = monthOf(now)
  const n = s.share.month === month ? s.share.n : 0
  if (text && s.share.seen.includes(textKey(text))) return { ok: false as const, why: "You've already shared this debrief. Thank you!" }
  if (s.share.day === day) return { ok: false as const, why: "You've already earned credits for a debrief today. Share more any time; the credits come back tomorrow." }
  if (n >= EARN.sharePerMonth) return { ok: false as const, why: `You've earned credits for ${EARN.sharePerMonth} debriefs this month, the monthly limit. Thank you!` }
  return { ok: true as const, left: EARN.sharePerMonth - n }
}
export function recordShare(state: WalletState, now: number, text = ""): WalletState {
  const st = shareStatus(state, now, text)
  if (!st.ok) return tick(state, now)
  const month = monthOf(now)
  const s = earn(state, EARN.share, "Shared a debrief", now)
  s.share = { day: dayOf(now), month, n: (s.share.month === month ? s.share.n : 0) + 1, seen: [...s.share.seen, textKey(text)].slice(-40) }
  return s
}
