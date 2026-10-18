// Daily habit layer: XP and levels, streak with freezes, three daily missions, badges,
// spaced repetition for flashcards, and the ready-kit ticks. Kept per browser in localStorage.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import confetti from "canvas-confetti"

import * as I from "@/components/icons"
import { useWallet } from "@/credits"
import { CARDS, cardsFor, deckById, KIT, type CardI, type DeckId } from "@/fleet"

/* ---------- dates ---------- */
const pad = (n: number) => String(n).padStart(2, "0")
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const dayNum = (key: string) => {
  const [y, m, d] = key.split("-").map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86400000)
}
const todayKey = () => dayKey()
const today = () => dayNum(todayKey())

/* ---------- levels ---------- */
export const LEVELS = [
  { n: 1, name: "Cadet", xp: 0 },
  { n: 2, name: "Junior officer", xp: 150 },
  { n: 3, name: "Officer of the watch", xp: 400 },
  { n: 4, name: "Senior officer", xp: 800 },
  { n: 5, name: "Head of department", xp: 1400 },
  { n: 6, name: "Master mariner", xp: 2200 },
  { n: 7, name: "Vetting ace", xp: 3200 },
]
export function levelOf(xp: number) {
  let i = 0
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++
  const cur = LEVELS[i], next = LEVELS[i + 1]
  const pct = next ? (xp - cur.xp) / (next.xp - cur.xp) : 1
  return { ...cur, next, pct, toNext: next ? next.xp - xp : 0 }
}

/* ---------- missions & badges ---------- */
export const MISSIONS = [
  { id: "cards", label: "Review 10 flashcards", target: 10, icon: "Layers" },
  { id: "spot", label: "Answer 5 in Spot the observation", target: 5, icon: "Target" },
  { id: "read", label: "Read 1 inspection story", target: 1, icon: "Newspaper" },
] as const
export type MissionId = (typeof MISSIONS)[number]["id"]
export const CHEST = { xp: 100, credits: 5 }
/** AI questions and explanations: a few free each day, then credits. */
export const AI_FREE_PER_DAY = 3
export const AI_COST = 2

export const BADGES = [
  { id: "first", name: "First watch", sub: "Finish your first session", icon: "Anchor" },
  { id: "streak3", name: "Three in a row", sub: "A 3-day streak", icon: "Flame" },
  { id: "streak7", name: "Full week", sub: "A 7-day streak", icon: "Calendar" },
  { id: "eye10", name: "Sharp eye", sub: "10 correct in Spot the observation", icon: "Eye" },
  { id: "combo5", name: "On a roll", sub: "5 correct answers in a row", icon: "Zap" },
  { id: "cards100", name: "Card shark", sub: "Review 100 flashcards", icon: "Layers" },
  { id: "stories5", name: "Storyteller", sub: "Read 5 inspection stories", icon: "Newspaper" },
  { id: "kit", name: "Ready kit", sub: "Complete one ready-kit list", icon: "Briefcase" },
  { id: "chest", name: "Mission complete", sub: "Open a daily chest", icon: "Gift" },
  { id: "lvl3", name: "Officer of the watch", sub: "Reach level 3", icon: "Award" },
] as const
export type BadgeId = (typeof BADGES)[number]["id"]

/* ---------- state ---------- */
interface PState {
  xp: number
  days: Record<string, number>
  streak: { n: number; last: string; best: number; freezes: number }
  missions: { day: string; cards: number; spot: number; read: number; claimed: boolean }
  stats: { cards: number; knew: number; spot: number; spotRight: number; stories: number; bestCombo: number }
  srs: Record<number, [number, number]> // card index -> [box 1-5, due day]
  badges: Partial<Record<BadgeId, string>>
  decks: DeckId[]
  kit: Record<string, boolean>
  read: number[]
  ai: { day: string; used: number }
}
const KEY = "sr.progress"
const fresh = (): PState => ({
  xp: 0,
  days: {},
  streak: { n: 0, last: "", best: 0, freezes: 0 },
  missions: { day: todayKey(), cards: 0, spot: 0, read: 0, claimed: false },
  stats: { cards: 0, knew: 0, spot: 0, spotRight: 0, stories: 0, bestCombo: 0 },
  srs: {},
  badges: {},
  decks: [],
  kit: {},
  read: [],
  ai: { day: "", used: 0 },
})
function load(): PState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...fresh(), ...(JSON.parse(raw) as PState) }
  } catch {
    /* storage blocked: in-memory only */
  }
  return fresh()
}

type Celebration = { id: number; kind: "level" | "badge" | "mission" | "chest" | "xp"; title: string; sub?: string; icon?: string }

interface Progress extends PState {
  level: ReturnType<typeof levelOf>
  m: PState["missions"] // today's missions (reset daily)
  missionsDone: number
  reviewCard: (i: number, ok: boolean) => void
  answerSpot: (ok: boolean, combo: number) => void
  readStory: (id: number) => void
  tickKit: (id: string, on: boolean) => void
  unlockDeck: (id: DeckId) => boolean
  hasDeck: (id: DeckId) => boolean
  claimChest: (el?: Element | null) => void
  finishSession: () => void
  session: (deck: DeckId, rank: string, size?: number) => CardI[]
  dueCount: (deck: DeckId, rank: string) => number
  reset: () => void
  /** Free AI uses left today. */
  aiLeft: number
  /** Pay for one AI use: from today's free allowance, else credits. False if the viewer can't pay. */
  payAi: (label: string) => boolean
  /** Award XP for an activity outside the built-in ones (e.g. an AI interview answer). */
  bonus: (xp: number) => void
}
const Ctx = createContext<Progress | null>(null)

const INTERVAL = [0, 1, 2, 4, 8, 16]
const COLORS = ["#2a78d6", "#f26b1d", "#1baf7a", "#ffcf70", "#8fd0ff", "#b9a8ff"]
export function pop(el?: Element | null, big = false) {
  const r = el?.getBoundingClientRect()
  const origin = r ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight } : { x: 0.5, y: 0.35 }
  confetti({ particleCount: big ? 140 : 60, spread: big ? 100 : 70, startVelocity: big ? 40 : 28, origin, colors: COLORS, disableForReducedMotion: true })
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet()
  const [s, setS] = useState<PState>(load)
  const [cele, setCele] = useState<Celebration[]>([])
  const seq = useRef(1)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      /* ignore */
    }
  }, [s])

  const celebrate = useCallback((c: Omit<Celebration, "id">) => {
    const id = seq.current++
    setCele((x) => [...x.slice(-2), { ...c, id }])
    setTimeout(() => setCele((x) => x.filter((y) => y.id !== id)), 3200)
  }, [])

  /** Apply a change, add XP, keep the streak and missions current, then award badges. */
  const act = useCallback(
    (xp: number, f: (p: PState) => PState) => {
      setS((prev) => {
        const tk = todayKey()
        let p: PState = { ...prev, missions: prev.missions.day === tk ? prev.missions : { day: tk, cards: 0, spot: 0, read: 0, claimed: false } }
        const doneBefore = MISSIONS.filter((mm) => p.missions[mm.id] >= mm.target).map((mm) => mm.id)
        p = f(p)
        // streak
        if (p.streak.last !== tk) {
          const gap = p.streak.last ? dayNum(tk) - dayNum(p.streak.last) : 99
          let { n, freezes } = p.streak
          if (gap === 1) n += 1
          else if (gap === 2 && freezes > 0) { n += 1; freezes -= 1 }
          else n = 1
          if (n > 0 && n % 7 === 0) freezes = Math.min(2, freezes + 1)
          p = { ...p, streak: { n, last: tk, best: Math.max(p.streak.best, n), freezes } }
        }
        // missions just completed
        let bonus = 0
        for (const mm of MISSIONS) {
          if (!doneBefore.includes(mm.id) && p.missions[mm.id] >= mm.target) {
            bonus += 50
            setTimeout(() => celebrate({ kind: "mission", title: "Mission complete", sub: `${mm.label} · +50 XP`, icon: mm.icon }), 0)
          }
        }
        const before = levelOf(p.xp)
        const total = xp + bonus
        p = { ...p, xp: p.xp + total, days: { ...p.days, [tk]: (p.days[tk] || 0) + total } }
        const after = levelOf(p.xp)
        if (after.n > before.n) setTimeout(() => { celebrate({ kind: "level", title: `Level ${after.n}: ${after.name}`, sub: "You levelled up", icon: "Crown" }); pop(null, true) }, 0)
        // badges
        const earn: BadgeId[] = []
        const has = (b: BadgeId) => !!p.badges[b]
        if (!has("streak3") && p.streak.n >= 3) earn.push("streak3")
        if (!has("streak7") && p.streak.n >= 7) earn.push("streak7")
        if (!has("eye10") && p.stats.spotRight >= 10) earn.push("eye10")
        if (!has("combo5") && p.stats.bestCombo >= 5) earn.push("combo5")
        if (!has("cards100") && p.stats.cards >= 100) earn.push("cards100")
        if (!has("stories5") && p.stats.stories >= 5) earn.push("stories5")
        if (!has("lvl3") && after.n >= 3) earn.push("lvl3")
        if (!has("kit") && KIT.some((l) => l.items.every((it) => p.kit[it.id]))) earn.push("kit")
        if (earn.length) {
          p = { ...p, badges: { ...p.badges, ...Object.fromEntries(earn.map((b) => [b, tk])) } }
          for (const b of earn) {
            const def = BADGES.find((x) => x.id === b)!
            setTimeout(() => celebrate({ kind: "badge", title: `Badge: ${def.name}`, sub: def.sub, icon: def.icon }), 0)
          }
        }
        return p
      })
    },
    [celebrate]
  )

  const value = useMemo<Progress>(() => {
    const tk = todayKey()
    const m = s.missions.day === tk ? s.missions : { day: tk, cards: 0, spot: 0, read: 0, claimed: false }
    const missionsDone = MISSIONS.filter((mm) => m[mm.id] >= mm.target).length
    const dueIn = (list: CardI[]) => list.filter((c) => s.srs[c.i] && s.srs[c.i][1] <= today()).length
    return {
      ...s,
      level: levelOf(s.xp),
      m,
      missionsDone,
      reviewCard: (i, ok) =>
        act(ok ? 10 : 4, (p) => {
          const [box] = p.srs[i] || [0, 0]
          const nb = ok ? Math.min(5, box + 1) : 1
          return {
            ...p,
            srs: { ...p.srs, [i]: [nb, today() + (ok ? INTERVAL[nb] : 1)] },
            stats: { ...p.stats, cards: p.stats.cards + 1, knew: p.stats.knew + (ok ? 1 : 0) },
            missions: { ...p.missions, cards: p.missions.cards + 1 },
          }
        }),
      answerSpot: (ok, combo) =>
        act(ok ? 15 + Math.min(combo, 5) * 2 : 5, (p) => ({
          ...p,
          stats: { ...p.stats, spot: p.stats.spot + 1, spotRight: p.stats.spotRight + (ok ? 1 : 0), bestCombo: Math.max(p.stats.bestCombo, combo) },
          missions: { ...p.missions, spot: p.missions.spot + 1 },
        })),
      readStory: (id) => {
        if (s.read.includes(id)) return
        act(20, (p) => (p.read.includes(id) ? p : { ...p, read: [...p.read, id], stats: { ...p.stats, stories: p.stats.stories + 1 }, missions: { ...p.missions, read: p.missions.read + 1 } }))
      },
      tickKit: (id, on) => {
        const first = on && s.kit[id] === undefined
        act(first ? 3 : 0, (p) => ({ ...p, kit: { ...p.kit, [id]: on } }))
      },
      hasDeck: (id) => deckById(id).cost === 0 || s.decks.includes(id),
      unlockDeck: (id) => {
        const d = deckById(id)
        if (d.cost === 0 || s.decks.includes(id)) return true
        if (!wallet.spend(d.cost, `Unlocked deck: ${d.name}`)) return false
        act(0, (p) => ({ ...p, decks: [...p.decks, id] }))
        return true
      },
      claimChest: (el) => {
        if (missionsDone < MISSIONS.length || m.claimed) return
        wallet.earn(CHEST.credits, "Daily missions chest")
        act(CHEST.xp, (p) => ({ ...p, missions: { ...p.missions, claimed: true }, badges: p.badges.chest ? p.badges : { ...p.badges, chest: tk } }))
        pop(el, true)
        celebrate({ kind: "chest", title: `Chest opened: +${CHEST.xp} XP, +${CHEST.credits} credits`, sub: "Come back tomorrow for three new missions", icon: "Gift" })
      },
      finishSession: () => {
        if (!s.badges.first) act(0, (p) => ({ ...p, badges: { ...p.badges, first: tk } }))
        if (!s.badges.first) celebrate({ kind: "badge", title: "Badge: First watch", sub: "You finished your first session", icon: "Anchor" })
      },
      session: (deck, rank, size = 10) => {
        const list = cardsFor(deck, rank)
        const t = today()
        const due = list.filter((c) => s.srs[c.i] && s.srs[c.i][1] <= t).sort((a, b) => s.srs[a.i][1] - s.srs[b.i][1])
        const unseen = list.filter((c) => !s.srs[c.i]).sort((a, b) => a.l - b.l)
        let out = [...due, ...unseen].slice(0, size)
        if (!out.length) out = [...list].sort((a, b) => (s.srs[a.i]?.[1] ?? 0) - (s.srs[b.i]?.[1] ?? 0)).slice(0, size)
        return out
      },
      dueCount: (deck, rank) => dueIn(cardsFor(deck, rank)),
      reset: () => setS(fresh()),
      aiLeft: Math.max(0, AI_FREE_PER_DAY - (s.ai?.day === tk ? s.ai.used : 0)),
      payAi: (label) => {
        const used = s.ai?.day === tk ? s.ai.used : 0
        if (used < AI_FREE_PER_DAY) {
          setS((p) => ({ ...p, ai: { day: tk, used: (p.ai?.day === tk ? p.ai.used : 0) + 1 } }))
          return true
        }
        return wallet.spend(AI_COST, label)
      },
      bonus: (xp) => act(xp, (p) => p),
    }
  }, [s, act, wallet, celebrate])

  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[max(12px,env(safe-area-inset-top,0px))] z-[95] flex flex-col items-center gap-2 px-4">
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
                <span className={`gloss flex size-10 shrink-0 items-center justify-center rounded-xl ${c.kind === "level" ? "tile-amber" : c.kind === "badge" ? "tile-violet" : c.kind === "chest" ? "tile-rose" : "tile-teal"}`}>
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
