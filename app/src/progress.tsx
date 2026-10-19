// Habit layer: XP and levels, the streak with freezes, three daily missions, badges, spaced
// repetition for flashcards, the ready kit, interview history and per-topic readiness.
// XP is your rank: it only goes up. Credits are what you spend; the app pays some back for learning.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import confetti from "canvas-confetti"

import * as I from "@/components/icons"
import { EARN, useWallet } from "@/credits"
import { CARDS, cardsFor, deckById, KIT, type CardI, type DeckId } from "@/fleet"
import { RANK_TOPICS, type Topic } from "@/data"

/* ---------- dates ---------- */
const pad = (n: number) => String(n).padStart(2, "0")
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const dayNum = (key: string) => {
  const [y, m, d] = key.split("-").map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86400000)
}
const todayKey = () => dayKey()
const today = () => dayNum(todayKey())
const monthKey = () => todayKey().slice(0, 7)

/* ---------- levels (XP never goes down) ---------- */
export const LEVELS = [
  { n: 1, name: "Cadet", xp: 0 },
  { n: 2, name: "Junior officer", xp: 300 },
  { n: 3, name: "Officer of the watch", xp: 900 },
  { n: 4, name: "Senior officer", xp: 2000 },
  { n: 5, name: "Head of department", xp: 3600 },
  { n: 6, name: "Second in command", xp: 6000 },
  { n: 7, name: "Master mariner", xp: 9000 },
  { n: 8, name: "Vetting ace", xp: 13000 },
  { n: 9, name: "Fleet superintendent", xp: 18000 },
  { n: 10, name: "Vetting legend", xp: 25000 },
]
export function levelOf(xp: number) {
  let i = 0
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++
  const cur = LEVELS[i], next = LEVELS[i + 1]
  const pct = next ? (xp - cur.xp) / (next.xp - cur.xp) : 1
  return { ...cur, next, pct, toNext: next ? next.xp - xp : 0 }
}

/* ---------- how XP is earned ---------- */
export const XP = {
  cardKnew: 10, // a due or new flashcard you knew
  cardAgain: 4, // a due or new flashcard you didn't know yet
  cardExtra: 2, // extra practice on a card that isn't due
  spotRight: 15, // plus COMBO per answer in a row (up to 5)
  combo: 2,
  spotWrong: 5,
  story: 20, // first time you read a story
  kit: 3, // first time you tick a ready-kit item
  ask: 3, // an answered AI question
  explain: 3, // an observation explained
  photo: 5, // a photo check (counts toward the same daily AI cap)
  interviewPerPoint: 3, // AI inspector: score × 3 (min 2)
  mission: 20, // each daily mission
  chest: 50, // all three missions done
} as const
/** XP from Ask, Explain and Photo check is capped per day so paying for AI doesn't buy rank. */
export const AI_XP_CAP = 30
/** Streaks multiply the XP from learning (not the mission and chest bonuses). */
export const streakMultiplier = (n: number) => (n >= 30 ? 1.5 : n >= 7 ? 1.2 : 1)

/* ---------- missions & badges ---------- */
export const MISSIONS = [
  { id: "cards", label: "Review 10 flashcards", target: 10, icon: "Layers" },
  { id: "spot", label: "Answer 5 in Spot the observation", target: 5, icon: "Target" },
  { id: "read", label: "Read an inspection story", target: 1, icon: "Newspaper" },
] as const
export type MissionId = (typeof MISSIONS)[number]["id"]
export const CHEST = { xp: XP.chest, credits: EARN.chest }

export const BADGES = [
  { id: "first", name: "First watch", sub: "Finish your first session", icon: "Anchor" },
  { id: "streak3", name: "Three in a row", sub: "A 3-day streak", icon: "Flame" },
  { id: "streak7", name: "Full week", sub: "A 7-day streak", icon: "Calendar" },
  { id: "streak30", name: "Month at sea", sub: "A 30-day streak", icon: "Compass" },
  { id: "eye10", name: "Sharp eye", sub: "10 correct in Spot the observation", icon: "Eye" },
  { id: "combo5", name: "On a roll", sub: "5 correct answers in a row", icon: "Zap" },
  { id: "cards100", name: "Card shark", sub: "Review 100 flashcards", icon: "Layers" },
  { id: "stories5", name: "Storyteller", sub: "Read 5 inspection stories", icon: "Newspaper" },
  { id: "kit", name: "Ready kit", sub: "Complete one ready-kit list", icon: "Briefcase" },
  { id: "chest", name: "Mission complete", sub: "Open a daily chest", icon: "Gift" },
  { id: "mock", name: "Faced the inspector", sub: "Finish an AI inspector interview", icon: "Mic" },
  { id: "sharp", name: "Model answer", sub: "Score 8 or more with the AI inspector", icon: "Star" },
  { id: "photo", name: "Second pair of eyes", sub: "Run your first photo check", icon: "Camera" },
  { id: "lvl3", name: "Officer of the watch", sub: "Reach level 3", icon: "Award" },
  { id: "lvl5", name: "Head of department", sub: "Reach level 5", icon: "Crown" },
] as const
export type BadgeId = (typeof BADGES)[number]["id"]

/* ---------- state ---------- */
type Pair = [number, number] // [good, total]
export interface TopicStat { c: Pair; s: Pair; i: Pair } // cards known, spot right, interview score sum / answers
export interface InterviewRec { at: number; rank: string; avg: number; n: number; voice?: boolean; items: [string, number][] }
interface PState {
  xp: number
  days: Record<string, number>
  streak: { n: number; last: string; best: number; freezes: number }
  missions: { day: string; cards: number; spot: number; read: number; claimed: boolean }
  stats: { cards: number; knew: number; spot: number; spotRight: number; stories: number; bestCombo: number; interviews: number; asks: number }
  srs: Record<number, [number, number]> // card index -> [box 1-5, due day]
  badges: Partial<Record<BadgeId, string>>
  decks: DeckId[] // decks unlocked before credits moved to the wallet
  kit: Record<string, boolean>
  read: number[]
  topic: Record<string, TopicStat>
  interviews: InterviewRec[]
  ood: { day: string; pick: string }
  aiToday: { day: string; n: number } // XP already given today for AI answers
  levelPaid: number
  milestones: number[]
  freezeMonth: string
}
const KEY = "sr.progress"
const fresh = (): PState => ({
  xp: 0,
  days: {},
  streak: { n: 0, last: "", best: 0, freezes: 0 },
  missions: { day: todayKey(), cards: 0, spot: 0, read: 0, claimed: false },
  stats: { cards: 0, knew: 0, spot: 0, spotRight: 0, stories: 0, bestCombo: 0, interviews: 0, asks: 0 },
  srs: {},
  badges: {},
  decks: [],
  kit: {},
  read: [],
  topic: {},
  interviews: [],
  ood: { day: "", pick: "" },
  aiToday: { day: "", n: 0 },
  levelPaid: 1,
  milestones: [],
  freezeMonth: "",
})
const n0 = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0)
const pair = (x: unknown): Pair => (Array.isArray(x) && x.length === 2 ? [Math.max(0, n0(x[0])), Math.max(0, n0(x[1]))] : [0, 0])
/** Keeps only well-formed topic stats, so a damaged entry can't break the Progress screen. */
function cleanTopics(x: unknown): Record<string, TopicStat> {
  if (!x || typeof x !== "object" || Array.isArray(x)) return {}
  const out: Record<string, TopicStat> = {}
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue
    const t = v as Partial<TopicStat>
    out[k] = { c: pair(t.c), s: pair(t.s), i: pair(t.i) }
  }
  return out
}
function cleanInterviews(x: unknown): InterviewRec[] {
  if (!Array.isArray(x)) return []
  return x
    .filter((r) => r && typeof r === "object")
    .map((r) => ({
      at: n0(r.at),
      rank: typeof r.rank === "string" ? r.rank : "2/O",
      avg: n0(r.avg),
      n: n0(r.n),
      voice: !!r.voice,
      items: Array.isArray(r.items) ? r.items.filter((it: unknown) => Array.isArray(it) && typeof it[0] === "string").map((it: [string, unknown]) => [it[0], n0(it[1])] as [string, number]) : [],
    }))
    .slice(0, 30)
}
function cleanSrs(x: unknown): PState["srs"] {
  if (!x || typeof x !== "object" || Array.isArray(x)) return {}
  const out: PState["srs"] = {}
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) if (Array.isArray(v) && v.length === 2) out[Number(k)] = [n0(v[0]), n0(v[1])]
  return out
}
function load(): PState {
  const base = fresh()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return base
    return parseState(JSON.parse(raw))
  } catch {
    return base
  }
}
function parseState(input: unknown): PState {
  const base = fresh()
  try {
    const p = (input && typeof input === "object" ? input : {}) as Partial<PState>
    const obj = <T,>(x: unknown, d: T): T => (x && typeof x === "object" && !Array.isArray(x) ? (x as T) : d)
    const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : [])
    const xp = Math.max(0, n0(p.xp))
    return {
      ...base,
      xp,
      days: Object.fromEntries(Object.entries(obj<Record<string, unknown>>(p.days, {})).map(([k, v]) => [k, n0(v)])),
      streak: { n: n0(p.streak?.n), last: typeof p.streak?.last === "string" ? p.streak.last : "", best: n0(p.streak?.best), freezes: Math.min(3, n0(p.streak?.freezes)) },
      missions: (() => {
        const m = obj<Partial<PState["missions"]>>(p.missions, {})
        return { day: typeof m.day === "string" ? m.day : base.missions.day, cards: n0(m.cards), spot: n0(m.spot), read: n0(m.read), claimed: !!m.claimed }
      })(),
      stats: Object.fromEntries(Object.keys(base.stats).map((k) => [k, n0((p.stats as Record<string, unknown> | undefined)?.[k])])) as PState["stats"],
      srs: cleanSrs(p.srs),
      badges: Object.fromEntries(Object.entries(obj<Record<string, unknown>>(p.badges, {})).filter(([, v]) => typeof v === "string")) as PState["badges"],
      decks: arr<unknown>(p.decks).filter((d) => typeof d === "string") as DeckId[],
      kit: Object.fromEntries(Object.entries(obj<Record<string, unknown>>(p.kit, {})).map(([k, v]) => [k, !!v])),
      read: arr<number>(p.read).filter((x) => typeof x === "number"),
      topic: cleanTopics(p.topic),
      interviews: cleanInterviews(p.interviews),
      ood: { day: typeof p.ood?.day === "string" ? p.ood.day : "", pick: typeof p.ood?.pick === "string" ? p.ood.pick : "" },
      aiToday: { day: typeof p.aiToday?.day === "string" ? p.aiToday.day : "", n: n0(p.aiToday?.n) },
      // existing users aren't paid retroactively for levels they already had
      levelPaid: typeof p.levelPaid === "number" ? p.levelPaid : levelOf(xp).n,
      milestones: arr<number>(p.milestones),
      freezeMonth: typeof p.freezeMonth === "string" ? p.freezeMonth : "",
    }
  } catch {
    return base
  }
}

/** The streak as it stands today, without waiting for the next activity to reset it. */
export function liveStreak(st: PState["streak"]) {
  const tk = todayKey()
  if (!st.last) return { n: 0, state: "none" as const }
  const gap = dayNum(tk) - dayNum(st.last)
  if (gap <= 0) return { n: st.n, state: "done" as const }
  if (gap === 1) return { n: st.n, state: "due" as const }
  if (gap === 2 && st.freezes > 0) return { n: st.n, state: "freeze" as const }
  return { n: 0, state: "lost" as const, was: st.n }
}

/* ---------- readiness by topic ---------- */
export type Readiness = { topic: Topic; score: number | null; parts: { cards?: number; spot?: number; interview?: number }; cards: number; known: number }
export function readinessFor(s: PState, rank: string): Readiness[] {
  const topics = RANK_TOPICS[rank] || RANK_TOPICS["2/O"]
  const cards = cardsFor("trending", rank)
  return topics.map((t) => {
    const mine = cards.filter((c) => c.p === t)
    const known = mine.filter((c) => (s.srs[c.i]?.[0] ?? 0) >= 2).length
    const seen = mine.filter((c) => s.srs[c.i]).length
    const st = s.topic[t]
    const parts: Readiness["parts"] = {}
    if (seen >= 2 && mine.length) parts.cards = known / mine.length
    if (st && st.s[1] >= 3) parts.spot = st.s[0] / st.s[1]
    if (st && st.i[1] >= 1) parts.interview = st.i[0] / (st.i[1] * 10)
    const w = { cards: 0.4, spot: 0.2, interview: 0.4 }
    let sum = 0, ws = 0
    for (const k of Object.keys(parts) as (keyof typeof parts)[]) {
      sum += (parts[k] as number) * w[k]
      ws += w[k]
    }
    return { topic: t, score: ws ? Math.round((sum / ws) * 100) : null, parts, cards: mine.length, known }
  })
}

type Celebration = { id: number; kind: "level" | "badge" | "mission" | "chest" | "xp" | "credits"; title: string; sub?: string; icon?: string }

interface Progress extends PState {
  level: ReturnType<typeof levelOf>
  m: PState["missions"]
  missionsDone: number
  live: ReturnType<typeof liveStreak>
  multiplier: number
  freezeCap: number
  reviewCard: (i: number, ok: boolean) => number
  answerSpot: (ok: boolean, combo: number, topic?: string) => number
  answerOod: (pick: string, ok: boolean, topic?: string) => void
  readStory: (id: number) => void
  tickKit: (id: string, on: boolean) => void
  /** Untick every item for the next inspection (ticks already paid XP, so they don't pay again). */
  resetKit: () => void
  unlockDeck: (id: DeckId) => boolean
  hasDeck: (id: DeckId) => boolean
  claimChest: (el?: Element | null) => void
  finishSession: () => void
  session: (deck: DeckId, rank: string, size?: number) => { cards: CardI[]; extra: boolean }
  dueCount: (deck: DeckId, rank: string) => number
  /** XP for an answered AI question or explanation, within the daily cap. Returns the XP given. */
  aiXp: (kind: "ask" | "explain" | "photo") => number
  /** XP for one graded AI inspector answer. */
  gradeXp: (score: number, topic: string) => number
  recordInterview: (r: Omit<InterviewRec, "at">) => void
  buyFreeze: () => boolean
  readiness: (rank: string) => Readiness[]
}
const Ctx = createContext<Progress | null>(null)

const INTERVAL = [0, 1, 2, 4, 8, 16]
const COLORS = ["#2a78d6", "#f26b1d", "#1baf7a", "#ffcf70", "#8fd0ff", "#b9a8ff"]
export function pop(el?: Element | null, big = false) {
  const r = el?.getBoundingClientRect()
  const origin = r ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight } : { x: 0.5, y: 0.35 }
  confetti({ particleCount: big ? 140 : 60, spread: big ? 100 : 70, startVelocity: big ? 40 : 28, origin, colors: COLORS, disableForReducedMotion: true })
}
const bump = (st: TopicStat | undefined, k: keyof TopicStat, good: number, total = 1): TopicStat => {
  const b: TopicStat = st ? { c: [...st.c] as Pair, s: [...st.s] as Pair, i: [...st.i] as Pair } : { c: [0, 0], s: [0, 0], i: [0, 0] }
  b[k] = [b[k][0] + good, b[k][1] + total]
  return b
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet()
  const walletRef = useRef(wallet)
  walletRef.current = wallet
  const [s, setS] = useState<PState>(load)
  const ref = useRef(s)
  const [cele, setCele] = useState<Celebration[]>([])
  const seq = useRef(1)
  const written = useRef("")
  useEffect(() => {
    try {
      const json = JSON.stringify(s)
      if (json !== written.current) {
        written.current = json
        localStorage.setItem(KEY, json)
      }
    } catch {
      /* ignore */
    }
  }, [s])
  // Another tab made progress: take its version so the two tabs don't overwrite each other
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue || e.newValue === written.current) return
      try {
        written.current = e.newValue
        const next = parseState(JSON.parse(e.newValue))
        ref.current = next
        setS(next)
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("storage", on)
    return () => window.removeEventListener("storage", on)
  }, [])

  const celebrate = useCallback((c: Omit<Celebration, "id">) => {
    const id = seq.current++
    setCele((x) => [...x.slice(-2), { ...c, id }])
    setTimeout(() => setCele((x) => x.filter((y) => y.id !== id)), 3000)
  }, [])

  const freezeCap = wallet.perks.paid ? 3 : 2

  // Signed in: the account pays once for badges, levels and streaks reached on this device before
  const claimed = useRef(false)
  useEffect(() => {
    if (wallet.mode !== "account") {
      claimed.current = false
      return
    }
    if (!wallet.ready || claimed.current) return
    claimed.current = true
    const p = ref.current
    walletRef.current.claimAll({
      badges: Object.keys(p.badges).filter((b) => !!p.badges[b as BadgeId]),
      level: Math.max(p.levelPaid, levelOf(p.xp).n),
      streakBest: Math.max(p.streak.best, p.streak.n),
    })
  }, [wallet.mode, wallet.ready])

  // Paid plans add free streak freezes once a month
  useEffect(() => {
    const per = wallet.perks.freezesPerMonth
    const mk = monthKey()
    if (per > 0 && ref.current.freezeMonth !== mk) {
      const p = ref.current
      const next = { ...p, freezeMonth: mk, streak: { ...p.streak, freezes: Math.min(freezeCap, p.streak.freezes + per) } }
      ref.current = next
      setS(next)
    }
  }, [wallet.perks.freezesPerMonth, freezeCap])

  /**
   * Apply a change and award XP. `base` XP is multiplied by the streak; mission and chest bonuses are not.
   * Runs synchronously against the latest state so quick taps can't double-count.
   */
  const act = useCallback(
    (base: number, f: (p: PState) => PState, flat = 0): number => {
      const tk = todayKey()
      const prev = ref.current
      let p: PState = { ...prev, missions: prev.missions.day === tk ? prev.missions : { day: tk, cards: 0, spot: 0, read: 0, claimed: false } }
      const doneBefore = MISSIONS.filter((mm) => p.missions[mm.id] >= mm.target).map((mm) => mm.id)
      p = f(p)
      const later: (() => void)[] = []
      let bonus = flat
      for (const mm of MISSIONS) {
        if (!doneBefore.includes(mm.id) && p.missions[mm.id] >= mm.target) {
          bonus += XP.mission
          later.push(() => celebrate({ kind: "mission", title: "Mission complete", sub: `${mm.label} · +${XP.mission} XP`, icon: mm.icon }))
        }
      }
      // the streak only moves when something was actually earned today
      const gained0 = base + bonus
      if (gained0 > 0 && p.streak.last !== tk) {
        const gap = p.streak.last ? dayNum(tk) - dayNum(p.streak.last) : 99
        let { n, freezes } = p.streak
        if (gap === 1) n += 1
        else if (gap === 2 && freezes > 0) {
          n += 1
          freezes -= 1
          later.push(() => celebrate({ kind: "xp", title: "A streak freeze saved your streak", sub: "You missed a day, so one freeze was used", icon: "Snow" }))
        } else n = 1
        if (n > 0 && n % 7 === 0) freezes = Math.min(freezeCap, freezes + 1)
        p = { ...p, streak: { n, last: tk, best: Math.max(p.streak.best, n), freezes } }
        for (const [days, credits] of Object.entries(EARN.streak)) {
          const d = Number(days)
          if (n >= d && !p.milestones.includes(d)) {
            p = { ...p, milestones: [...p.milestones, d] }
            later.push(() => {
              walletRef.current.earn("streak", d, `${d}-day streak`)
              celebrate({ kind: "credits", title: `${d}-day streak: +${credits} credits`, sub: "Keep the watch going", icon: "Flame" })
            })
          }
        }
      }
      const gained = Math.round(base * streakMultiplier(p.streak.n)) + bonus
      const before = levelOf(p.xp)
      p = { ...p, xp: p.xp + gained, days: gained ? { ...p.days, [tk]: (p.days[tk] || 0) + gained } : p.days }
      const after = levelOf(p.xp)
      if (after.n > before.n && after.n > p.levelPaid) {
        let credits = 0
        const paidFrom = p.levelPaid + 1
        for (let L = paidFrom; L <= after.n; L++) credits += EARN.level[L] || 0
        p = { ...p, levelPaid: after.n }
        later.push(() => {
          // one claim per level, so each pays once on the account however the levels are reached
          for (let L = paidFrom; L <= after.n; L++)
            if (EARN.level[L]) walletRef.current.earn("level", L, `Reached level ${L}: ${LEVELS.find((x) => x.n === L)?.name ?? ""}`)
          celebrate({ kind: "level", title: `Level ${after.n}: ${after.name}`, sub: credits ? `You levelled up. +${credits} credits` : "You levelled up", icon: "Crown" })
          pop(null, true)
        })
      }
      // badges
      const earn: BadgeId[] = []
      const has = (b: BadgeId) => !!p.badges[b]
      if (!has("streak3") && p.streak.n >= 3) earn.push("streak3")
      if (!has("streak7") && p.streak.n >= 7) earn.push("streak7")
      if (!has("streak30") && p.streak.n >= 30) earn.push("streak30")
      if (!has("eye10") && p.stats.spotRight >= 10) earn.push("eye10")
      if (!has("combo5") && p.stats.bestCombo >= 5) earn.push("combo5")
      if (!has("cards100") && p.stats.cards >= 100) earn.push("cards100")
      if (!has("stories5") && p.stats.stories >= 5) earn.push("stories5")
      if (!has("mock") && p.stats.interviews >= 1) earn.push("mock")
      if (!has("lvl3") && after.n >= 3) earn.push("lvl3")
      if (!has("lvl5") && after.n >= 5) earn.push("lvl5")
      if (!has("kit") && KIT.some((l) => l.items.every((it) => p.kit[it.id]))) earn.push("kit")
      if (earn.length) {
        p = { ...p, badges: { ...p.badges, ...Object.fromEntries(earn.map((b) => [b, tk])) } }
        for (const b of earn) {
          const def = BADGES.find((x) => x.id === b)!
          later.push(() => {
            walletRef.current.earn("badge", b, `Badge: ${def.name}`)
            celebrate({ kind: "badge", title: `Badge: ${def.name}`, sub: `${def.sub} · +${EARN.badge} credits`, icon: def.icon })
          })
        }
      }
      ref.current = p
      setS(p)
      if (later.length) setTimeout(() => later.forEach((fn) => fn()), 0)
      return gained
    },
    [celebrate, freezeCap]
  )

  /** Award a badge directly (for events that aren't counted in stats). */
  const badge = useCallback(
    (b: BadgeId) => {
      if (ref.current.badges[b]) return
      act(0, (p) => ({ ...p, badges: { ...p.badges, [b]: todayKey() } }))
      const def = BADGES.find((x) => x.id === b)!
      setTimeout(() => {
        walletRef.current.earn("badge", b, `Badge: ${def.name}`)
        celebrate({ kind: "badge", title: `Badge: ${def.name}`, sub: `${def.sub} · +${EARN.badge} credits`, icon: def.icon })
      }, 0)
    },
    [act, celebrate]
  )

  const value = useMemo<Progress>(() => {
    const tk = todayKey()
    const m = s.missions.day === tk ? s.missions : { day: tk, cards: 0, spot: 0, read: 0, claimed: false }
    const missionsDone = MISSIONS.filter((mm) => m[mm.id] >= mm.target).length
    const isDue = (i: number) => !!ref.current.srs[i] && ref.current.srs[i][1] <= today()
    const dueIn = (list: CardI[]) => list.filter((c) => s.srs[c.i] && s.srs[c.i][1] <= today()).length
    const live = liveStreak(s.streak)
    return {
      ...s,
      level: levelOf(s.xp),
      m,
      missionsDone,
      live,
      multiplier: streakMultiplier(live.n),
      freezeCap,
      reviewCard: (i, ok) => {
        const fresh = !ref.current.srs[i]
        const due = fresh || isDue(i)
        const card = CARDS[i]
        return act(due ? (ok ? XP.cardKnew : XP.cardAgain) : XP.cardExtra, (p) => {
          const [box, when] = p.srs[i] || [0, 0]
          // reviewing early never pushes a card further out; missing it always brings it back tomorrow
          const next: [number, number] = ok ? (due ? [Math.min(5, box + 1), today() + INTERVAL[Math.min(5, box + 1)]] : [box, when]) : [1, today() + 1]
          const t = card?.p
          return {
            ...p,
            srs: { ...p.srs, [i]: next },
            stats: { ...p.stats, cards: p.stats.cards + 1, knew: p.stats.knew + (ok ? 1 : 0) },
            missions: { ...p.missions, cards: p.missions.cards + 1 },
            topic: t ? { ...p.topic, [t]: bump(p.topic[t], "c", ok ? 1 : 0) } : p.topic,
          }
        })
      },
      answerSpot: (ok, combo, topic) =>
        act(ok ? XP.spotRight + Math.min(combo, 5) * XP.combo : XP.spotWrong, (p) => ({
          ...p,
          stats: { ...p.stats, spot: p.stats.spot + 1, spotRight: p.stats.spotRight + (ok ? 1 : 0), bestCombo: Math.max(p.stats.bestCombo, combo) },
          missions: { ...p.missions, spot: p.missions.spot + 1 },
          topic: topic ? { ...p.topic, [topic]: bump(p.topic[topic], "s", ok ? 1 : 0) } : p.topic,
        })),
      answerOod: (pick, ok, topic) => {
        if (ref.current.ood.day === todayKey()) return
        act(ok ? XP.spotRight + XP.combo : XP.spotWrong, (p) => ({
          ...p,
          ood: { day: todayKey(), pick },
          stats: { ...p.stats, spot: p.stats.spot + 1, spotRight: p.stats.spotRight + (ok ? 1 : 0) },
          missions: { ...p.missions, spot: p.missions.spot + 1 },
          topic: topic ? { ...p.topic, [topic]: bump(p.topic[topic], "s", ok ? 1 : 0) } : p.topic,
        }))
      },
      readStory: (id) => {
        const first = !ref.current.read.includes(id)
        const tk2 = todayKey()
        const counted = ref.current.missions.day === tk2 && ref.current.missions.read >= 1
        if (!first && counted) return
        act(first ? XP.story : 0, (p) => ({
          ...p,
          read: first ? [...p.read, id] : p.read,
          stats: first ? { ...p.stats, stories: p.stats.stories + 1 } : p.stats,
          missions: { ...p.missions, read: p.missions.read + 1 },
        }))
      },
      tickKit: (id, on) => {
        const first = on && ref.current.kit[id] === undefined
        if (first) act(XP.kit, (p) => ({ ...p, kit: { ...p.kit, [id]: on } }))
        else {
          const next = { ...ref.current, kit: { ...ref.current.kit, [id]: on } }
          ref.current = next
          setS(next)
        }
      },
      resetKit: () => {
        const next = { ...ref.current, kit: Object.fromEntries(Object.keys(ref.current.kit).map((k) => [k, false])) }
        ref.current = next
        setS(next)
      },
      hasDeck: (id) => {
        const d = deckById(id)
        return walletRef.current.hasDeck(id, d.cost) || ref.current.decks.includes(id)
      },
      unlockDeck: (id) => {
        const d = deckById(id)
        if (ref.current.decks.includes(id)) return true
        return walletRef.current.unlockDeck(id, d.cost, d.name)
      },
      claimChest: (el) => {
        const cur = ref.current
        const mm = cur.missions.day === todayKey() ? cur.missions : null
        if (!mm || mm.claimed || MISSIONS.some((x) => mm[x.id] < x.target)) return
        act(0, (p) => ({ ...p, missions: { ...p.missions, claimed: true } }), XP.chest)
        walletRef.current.earn("chest", todayKey(), "Daily missions chest")
        if (!cur.badges.chest) badge("chest")
        pop(el, true)
        celebrate({ kind: "chest", title: `Chest opened: +${XP.chest} XP, +${EARN.chest} credits`, sub: "Come back tomorrow for three new missions", icon: "Gift" })
      },
      finishSession: () => badge("first"),
      session: (deck, rank, size = 10) => {
        const list = cardsFor(deck, rank)
        const st = ref.current.srs
        const t = today()
        const due = list.filter((c) => st[c.i] && st[c.i][1] <= t).sort((a, b) => st[a.i][1] - st[b.i][1])
        const unseen = list.filter((c) => !st[c.i]).sort((a, b) => a.l - b.l)
        const out = [...due, ...unseen].slice(0, size)
        if (out.length) return { cards: out, extra: false }
        return { cards: [...list].sort((a, b) => (st[a.i]?.[0] ?? 0) - (st[b.i]?.[0] ?? 0) || (st[a.i]?.[1] ?? 0) - (st[b.i]?.[1] ?? 0)).slice(0, size), extra: true }
      },
      dueCount: (deck, rank) => dueIn(cardsFor(deck, rank)),
      aiXp: (kind) => {
        const tk2 = todayKey()
        const used = ref.current.aiToday.day === tk2 ? ref.current.aiToday.n : 0
        const give = Math.max(0, Math.min(kind === "ask" ? XP.ask : kind === "photo" ? XP.photo : XP.explain, AI_XP_CAP - used))
        if (kind === "photo") badge("photo")
        // flat XP: the daily cap is exact, the streak multiplier doesn't stretch it
        return act(0, (p) => ({ ...p, aiToday: { day: tk2, n: used + give }, stats: kind === "ask" ? { ...p.stats, asks: p.stats.asks + 1 } : p.stats }), give)
      },
      gradeXp: (score, topic) => {
        const got = act(Math.max(2, Math.round(score) * XP.interviewPerPoint), (p) => ({ ...p, topic: { ...p.topic, [topic]: bump(p.topic[topic], "i", Math.max(0, Math.min(10, score))) } }))
        if (score >= 8) badge("sharp")
        return got
      },
      recordInterview: (r) =>
        act(0, (p) => ({ ...p, interviews: [{ ...r, at: Date.now() }, ...p.interviews].slice(0, 30), stats: { ...p.stats, interviews: p.stats.interviews + 1 } })),
      buyFreeze: () => {
        if (ref.current.streak.freezes >= freezeCap) return false
        const rec = walletRef.current.charge({ kind: "freeze" })
        if (!rec) return false
        const next = { ...ref.current, streak: { ...ref.current.streak, freezes: ref.current.streak.freezes + 1 } }
        ref.current = next
        setS(next)
        return true
      },
      readiness: (rank) => readinessFor(ref.current, rank),
    }
  }, [s, act, badge, celebrate, freezeCap])

  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[max(68px,calc(env(safe-area-inset-top,0px)+56px))] z-[95] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {cele.map((c) => {
            const Icon = (I as unknown as Record<string, (p: { size?: number }) => ReactNode>)[c.icon || "Star"] || I.Star
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: -16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
                className="glass-deep flex w-full max-w-[380px] items-center gap-3 rounded-2xl px-3.5 py-3"
              >
                <span className={`gloss flex size-10 shrink-0 items-center justify-center rounded-xl ${c.kind === "level" ? "tile-amber" : c.kind === "badge" ? "tile-violet" : c.kind === "chest" ? "tile-rose" : c.kind === "credits" ? "tile-green" : "tile-teal"}`}>
                  <Icon size={20} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[14px] leading-tight font-bold text-white">{c.title}</span>
                  {c.sub && <span className="text-[12.5px] leading-snug text-white/70">{c.sub}</span>}
                </span>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

export function useProgress() {
  const p = useContext(Ctx)
  if (!p) throw new Error("useProgress outside ProgressProvider")
  return p
}

export { CARDS }
