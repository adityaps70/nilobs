// New app screens built on the fleet data: Train (decks + spaced repetition), Spot the observation,
// Observation radar, Ready kit and Progress, plus the habit widgets used on Today.
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from "react"
import { AnimatePresence, motion } from "motion/react"

import * as I from "@/components/icons"
import { cn } from "@/lib/utils"
import { Chip, Scroll, TopBar } from "@/components/ui"
import { ChapterBadge, IconTile, TopicBadge, type TileColor } from "@/components/topicIcons"
import { COSTS, CostTag, CreditPill, EARN, useWallet } from "@/credits"
import { AI_XP_CAP, BADGES, CHEST, LEVELS, MISSIONS, XP, dayKey, pop, streakMultiplier, useProgress } from "@/progress"
import {
  BENCH, CHAPTER_NAMES, DECKS, KIT, OBS, TYPE_COLOR, TYPE_HINT, TYPE_KEYS, TYPE_NAME, cardsFor, countBy, deckById, type DeckId, type Obs,
} from "@/fleet"
import { RANKS, RANK_NAMES, RANK_TOPICS, SHIP_TYPES, type Topic } from "@/data"
import type { AppScreen } from "@/nav"
import { STORIES } from "@/stories"
import { AiChip, ExplainObs } from "@/components/AiFeatures"

type Ico = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
const ICON = I as unknown as Record<string, Ico>
const shuffle = <T,>(a: T[]) => {
  const x = [...a]
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[x[i], x[j]] = [x[j], x[i]]
  }
  return x
}
const SRC_LABEL: Record<string, string> = { "2026": "2026", "2025": "2025", pv: "Pre-vetting audit" }

/* =====================================================================
   Small habit widgets
   ===================================================================== */
export function LevelRing({ size = 44, stroke = 4, dark }: { size?: number; stroke?: number; dark?: boolean }) {
  const p = useProgress()
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} aria-label={`Level ${p.level.n}, ${p.level.name}, ${p.xp} XP`} role="img">
      <svg width={size} height={size} className="lvl-ring -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dark ? "rgba(255,255,255,0.18)" : "rgba(11,107,203,0.14)"} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#lvlgrad)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} initial={false} animate={{ strokeDashoffset: c * (1 - p.level.pct) }} transition={{ duration: 0.8 }}
        />
        <defs>
          <linearGradient id="lvlgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffb547" /><stop offset="1" stopColor="#ff6a2b" /></linearGradient>
        </defs>
      </svg>
      <span className={cn("display absolute text-[13px] font-bold", dark ? "text-white" : "text-ink")} style={{ fontSize: size * 0.32 }}>{p.level.n}</span>
    </span>
  )
}

export function StreakPill({ className, onClick }: { className?: string; onClick?: () => void }) {
  const p = useProgress()
  const live = p.live.state === "done"
  const n = p.live.n
  const hint = p.live.state === "due" ? ". Do one activity today to keep it" : p.live.state === "freeze" ? ". You missed yesterday; a freeze will save it if you train today" : p.live.state === "lost" ? ". Start a new streak today" : ""
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${n}-day streak${hint}`}
      aria-label={`${n}-day streak${hint}`}
      className={cn("tnum flex h-10 shrink-0 items-center gap-1 rounded-full border px-3 font-mono text-[13px] font-semibold", live ? "border-[#ffd2b0] bg-[#fff1e5]/80 text-[#c2410c]" : "border-line bg-surface text-mute", className)}
    >
      <motion.span animate={live ? { scale: [1, 1.18, 1] } : {}} transition={{ repeat: Infinity, duration: 2.4 }} className="flex">
        <I.Flame size={17} className={live ? "fill-[#ffb547]" : ""} />
      </motion.span>
      {n}
      {p.live.state === "freeze" && <I.Snow size={13} className="text-[#2a78d6]" />}
    </button>
  )
}

export function MissionsCard({ go, onSpot }: { go: (s: AppScreen) => void; onSpot?: () => void }) {
  const p = useProgress()
  const chestRef = useRef<HTMLButtonElement>(null)
  const all = p.missionsDone === MISSIONS.length
  const targets: Record<string, () => void> = { cards: () => go("session"), spot: () => (onSpot ? onSpot() : go("spot")), read: () => go("stories") }
  return (
    <section aria-label="Today's missions" className="glass-deep sheen flex flex-col gap-3.5 rounded-[24px] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[12px] font-semibold tracking-[0.06em] text-white/60 uppercase">Today's missions</span>
          <span className="display text-[20px] leading-tight font-bold text-white">{all ? (p.m.claimed ? "All done. See you tomorrow" : "All three done!") : `${p.missionsDone} of 3 done`}</span>
        </div>
        <LevelRing size={46} dark />
      </div>
      <div className="flex flex-col gap-2">
        {MISSIONS.map((mm) => {
          const v = Math.min(mm.target, p.m[mm.id]), ok = v >= mm.target
          const Icon = ICON[mm.icon]
          return (
            <button key={mm.id} type="button" onClick={targets[mm.id]} className="flex items-center gap-3 rounded-2xl bg-white/[0.07] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.12]">
              <IconTile icon={ok ? I.Check : Icon} color={ok ? "green" : mm.id === "cards" ? "blue" : mm.id === "spot" ? "orange" : "violet"} size={34} />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className={cn("text-[13.5px] leading-tight font-semibold text-white", ok && "text-white/70 line-through decoration-white/40")}>{mm.label}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-white/15">
                  <motion.span className="block h-full rounded-full bg-gradient-to-r from-[#ffb547] to-[#ff6a2b]" initial={false} animate={{ width: `${(v / mm.target) * 100}%` }} />
                </span>
              </span>
              <span className="tnum font-mono text-[12px] font-semibold text-white/75">{v}/{mm.target}</span>
            </button>
          )
        })}
      </div>
      <button
        ref={chestRef}
        type="button"
        disabled={!all || p.m.claimed}
        onClick={() => p.claimChest(chestRef.current)}
        className={cn(
          "flex h-12 items-center justify-center gap-2 rounded-2xl text-[14.5px] font-bold transition-all",
          all && !p.m.claimed ? "sheen bg-gradient-to-r from-[#ffcf5a] to-[#ff7a2f] text-[#2a1200] shadow-[0_10px_30px_-10px_rgba(255,122,47,0.8)]" : "bg-white/[0.08] text-white/60"
        )}
      >
        <I.Gift size={19} />
        {p.m.claimed ? "Chest opened today" : all ? `Open the chest: +${CHEST.xp} XP, +${CHEST.credits} credits` : `Finish all three to open the chest`}
      </button>
    </section>
  )
}

/** Activity calendar: one square per day, shaded by XP earned. */
export function Heatmap({ weeks = 17 }: { weeks?: number }) {
  const p = useProgress()
  const days = useMemo(() => {
    const out: { key: string; xp: number; future: boolean }[] = []
    const now = new Date()
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay() - (weeks - 1) * 7)
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const k = dayKey(d)
      out.push({ key: k, xp: p.days[k] || 0, future: d > now })
    }
    return out
  }, [p.days, weeks])
  const lvl = (x: number) => (x <= 0 ? 0 : x < 30 ? 1 : x < 80 ? 2 : x < 150 ? 3 : 4)
  const active = days.filter((d) => d.xp > 0).length
  return (
    <div className="flex flex-col gap-2.5">
      <div className="no-scrollbar overflow-x-auto">
        <div className="grid grid-flow-col grid-rows-7 gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks}, 13px)` }} role="img" aria-label={`Activity over the last ${weeks} weeks: active on ${active} days`}>
          {days.map((d) => (
            <span
              key={d.key}
              title={d.future ? "" : `${d.key}: ${d.xp} XP`}
              className="size-[13px] rounded-[3.5px]"
              style={{ background: d.future ? "transparent" : `var(--heat-${lvl(d.xp)})` }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11.5px] text-mute">
        <span>{active ? `Active on ${active} day${active > 1 ? "s" : ""}` : "Your first square lights up after one activity"}</span>
        <span className="flex items-center gap-1">Less {[0, 1, 2, 3, 4].map((l) => <span key={l} className="size-[10px] rounded-[3px]" style={{ background: `var(--heat-${l})` }} />)} More</span>
      </div>
    </div>
  )
}

/** One real observation a day, with a one-tap question. */
export function ObsOfTheDay({ onMore }: { onMore: () => void }) {
  const p = useProgress()
  const o = useMemo(() => {
    const pool = OBS.filter((x) => x.y && x.s === "2026" && x.t.length < 190)
    const n = Number(dayKey().replace(/-/g, ""))
    return pool[n % pool.length]
  }, [])
  const pick = p.ood.day === dayKey() ? p.ood.pick : null
  const right = pick === o.y
  return (
    <section className="flex flex-col gap-3 rounded-[22px] border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[12.5px] font-semibold text-signal-ink"><IconTile icon={I.Target} color="orange" size={26} /> Observation of the day</span>
        <span className="font-mono text-[11px] text-mute">Chapter {o.c}{o.q ? ` · Q ${o.q}` : ""} · {SRC_LABEL[o.s]}</span>
      </div>
      <p className="text-[15px] leading-snug font-medium">“{o.t}”</p>
      <span className="text-[12.5px] font-semibold text-mute">Human, process or hardware?</span>
      <div className="grid grid-cols-3 gap-1.5">
        {TYPE_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            disabled={!!pick}
            onClick={() => p.answerOod(k, k === o.y, o.p)}
            className={cn(
              "flex h-11 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold transition-colors",
              !pick ? "border-line bg-surface hover:border-mute" : k === o.y ? "border-sea bg-sea-soft text-sea" : pick === k ? "border-signal bg-signal-soft text-signal-ink" : "border-line bg-surface opacity-50"
            )}
          >
            <span className="size-2.5 rounded-full" style={{ background: TYPE_COLOR[k] }} />
            {TYPE_NAME[k]}
          </button>
        ))}
      </div>
      <AnimatePresence>
        {pick && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="flex flex-col gap-2 overflow-hidden">
            <span className={cn("text-[13.5px] font-bold", right ? "text-sea" : "text-signal-ink")}>{right ? `Correct. +${XP.spotRight + XP.combo} XP` : `It was ${TYPE_NAME[o.y]}. +${XP.spotWrong} XP for trying`}</span>
            <span className="flex gap-2 rounded-xl bg-sea-soft px-3 py-2.5 text-[13px] leading-snug"><I.Lightbulb size={16} className="mt-px shrink-0 text-sea" />{o.f}</span>
            <button type="button" onClick={onMore} className="self-start text-[13px] font-semibold text-primary">Play Spot the observation →</button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/* =====================================================================
   Train hub
   ===================================================================== */
const DECK_ICON: Record<DeckId, Ico> = { trending: I.TrendUp, ratings: I.Users, ecdis: I.Monitor, cdi: I.Droplet, china: I.Compass }

export function TrainScreen({ rank, go, openDeck }: { rank: string; go: (s: AppScreen) => void; openDeck: (d: DeckId) => void }) {
  const p = useProgress()
  const w = useWallet()
  const mine = cardsFor("trending", rank)
  const due = p.dueCount("trending", rank)
  const fresh = mine.filter((c) => !p.srs[c.i]).length
  // a locked deck opens its unlock screen, so credits are never spent on a single tap
  const start = (d: DeckId) => openDeck(d)
  return (
    <>
      <TopBar title="Train" right={<CreditPill className="h-9" />} />
      <Scroll className="gap-4">
        <section className="glass-deep flex flex-col gap-4 rounded-[24px] p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold tracking-[0.06em] text-white/60 uppercase">Today's 10 · {RANK_NAMES[rank] || rank}</span>
              <span className="display text-[24px] leading-tight font-bold text-white">{due ? `${due} cards due for review` : "Fresh cards ready"}</span>
              <span className="text-[13.5px] leading-snug text-white/70">Cards you miss come back tomorrow. Cards you know come back later and later. +{XP.cardKnew} XP a card{p.multiplier > 1 ? `, ×${p.multiplier} for your streak` : ""}.</span>
            </div>
            <IconTile icon={I.Brain} color="violet" size={48} />
          </div>
          <div className="flex gap-2 text-[12px]">
            {[["Due", due], ["New", fresh], ["In deck", mine.length]].map(([l, v]) => (
              <span key={l} className="flex flex-1 flex-col rounded-xl bg-white/[0.08] px-3 py-2">
                <span className="tnum display text-[19px] font-bold text-white">{v}</span>
                <span className="text-white/60">{l}</span>
              </span>
            ))}
          </div>
          <button type="button" onClick={() => openDeck("trending")} className="sheen flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#ffcf5a] to-[#ff7a2f] text-[15px] font-bold text-[#2a1200]">
            <I.Play size={17} /> Start 10 cards
          </button>
        </section>

        <button type="button" onClick={() => go("spot")} className="glass flex items-center gap-4 rounded-[22px] p-4 text-left">
          <IconTile icon={I.Target} color="orange" size={52} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-2 text-[16px] font-bold">Spot the observation <span className="rounded-full bg-sea-soft px-2 py-0.5 text-[11px] font-semibold text-sea">Free</span></span>
            <span className="text-[13px] leading-snug text-mute">Real findings from {OBS.length} observations. Guess the chapter or the type, then learn the fix.</span>
          </span>
          <I.ChevronRight size={20} className="text-mute" />
        </button>

        <div className="flex items-baseline justify-between">
          <h3 className="text-[15px] font-bold">Decks</h3>
          <span className="font-mono text-[11px] text-mute">{DECKS.reduce((n, d) => n + cardsFor(d.id, rank).length, 0)} cards for you</span>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {DECKS.map((d) => {
            const list = cardsFor(d.id, rank)
            const known = list.filter((c) => (p.srs[c.i]?.[0] ?? 0) >= 3).length
            const dd = p.dueCount(d.id, rank)
            const open = p.hasDeck(d.id)
            return (
              <button key={d.id} type="button" onClick={() => start(d.id)} className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4 text-left transition-transform hover:-translate-y-0.5">
                <span className="flex items-start justify-between gap-2">
                  <IconTile icon={DECK_ICON[d.id]} color={d.color as TileColor} size={42} />
                  {open ? (
                    dd ? <span className="rounded-full bg-signal-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-signal-ink">{dd} due</span> : <span className="rounded-full bg-sea-soft px-2 py-0.5 text-[11px] font-semibold text-sea">{!d.cost ? "Free" : w.perks.allDecks ? "Included" : "Unlocked"}</span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-mute"><I.Lock size={12} /><CostTag cost={d.cost} /></span>
                  )}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] leading-tight font-bold">{d.name}</span>
                  <span className="text-[12.5px] leading-snug text-mute">{d.sub}</span>
                </span>
                <span className="flex flex-col gap-1.5">
                  <span className="h-1.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-primary" style={{ width: `${(known / Math.max(1, list.length)) * 100}%` }} /></span>
                  <span className="tnum font-mono text-[11px] text-mute">{known} of {list.length} known</span>
                </span>
              </button>
            )
          })}
        </div>

        <button type="button" onClick={() => go("practice")} className="flex items-center gap-3.5 rounded-[20px] border border-line bg-surface p-4 text-left">
          <IconTile icon={I.Mic} color="indigo" size={44} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-2 text-[15px] font-bold">AI inspector <AiChip /></span>
            <span className="text-[12.5px] text-mute">Five real questions, graded on fact, procedure and record, with follow-ups. Voice mode available</span>
          </span>
          <CostTag cost={COSTS.interview} className="text-mute" />
        </button>
        <p className="text-center text-[11.5px] leading-snug text-mute">Answers come from officers' and superintendents' notes. Check them against your SMS and the current rules.</p>
      </Scroll>
    </>
  )
}

/* =====================================================================
   Flashcard session (spaced repetition)
   ===================================================================== */
export function SessionScreen({ deck, rank, go }: { deck: DeckId; rank: string; go: (s: AppScreen) => void }) {
  const p = useProgress()
  const w = useWallet()
  const d = deckById(deck)
  const [batch, setBatch] = useState(() => p.session(deck, rank, 10))
  const cards = batch.cards
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [got, setGot] = useState<boolean[]>([])
  const [earned, setEarned] = useState(0)
  const [float, setFloat] = useState<{ id: number; t: string } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const unlockedAt = useRef(0)
  const finished = i >= cards.length
  const owned = p.hasDeck(deck)
  const flip = () => {
    if (Date.now() - unlockedAt.current < 600) return // the second tap of a double tap on "Unlock"
    setFlipped((f) => !f)
  }

  const answer = (ok: boolean) => {
    const c = cards[i]
    if (!c || !owned) return
    const xp = p.reviewCard(c.i, ok)
    setEarned((e) => e + xp)
    setFloat({ id: Date.now(), t: `+${xp} XP` })
    setGot((g) => [...g, ok])
    setFlipped(false)
    setI((v) => v + 1)
  }
  useEffect(() => {
    if (!finished || !owned) return
    p.finishSession()
    const t = setTimeout(() => pop(endRef.current, true), 200)
    return () => clearTimeout(t)
  }, [finished]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (finished || !owned || tag === "TEXTAREA" || tag === "INPUT") return
      if (e.key === " ") {
        e.preventDefault()
        setFlipped((f) => !f)
      }
      if (e.key === "ArrowRight" && flipped) answer(true)
      if (e.key === "ArrowLeft" && flipped) answer(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  if (!owned)
    return (
      <>
        <TopBar title={d.name} onBack={() => go("train")} />
        <Scroll className="items-center gap-4 pt-6 text-center">
          <IconTile icon={DECK_ICON[deck]} color={d.color as TileColor} size={84} />
          <h3 className="display text-[26px] leading-tight font-bold">{d.name}</h3>
          <p className="max-w-[36ch] text-[14.5px] leading-snug text-mute">{d.sub}. {cardsFor(deck, rank).length} cards with spaced repetition. Unlock it once and keep it, or get every specialist deck with a plan.</p>
          <button type="button" onClick={() => { if (p.unlockDeck(deck)) { unlockedAt.current = Date.now(); setBatch(p.session(deck, rank, 10)) } }} className="flex h-12 w-full max-w-[360px] items-center justify-between rounded-2xl bg-primary px-5 text-[15px] font-semibold text-on-primary">
            Unlock this deck <CostTag cost={d.cost} />
          </button>
          <button type="button" onClick={() => w.openPlans({ reason: "Every specialist deck is included with Watchkeeper and Command.", select: "watch" })} className="text-[13.5px] font-semibold text-primary">See plans that include it →</button>
        </Scroll>
      </>
    )

  if (finished) {
    const n = got.filter(Boolean).length
    return (
      <>
        <TopBar title={d.name} onBack={() => go("train")} />
        <Scroll className="items-center gap-4 pt-4 text-center">
          <div ref={endRef}><IconTile icon={I.Trophy} color="amber" size={84} /></div>
          <h3 className="display text-[28px] leading-tight font-bold">Session done</h3>
          <p className="max-w-[34ch] text-[14.5px] leading-snug text-mute">
            You knew {n} of {cards.length}.{n < cards.length ? " The ones you missed come back first tomorrow." : batch.extra ? " Extra practice keeps them fresh." : " Each one comes back later, when it's due."}
          </p>
          <div className="grid w-full grid-cols-3 gap-2">
            {[["XP this round", `+${earned}`], ["Streak", `${p.live.n} day${p.live.n === 1 ? "" : "s"}`], ["Cards mission", `${Math.min(10, p.m.cards)}/10`]].map(([l, v]) => (
              <span key={l} className="flex flex-col rounded-2xl border border-line bg-surface px-2 py-3">
                <span className="tnum display text-[20px] font-bold">{v}</span>
                <span className="text-[11.5px] text-mute">{l}</span>
              </span>
            ))}
          </div>
          <div className="flex w-full flex-col gap-1.5 text-left">
            {cards.map((c, j) => (
              <div key={c.i} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] leading-snug">
                {got[j] ? <I.Check size={16} className="mt-px shrink-0 text-sea" /> : <I.Refresh size={15} className="mt-px shrink-0 text-signal-ink" />}
                {c.q}
              </div>
            ))}
          </div>
          <div className="grid w-full grid-cols-2 gap-2">
            <button type="button" onClick={() => go("train")} className="h-12 rounded-2xl border border-line bg-surface text-[14.5px] font-semibold">Back to Train</button>
            <button
              type="button"
              onClick={() => {
                setBatch(p.session(deck, rank, 10))
                setI(0)
                setGot([])
                setEarned(0)
              }}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-[14.5px] font-semibold text-on-primary"
            >
              <I.Play size={15} /> Another 10
            </button>
          </div>
        </Scroll>
      </>
    )
  }
  const c = cards[i]
  return (
    <>
      <TopBar title={d.name} onBack={() => go("train")} right={<StreakPill className="h-9" />} />
      <div className="no-scrollbar relative flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5">
        {batch.extra && i === 0 && !flipped && <p className="rounded-xl bg-surface-2 px-3 py-2 text-[12.5px] leading-snug text-mute">Nothing is due in this deck today, so this is extra practice: +{XP.cardExtra} XP a card, and it won't change when cards come back.</p>}
        <div className="flex items-center gap-3">
          <span className="flex flex-1 gap-1" aria-label={`Card ${i + 1} of ${cards.length}`}>
            {cards.map((_, j) => <span key={j} className={cn("h-1.5 flex-1 rounded-full transition-colors", j < i ? (got[j] ? "bg-sea" : "bg-signal") : j === i ? "bg-primary" : "bg-surface-2")} />)}
          </span>
          <span className="tnum font-mono text-[12px] font-semibold">{i + 1}/{cards.length}</span>
        </div>
        <button type="button" onClick={flip} aria-label={flipped ? "Show the question" : "Show the answer"} className="relative h-[clamp(320px,54vh,450px)] shrink-0 [perspective:1400px]">
          <motion.div key={c.i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0, rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }} className="relative size-full [transform-style:preserve-3d]">
            <div className="glass absolute inset-0 flex flex-col gap-4 rounded-[28px] p-6 text-left [backface-visibility:hidden]">
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[12px] font-semibold text-mute"><TopicBadge topic={c.p as Topic} size={28} />{c.p}</span>
                <span className="flex gap-0.5" aria-label={`Difficulty ${c.l} of 3`}>{[1, 2, 3].map((l) => <I.Star key={l} size={13} className={l <= c.l ? "fill-[#ffb547] text-[#f08a12]" : "text-line"} />)}</span>
              </span>
              <span className="display my-auto text-[clamp(1.3rem,4.6vw,1.75rem)] leading-[1.2] font-bold">{c.q}</span>
              <span className="flex items-center gap-2 text-[13px] text-mute"><I.Refresh size={15} /> Tap to turn over<span className="hidden sm:inline"> · Space flips, ← not yet, → knew it</span></span>
            </div>
            <div className="glass-deep absolute inset-0 flex flex-col gap-3 overflow-y-auto rounded-[28px] p-6 text-left [backface-visibility:hidden] [transform:rotateY(180deg)]">
              <span className="text-[13px] leading-snug text-white/60">{c.q}</span>
              <span className="text-[12px] font-semibold tracking-[0.08em] text-[#ffb547] uppercase">What inspectors expect</span>
              <span className="text-[17.5px] leading-snug font-medium text-white">{c.a}</span>
              {c.t && <span className="mt-auto flex gap-2 rounded-xl bg-white/[0.08] px-3 py-2.5 text-[12.5px] leading-snug text-white/80"><I.Info size={15} className="mt-px shrink-0" />{c.t}</span>}
            </div>
          </motion.div>
        </button>
        <AnimatePresence>
          {float && (
            <motion.span key={float.id} initial={{ opacity: 1, y: 0 }} animate={{ opacity: 0, y: -60 }} transition={{ duration: 1.1 }} onAnimationComplete={() => setFloat(null)} className="pointer-events-none absolute top-1/3 right-8 font-mono text-[18px] font-bold text-[#f08a12]">
              {float.t}
            </motion.span>
          )}
        </AnimatePresence>
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" disabled={!flipped} onClick={() => answer(false)} className="flex h-[54px] items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-[15px] font-semibold disabled:opacity-40"><I.Refresh size={17} /> Not yet</button>
          <button type="button" disabled={!flipped} onClick={() => answer(true)} className="flex h-[54px] items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-on-primary disabled:opacity-40"><I.Check size={18} /> Knew it</button>
        </div>
        {!flipped && <p className="-mt-2 text-center text-[12px] text-mute">Say your answer first, then turn the card over.</p>}
      </div>
    </>
  )
}

/* =====================================================================
   Spot the observation
   ===================================================================== */
type Round = { o: Obs; kind: "chapter" | "type"; options: string[]; answer: string }
const GAME_CHAPTERS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
function makeRounds(n: number): Round[] {
  // Only findings whose chapter (SIRE 2.0 reports) or type (2026 list) came from the inspector, not inferred
  const pool = shuffle(OBS.filter((o) => o.i === "SIRE 2.0" && o.c >= 2 && o.c <= 11 && o.t.length < 200))
  const out: Round[] = []
  for (const o of pool) {
    if (out.length >= n) break
    const kind: Round["kind"] = out.length % 2 === 1 && o.y && o.s === "2026" ? "type" : "chapter"
    if (out.length % 2 === 1 && kind === "chapter") continue
    if (kind === "type") out.push({ o, kind, options: [...TYPE_KEYS], answer: o.y })
    else {
      const others = shuffle(GAME_CHAPTERS.filter((c) => c !== o.c)).slice(0, 3)
      out.push({ o, kind, options: shuffle([o.c, ...others]).map(String), answer: String(o.c) })
    }
  }
  return out
}

export function SpotGame({ rounds = 8, embedded, onExit }: { rounds?: number; embedded?: boolean; onExit?: () => void }) {
  const p = useProgress()
  const [game, setGame] = useState(() => makeRounds(rounds))
  const [i, setI] = useState(0)
  const [pick, setPick] = useState<string | null>(null)
  const [combo, setCombo] = useState(0)
  const [best, setBest] = useState(0)
  const [score, setScore] = useState(0)
  const [xp, setXp] = useState(0)
  const [last, setLast] = useState(0)
  const endRef = useRef<HTMLDivElement>(null)
  const done = i >= game.length
  const r = game[Math.min(i, game.length - 1)]
  useEffect(() => {
    if (done) setTimeout(() => pop(endRef.current, score >= game.length * 0.6), 150)
  }, [done]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (opt: string) => {
    if (pick) return
    setPick(opt)
    const ok = opt === r.answer
    const nc = ok ? combo + 1 : 0
    setCombo(nc)
    setBest((b) => Math.max(b, nc))
    if (ok) setScore((s) => s + 1)
    const gained = p.answerSpot(ok, nc, r.o.p)
    setLast(gained)
    setXp((x) => x + gained)
  }
  const next = () => {
    setPick(null)
    setI((v) => v + 1)
  }
  const again = () => {
    setGame(makeRounds(rounds))
    setI(0); setPick(null); setCombo(0); setBest(0); setScore(0); setXp(0)
  }

  if (done) {
    const pct = score / game.length
    return (
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <div ref={endRef}><IconTile icon={pct >= 0.75 ? I.Crown : pct >= 0.5 ? I.Award : I.Target} color={pct >= 0.75 ? "amber" : "orange"} size={76} /></div>
        <h3 className="display text-[26px] leading-tight font-bold">{score} of {game.length} spotted</h3>
        <p className="max-w-[34ch] text-[14px] leading-snug text-mute">
          {pct >= 0.75 ? "You think like an inspector." : pct >= 0.5 ? "Solid. Chapters 5 and 8 catch most people out." : "Every round teaches a fix. Play again and it sticks."}
        </p>
        <div className="grid w-full max-w-[420px] grid-cols-3 gap-2">
          {[["XP earned", `+${xp}`], ["Best combo", `×${best}`], ["Streak", `${p.live.n}d`]].map(([l, v]) => (
            <span key={l} className="flex flex-col rounded-2xl border border-line bg-surface px-2 py-3">
              <span className="tnum display text-[20px] font-bold">{v}</span>
              <span className="text-[11.5px] text-mute">{l}</span>
            </span>
          ))}
        </div>
        <div className="flex w-full max-w-[420px] gap-2">
          {onExit && <button type="button" onClick={onExit} className="h-12 flex-1 rounded-2xl border border-line bg-surface text-[14.5px] font-semibold">{embedded ? "Keep going in the app" : "Done"}</button>}
          <button type="button" onClick={again} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-[14.5px] font-semibold text-on-primary"><I.Refresh size={16} /> Play again</button>
        </div>
      </div>
    )
  }

  const ok = pick === r.answer
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <span className="flex flex-1 gap-1" aria-label={`Round ${i + 1} of ${game.length}`}>
          {game.map((_, j) => <span key={j} className={cn("h-1.5 flex-1 rounded-full", j < i ? "bg-primary" : j === i ? "bg-[#f08a12]" : "bg-surface-2")} />)}
        </span>
        <AnimatePresence mode="popLayout">
          {combo >= 2 && (
            <motion.span key={combo} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-1 rounded-full bg-gradient-to-r from-[#ffcf5a] to-[#ff7a2f] px-2.5 py-1 font-mono text-[12px] font-bold text-[#2a1200]">
              <I.Flame size={13} /> ×{combo}
            </motion.span>
          )}
        </AnimatePresence>
        <span className="tnum font-mono text-[12px] font-semibold text-mute">{score} pts</span>
      </div>

      <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass flex flex-col gap-3 rounded-[24px] p-5">
        <span className="flex flex-wrap items-center gap-2 text-[11.5px] font-semibold text-mute">
          <TopicBadge topic={r.o.p} size={26} />
          <span>{r.o.i} · {SRC_LABEL[r.o.s]}</span>
          {r.o.r && <span className="rounded-full bg-surface-2 px-2 py-0.5">{r.o.r}</span>}
        </span>
        <p className="text-[16.5px] leading-snug font-medium">“{r.o.t}”</p>
      </motion.div>

      <span className="text-[14px] font-bold">{r.kind === "chapter" ? "Which SIRE 2.0 chapter did this fall under?" : "Was it a Human, Process or Hardware observation?"}</span>
      <div className={cn("grid gap-2", r.kind === "chapter" ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
        {r.options.map((opt) => {
          const isAns = opt === r.answer, isPick = opt === pick
          return (
            <motion.button
              key={opt}
              type="button"
              whileTap={{ scale: 0.97 }}
              animate={pick && isPick && !isAns ? { x: [0, -6, 6, -4, 4, 0] } : {}}
              onClick={() => choose(opt)}
              className={cn(
                "flex min-h-[54px] items-center gap-3 rounded-2xl border px-3 py-2 text-left text-[14px] font-semibold transition-colors",
                !pick ? "border-line bg-surface hover:border-primary/50" : isAns ? "border-sea bg-sea-soft text-ink" : isPick ? "border-signal bg-signal-soft" : "border-line bg-surface opacity-45"
              )}
            >
              {r.kind === "chapter" ? <ChapterBadge ch={opt} size={32} /> : <span className="size-3.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR[opt] }} />}
              <span className="flex min-w-0 flex-col">
                <span className="leading-tight">{r.kind === "chapter" ? `${opt} · ${CHAPTER_NAMES[Number(opt)]}` : TYPE_NAME[opt]}</span>
                {r.kind === "type" && <span className="text-[11.5px] leading-snug font-normal text-mute">{TYPE_HINT[opt]}</span>}
              </span>
              {pick && isAns && <I.Check size={18} className="ml-auto shrink-0 text-sea" />}
            </motion.button>
          )
        })}
      </div>

      <AnimatePresence>
        {pick && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2.5">
            <span className={cn("flex items-center gap-2 text-[14.5px] font-bold", ok ? "text-sea" : "text-signal-ink")}>
              {ok ? <I.Check size={18} /> : <I.Alert size={17} />}
              {ok ? `Spot on. +${last} XP` : `Not quite. It was ${r.kind === "chapter" ? `chapter ${r.answer}` : TYPE_NAME[r.answer]}. +${last} XP`}
            </span>
            {r.o.f && <span className="flex gap-2.5 rounded-2xl bg-sea-soft px-3.5 py-3 text-[13.5px] leading-snug"><I.Lightbulb size={17} className="mt-px shrink-0 text-sea" /><span><b className="font-semibold">How to avoid it: </b>{r.o.f}</span></span>}
            <ExplainObs key={i} o={r.o} />
            <button type="button" onClick={next} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-on-primary">
              {i + 1 < game.length ? "Next" : "See my score"} <I.ArrowRight size={17} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function SpotScreen({ go }: { go: (s: AppScreen) => void }) {
  return (
    <>
      <TopBar title="Spot the observation" onBack={() => go("train")} right={<StreakPill className="h-9" />} />
      <Scroll className="gap-4 pt-1">
        <SpotGame onExit={() => go("today")} />
      </Scroll>
    </>
  )
}

/* =====================================================================
   Observation radar (charts)
   ===================================================================== */
export function ChapterBars({ list, active, onPick, max = 10 }: { list: Obs[]; active?: number | null; onPick?: (c: number | null) => void; max?: number }) {
  const rows = countBy(list, (o) => o.c).slice(0, max) as [number, number][]
  const top = rows[0]?.[1] || 1
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Observations by SIRE 2.0 chapter">
      {rows.map(([c, n]) => (
        <li key={c}>
          <button
            type="button"
            disabled={!onPick}
            onClick={() => onPick?.(active === c ? null : c)}
            title={`Chapter ${c}, ${CHAPTER_NAMES[c]}: ${n} observations (${Math.round((n / list.length) * 100)}%)`}
            aria-pressed={onPick ? active === c : undefined}
            className={cn("grid w-full grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 rounded-xl px-1.5 py-1.5 text-left transition-colors", onPick && "hover:bg-surface-2/70", active === c && "bg-primary-soft")}
          >
            <ChapterBadge ch={String(c)} size={30} />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-[13px] font-semibold">{c} · {CHAPTER_NAMES[c]}</span>
              <span className="h-2 rounded-full bg-surface-2">
                <motion.span className="block h-2 rounded-full bg-primary" initial={false} animate={{ width: `${(n / top) * 100}%`, opacity: active && active !== c ? 0.35 : 1 }} transition={{ duration: 0.5 }} />
              </span>
            </span>
            <span className="tnum self-end font-mono text-[12px] font-semibold">{n}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function TypeSplit({ list }: { list: Obs[] }) {
  const typed = list.filter((o) => o.y && o.s === "2026")
  const counts = TYPE_KEYS.map((k) => [k, typed.filter((o) => o.y === k).length] as const)
  const total = typed.length || 1
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-4 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={counts.map(([k, n]) => `${TYPE_NAME[k]} ${n}`).join(", ")}>
        {counts.map(([k, n]) => (
          <motion.span key={k} title={`${TYPE_NAME[k]}: ${n} (${Math.round((n / total) * 100)}%)`} initial={false} animate={{ width: `${(n / total) * 100}%` }} className="h-4 first:rounded-l-full last:rounded-r-full" style={{ background: TYPE_COLOR[k] }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {counts.map(([k, n]) => (
          <span key={k} className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[12.5px] font-semibold"><span className="size-2.5 rounded-full" style={{ background: TYPE_COLOR[k] }} />{TYPE_NAME[k]}</span>
            <span className="tnum display text-[20px] leading-none font-bold">{Math.round((n / total) * 100)}%</span>
            <span className="tnum font-mono text-[11px] text-mute">{n} findings</span>
          </span>
        ))}
      </div>
      <span className="text-[11.5px] leading-snug text-mute">Types as recorded by the inspector, 2026 findings ({typed.length}).</span>
    </div>
  )
}

export function FactorBars({ list, type = "H", n = 5 }: { list: Obs[]; type?: "H" | "P" | "W"; n?: number }) {
  const rows = countBy(list.filter((o) => o.y === type && o.k && o.k !== "Other"), (o) => o.k).slice(0, n) as [string, number][]
  const top = rows[0]?.[1] || 1
  if (!rows.length) return <p className="text-[13px] text-mute">Not enough typed findings in this filter.</p>
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map(([k, v]) => (
        <li key={k} className="flex flex-col gap-1" title={`${k}: ${v}`}>
          <span className="flex items-baseline justify-between gap-2 text-[13px]"><span className="font-medium">{k}</span><span className="tnum font-mono text-[12px] font-semibold">{v}</span></span>
          <span className="h-2 rounded-full bg-surface-2"><span className="block h-2 rounded-full" style={{ width: `${(v / top) * 100}%`, background: TYPE_COLOR[type] }} /></span>
        </li>
      ))}
    </ul>
  )
}

export function ObsCard({ o }: { o: Obs }) {
  return (
    <article className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3.5">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-mute">
        <ChapterBadge ch={String(o.c || 1)} size={24} />
        <span>Ch {o.c || "?"}</span>
        {o.y && <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5"><span className="size-2 rounded-full" style={{ background: TYPE_COLOR[o.y] }} />{TYPE_NAME[o.y]}</span>}
        <span className="rounded-full bg-surface-2 px-2 py-0.5">{o.p}</span>
        {o.r && <span className="rounded-full bg-surface-2 px-2 py-0.5">{o.r}</span>}
        {o.q && <span className="rounded-full bg-primary-soft px-2 py-0.5 font-mono text-primary" title="SIRE 2.0 question number">Q {o.q}</span>}
        <span className="ml-auto font-mono font-normal">{o.i === "SIRE 2.0" ? SRC_LABEL[o.s] : o.i}</span>
      </div>
      <p className="text-[14px] leading-snug">{o.t}</p>
      {o.f && <p className="flex gap-2 text-[13px] leading-snug text-sea"><I.Lightbulb size={15} className="mt-px shrink-0" />{o.f}</p>}
      <ExplainObs o={o} compact />
    </article>
  )
}

export function RadarScreen({ rank, go }: { rank: string; go: (s: AppScreen) => void }) {
  const [mine, setMine] = useState(false)
  const [src, setSrc] = useState<"all" | "SIRE 2.0" | "CDI" | "Pre-vetting">("all")
  const [ch, setCh] = useState<number | null>(null)
  const [topic, setTopic] = useState<Topic | null>(null)
  const [q, setQ] = useState("")
  const [shown, setShown] = useState(15)
  const rel = RANK_TOPICS[rank] || RANK_TOPICS["2/O"]
  const base = OBS.filter((o) => (src === "all" || o.i === src) && (!mine || rel.includes(o.p)))
  const ql = q.trim().toLowerCase()
  const list = base.filter((o) => (!ch || o.c === ch) && (!topic || o.p === topic) && (!ql || (o.t + " " + o.f + " " + o.p).toLowerCase().includes(ql)))
  const topics0 = countBy(base.filter((o) => !ch || o.c === ch), (o) => o.p).slice(0, 8) as [Topic, number][]
  // keep the active topic chip visible (so it can always be cleared), even when a chapter filter hides it
  const topics = topic && !topics0.some(([t]) => t === topic) ? ([[topic, base.filter((o) => (!ch || o.c === ch) && o.p === topic).length], ...topics0] as [Topic, number][]) : topics0
  const n = (i: string) => OBS.filter((o) => o.i === i).length
  return (
    <>
      <TopBar title="Observation radar" onBack={() => go("today")} />
      <Scroll className="gap-4">
        <section className="glass-deep flex flex-col gap-3 rounded-[24px] p-5">
          <span className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.06em] text-white/60 uppercase"><I.Radar size={15} /> From real inspections, 2025–2026</span>
          <span className="flex items-end gap-3">
            <span className="tnum display text-[44px] leading-none font-bold text-white">{OBS.length}</span>
            <span className="pb-1 text-[14px] leading-snug text-white/75">findings, de-identified, each with a fix</span>
          </span>
          <span className="flex flex-wrap gap-1.5 text-[12px]">
            {[["SIRE 2.0", n("SIRE 2.0")], ["CDI", n("CDI")], ["Pre-vetting audits", n("Pre-vetting")]].map(([l, v]) => (
              <span key={l} className="rounded-full bg-white/[0.1] px-2.5 py-1 font-semibold text-white/85">{l} · {v}</span>
            ))}
          </span>
          <span className="text-[12.5px] leading-snug text-white/65">For scale: across {BENCH.reports.toLocaleString("en-IN")} SIRE 2.0 reports, the average was {BENCH.avgNeg} negative and {BENCH.avgPos} positive observations per inspection (INTERTANKO, {BENCH.period}).</span>
        </section>

        <div className="flex flex-col gap-2">
          <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5">
            <Chip on={!mine} onClick={() => setMine(false)} size="sm">All ranks</Chip>
            <Chip on={mine} onClick={() => setMine(true)} size="sm">Topics for a {rank}</Chip>
            <span className="mx-1 w-px shrink-0 bg-line" />
            {(["all", "SIRE 2.0", "CDI", "Pre-vetting"] as const).map((s) => <Chip key={s} on={src === s} onClick={() => setSrc(s)} size="sm">{s === "all" ? "Every source" : s}</Chip>)}
          </div>
        </div>

        <section className="glass flex flex-col gap-3 rounded-[22px] p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-bold">Where findings land</h3>
            <span className="text-[11.5px] text-mute">{ch ? "Tap again to clear" : "Tap a chapter to filter"}</span>
          </div>
          <ChapterBars list={base} active={ch} onPick={(c) => { setCh(c); setShown(15) }} />
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <section className="glass flex flex-col gap-3 rounded-[22px] p-4">
            <h3 className="text-[15px] font-bold">What kind of finding</h3>
            <TypeSplit list={base.filter((o) => !ch || o.c === ch)} />
          </section>
          <section className="glass flex flex-col gap-3 rounded-[22px] p-4">
            <h3 className="text-[15px] font-bold">Why people got caught out</h3>
            <FactorBars list={base.filter((o) => !ch || o.c === ch)} type="H" />
          </section>
        </div>

        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[15px] font-bold">{ch ? `Chapter ${ch}: ${CHAPTER_NAMES[ch]}` : "All findings"}</h3>
            <span className="tnum font-mono text-[11px] text-mute">{Math.min(shown, list.length)} of {list.length}{list.length !== base.length ? ` (${base.length} in total)` : ""}</span>
          </div>
          <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5">
            {topics.map(([t, v]) => (
              <button key={t} type="button" aria-pressed={topic === t} onClick={() => setTopic(topic === t ? null : t)} className={cn("flex h-10 shrink-0 items-center gap-2 rounded-full border pr-3 pl-1 text-[12.5px] font-medium whitespace-nowrap", topic === t ? "border-primary bg-primary-soft" : "border-line bg-surface")}>
                <TopicBadge topic={t} size={28} />{t}<span className="tnum font-mono text-[11px] text-mute">{v}</span>
              </button>
            ))}
          </div>
          <label htmlFor="radar-q" className="flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3">
            <I.Search size={17} className="text-mute" />
            <input id="radar-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search findings, e.g. gas meter, pilot ladder" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-mute" />
          </label>
          {list.slice(0, shown).map((o, j) => <ObsCard key={j + o.t.slice(0, 20)} o={o} />)}
          {shown < list.length && (
            <button type="button" onClick={() => setShown((s) => s + 15)} className="h-11 rounded-xl border border-line bg-surface text-[13.5px] font-semibold">Show 15 more</button>
          )}
          {!list.length && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line p-4 text-center text-[13px] text-mute">
              No findings match.
              <button type="button" onClick={() => { setCh(null); setTopic(null); setQ("") }} className="h-9 rounded-full border border-line bg-surface px-3 text-[12.5px] font-semibold text-ink">Clear all filters</button>
            </div>
          )}
        </section>
        <p className="text-center text-[11.5px] leading-snug text-mute">From one fleet's SIRE 2.0, CDI and pre-vetting findings. Ship, crew and company names removed; wording paraphrased.</p>
      </Scroll>
    </>
  )
}

/* =====================================================================
   Ready kit
   ===================================================================== */
const KIT_ICON: Record<string, [Ico, TileColor]> = {
  drills: [I.LifeBuoy, "orange"], rest: [I.Clock, "teal"], famil: [I.Users, "violet"], cyber: [I.Lock, "indigo"],
  photos: [I.Camera, "sky"], cdiDocs: [I.FileText, "amber"], cdiPersonal: [I.ListCheck, "rose"],
}
export function KitScreen({ go }: { go: (s: AppScreen) => void }) {
  const p = useProgress()
  const [open, setOpen] = useState<string | null>("drills")
  const [confirm, setConfirm] = useState(false)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    const text = KIT.map((l) => `${l.title}\n${l.items.map((it) => `${p.kit[it.id] ? "[x]" : "[ ]"} ${it.text}`).join("\n")}`).join("\n\n")
    try {
      await navigator.clipboard.writeText(`NilObs ready kit\n\n${text}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }
  const ref = useRef<HTMLDivElement>(null)
  const total = KIT.reduce((n, l) => n + l.items.length, 0)
  const doneAll = KIT.reduce((n, l) => n + l.items.filter((it) => p.kit[it.id]).length, 0)
  return (
    <>
      <TopBar title="Ready kit" onBack={() => go("today")} />
      <Scroll className="gap-3">
        <section className="glass flex items-center gap-4 rounded-[22px] p-4">
          <IconTile icon={I.Briefcase} color="amber" size={52} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[16px] font-bold">Get the ship ready</span>
            <span className="text-[13px] leading-snug text-mute">Checklists built from what inspectors actually picked up. Tick as you go. +3 XP each.</span>
            <span className="mt-1 h-1.5 rounded-full bg-surface-2"><span className="block h-full rounded-full bg-sea" style={{ width: `${(doneAll / total) * 100}%` }} /></span>
            <span className="tnum font-mono text-[11px] text-mute">{doneAll} of {total} ticked</span>
          </span>
        </section>
        <div ref={ref} className="flex flex-col gap-2.5">
          {KIT.map((l) => {
            const d = l.items.filter((it) => p.kit[it.id]).length
            const [Icon, color] = KIT_ICON[l.id] || [I.ListCheck, "blue"]
            const isOpen = open === l.id
            return (
              <section key={l.id} className="overflow-hidden rounded-[20px] border border-line bg-surface">
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : l.id)} className="flex w-full items-center gap-3 p-3.5 text-left">
                  <IconTile icon={d === l.items.length ? I.Check : Icon} color={d === l.items.length ? "green" : color} size={40} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[14.5px] leading-tight font-bold">{l.title}</span>
                    <span className="text-[12px] leading-snug text-mute">{l.sub}</span>
                  </span>
                  <span className="tnum font-mono text-[12px] font-semibold text-mute">{d}/{l.items.length}</span>
                  <I.ChevronDown size={18} className={cn("text-mute transition-transform", isOpen && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.ul initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden border-t border-line px-3.5">
                      {l.items.map((it) => (
                        <li key={it.id}>
                          <label className="flex min-h-11 cursor-pointer items-start gap-3 border-b border-line py-2.5 text-[13.5px] leading-snug last:border-0">
                            <input
                              type="checkbox"
                              checked={!!p.kit[it.id]}
                              onChange={(e) => {
                                p.tickKit(it.id, e.target.checked)
                                if (e.target.checked && l.items.every((x) => x.id === it.id || p.kit[x.id])) pop(e.target, true)
                              }}
                              className="mt-0.5 size-[18px] shrink-0 accent-[var(--sea)]"
                            />
                            <span className="flex flex-col gap-0.5">
                              <span className={cn(p.kit[it.id] && "text-mute line-through")}>{it.text}</span>
                              {it.ref && <span className="font-mono text-[10.5px] text-mute">{it.ref}</span>}
                            </span>
                          </label>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </section>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={copy} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-[13.5px] font-semibold">
            {copied ? <><I.Check size={15} /> Copied</> : <><I.FileText size={15} /> Copy the checklist</>}
          </button>
          {confirm ? (
            <button type="button" onClick={() => { p.resetKit(); setConfirm(false) }} className="h-11 rounded-xl bg-signal text-[13.5px] font-semibold text-white">Yes, untick everything</button>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} disabled={!doneAll} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-[13.5px] font-semibold disabled:opacity-50"><I.Refresh size={15} /> Start fresh</button>
          )}
        </div>
        {confirm && <p className="-mt-1 text-center text-[12px] text-mute">Unticks all {doneAll} items for the next inspection. XP you've earned stays.</p>}
        <p className="text-center text-[11.5px] leading-snug text-mute">From a ship manager's pre-inspection notes, generalised. Your own SMS and the current rules come first.</p>
      </Scroll>
    </>
  )
}

/* =====================================================================
   Progress / badges
   ===================================================================== */
export function MeScreen({ go, rank, ship, setProfile, night, setNight }: { go: (s: AppScreen) => void; rank: string; ship: string; setProfile: (p: { rank: string; ship: string }) => void; night: boolean; setNight: (v: boolean) => void }) {
  const p = useProgress()
  const w = useWallet()
  const [howOpen, setHowOpen] = useState(false)
  const acc = p.stats.cards ? Math.round((p.stats.knew / p.stats.cards) * 100) : 0
  const sacc = p.stats.spot ? Math.round((p.stats.spotRight / p.stats.spot) * 100) : 0
  const ready = p.readiness(rank)
  const tested = ready.filter((r) => r.score != null)
  const overall = tested.length ? Math.round(tested.reduce((n, r) => n + (r.score as number), 0) / tested.length) : null
  const hist = p.interviews.slice(0, 5)
  const nextReward = p.level.next ? EARN.level[p.level.n + 1] ?? 0 : 0
  return (
    <>
      <TopBar title="Your progress" onBack={() => go("today")} />
      <Scroll className="gap-4">
        <section className="glass-deep flex flex-col gap-4 rounded-[24px] p-5">
          <div className="flex items-center gap-4">
            <LevelRing size={78} stroke={6} dark />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[12px] font-semibold tracking-[0.06em] text-white/60 uppercase">Level {p.level.n} of {LEVELS.length}</span>
              <span className="display text-[24px] leading-tight font-bold text-white">{p.level.name}</span>
              <span className="tnum text-[13px] text-white/70">{p.xp.toLocaleString("en-IN")} XP{p.level.next ? ` · ${p.level.toNext.toLocaleString("en-IN")} to ${p.level.next.name} (+${nextReward} credits)` : " · top level"}</span>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[["Streak", `${p.live.n}`, I.Flame], ["Best", `${p.streak.best}`, I.Trophy], ["Freezes", `${p.streak.freezes}/${p.freezeCap}`, I.Snow]].map(([l, v, Icon]) => {
              const Ic = Icon as Ico
              return (
                <span key={l as string} className="flex flex-col gap-1 rounded-xl bg-white/[0.08] px-3 py-2.5">
                  <Ic size={16} className="text-[#ffb547]" />
                  <span className="tnum display text-[20px] leading-none font-bold text-white">{v as string}</span>
                  <span className="text-[11.5px] text-white/60">{l as string}</span>
                </span>
              )
            })}
          </div>
          <p className="text-[12px] leading-snug text-white/65">
            {p.live.state === "lost" ? "Your streak ended. One activity today starts a new one. " : p.live.state === "freeze" ? "You missed yesterday. Train today and a freeze keeps your streak. " : ""}
            A 7-day streak earns a freeze and multiplies your XP ×{streakMultiplier(7)}; 30 days makes it ×{streakMultiplier(30)}. Streaks of 7, 30 and 100 days pay {EARN.streak[7]}, {EARN.streak[30]} and {EARN.streak[100]} credits.
          </p>
          {p.streak.freezes < p.freezeCap && (
            <button type="button" onClick={() => p.buyFreeze()} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-white/[0.12] text-[13px] font-semibold text-white hover:bg-white/[0.18]">
              <I.Snow size={15} /> Buy a streak freeze <CostTag cost={COSTS.freeze} className="text-white/80" />
            </button>
          )}
        </section>

        <section className="glass flex flex-col gap-3 rounded-[22px] p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-bold">Readiness by topic</h3>
            <span className="text-[11.5px] text-mute">{overall != null ? `Overall ${overall}%` : "From your cards, Spot answers and interviews"}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {ready
              .slice()
              .sort((a, b) => (a.score ?? 101) - (b.score ?? 101))
              .map((r) => (
                <li key={r.topic} className="flex items-center gap-2.5">
                  <TopicBadge topic={r.topic} size={28} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="truncate font-semibold">{r.topic}</span>
                      <span className="tnum shrink-0 font-mono text-[11.5px] text-mute">{r.score != null ? `${r.score}%` : "not tested yet"}</span>
                    </span>
                    <span className="h-1.5 rounded-full bg-surface-2">
                      {r.score != null && <span className="block h-1.5 rounded-full" style={{ width: `${Math.max(4, r.score)}%`, background: r.score >= 75 ? "var(--sea)" : r.score >= 50 ? "#e08a00" : "var(--signal)" }} />}
                    </span>
                  </span>
                </li>
              ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => go("session")} className="h-10 rounded-xl border border-line bg-surface text-[13px] font-semibold">Practise cards</button>
            <button type="button" onClick={() => go("practice")} className="h-10 rounded-xl bg-primary text-[13px] font-semibold text-on-primary">Rehearse with AI</button>
          </div>
        </section>

        {hist.length > 0 && (
          <section className="flex flex-col gap-2.5 rounded-[22px] border border-line bg-surface p-4">
            <h3 className="text-[15px] font-bold">AI inspector history</h3>
            {hist.map((r) => (
              <div key={r.at} className="flex items-center gap-3 text-[13px]">
                <span className={cn("tnum flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-bold", r.avg >= 8 ? "bg-sea-soft text-sea" : r.avg >= 5 ? "bg-amber-soft text-amber-ink" : "bg-signal-soft text-signal-ink")}>{r.avg}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{new Date(r.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {RANK_NAMES[r.rank] || r.rank} · {r.n} answers{r.voice ? " · voice" : ""}</span>
                  <span className="truncate text-[12px] text-mute">{[...new Set(r.items.map((x) => x[0]))].slice(0, 3).join(", ")}</span>
                </span>
              </div>
            ))}
          </section>
        )}

        <section className="flex flex-col gap-2.5 rounded-[22px] border border-line bg-surface p-4">
          <h3 className="text-[15px] font-bold">Your activity</h3>
          <Heatmap />
        </section>

        <div className="grid grid-cols-2 gap-2.5">
          {[["Cards reviewed", p.stats.cards, `${acc}% known`, I.Layers, "blue"], ["Spot answers", p.stats.spot, `${sacc}% right`, I.Target, "orange"], ["Stories read", p.stats.stories, `of ${STORIES.length}`, I.Newspaper, "violet"], ["Interviews", p.stats.interviews, "with the AI inspector", I.Mic, "indigo"]].map(([l, v, s, Icon, c]) => (
            <span key={l as string} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
              <IconTile icon={Icon as Ico} color={c as TileColor} size={38} />
              <span className="flex flex-col">
                <span className="tnum display text-[20px] leading-none font-bold">{v as number}</span>
                <span className="text-[11.5px] leading-snug text-mute">{l as string} · {s as string}</span>
              </span>
            </span>
          ))}
        </div>

        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[15px] font-bold">Badges</h3>
            <span className="tnum font-mono text-[11px] text-mute">{Object.keys(p.badges).length} of {BADGES.length} · +{EARN.badge} credits each</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BADGES.map((b) => {
              const on = !!p.badges[b.id]
              return (
                <span key={b.id} className={cn("flex items-center gap-2.5 rounded-2xl border border-line bg-surface p-3", !on && "opacity-60")}>
                  {on ? <IconTile icon={ICON[b.icon]} color="amber" size={36} /> : <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-surface-2 text-mute"><I.Lock size={15} /></span>}
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[13px] leading-tight font-bold">{b.name}</span>
                    <span className="text-[11px] leading-snug text-mute">{b.sub}</span>
                  </span>
                </span>
              )
            })}
          </div>
        </section>

        <section className="flex flex-col rounded-[22px] border border-line bg-surface">
          <button type="button" aria-expanded={howOpen} onClick={() => setHowOpen((v) => !v)} className="flex items-center justify-between gap-2 p-4 text-left">
            <span className="flex flex-col">
              <span className="text-[15px] font-bold">How XP and credits work</span>
              <span className="text-[12.5px] text-mute">XP is your rank and never goes down. Credits are what you spend.</span>
            </span>
            <I.ChevronDown size={18} className={cn("shrink-0 text-mute transition-transform", howOpen && "rotate-180")} />
          </button>
          {howOpen && (
            <div className="flex flex-col gap-3 border-t border-line p-4 text-[13px] leading-snug">
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {[
                  [`+${XP.cardKnew}`, "a due or new card you knew"],
                  [`+${XP.cardAgain}`, "a due card you're still learning"],
                  [`+${XP.cardExtra}`, "extra practice on a card that isn't due"],
                  [`+${XP.spotRight}–${XP.spotRight + 5 * XP.combo}`, "a right answer in Spot (more for a streak of right answers)"],
                  [`+${XP.story}`, "the first time you read a story"],
                  [`+2–${10 * XP.interviewPerPoint}`, "an AI inspector answer (score × 3)"],
                  [`+${XP.ask}`, `an AI answer or close-out (up to ${AI_XP_CAP} a day)`],
                  [`+${XP.mission} / +${XP.chest}`, "each daily mission / the chest"],
                ].map(([v, l]) => (
                  <li key={l} className="flex gap-2"><span className="tnum w-16 shrink-0 font-mono font-semibold text-primary">{v}</span>{l}</li>
                ))}
              </ul>
              <div className="flex flex-col gap-1">
                <span className="font-semibold">Levels and their credit rewards</span>
                <div className="flex flex-wrap gap-1.5">
                  {LEVELS.slice(1).map((l) => (
                    <span key={l.n} className={cn("rounded-full border px-2 py-0.5 text-[11.5px]", p.level.n >= l.n ? "border-sea/50 bg-sea-soft text-sea" : "border-line text-mute")}>
                      {l.n}. {l.name} · {l.xp.toLocaleString("en-IN")} XP · +{EARN.level[l.n]}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-[22px] border border-line bg-surface p-4">
          <h3 className="flex items-center gap-2 text-[15px] font-bold"><I.Settings size={17} /> Settings</h3>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-mute">Your rank</span>
            <div className="flex flex-wrap gap-1.5">
              {RANKS.map((r) => <Chip key={r} size="sm" on={rank === r} onClick={() => setProfile({ rank: r, ship })}>{RANK_NAMES[r] || r}</Chip>)}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-mute">Ship type</span>
            <div className="flex flex-wrap gap-1.5">
              {SHIP_TYPES.map((s) => <Chip key={s} size="sm" on={ship === s} onClick={() => setProfile({ rank, ship: s })}>{s} tanker</Chip>)}
            </div>
          </div>
          <button type="button" aria-pressed={night} onClick={() => setNight(!night)} className={cn("flex h-11 items-center justify-between rounded-xl border px-3 text-[13.5px] font-semibold", night ? "border-signal bg-signal-soft text-signal" : "border-line")}>
            <span className="flex items-center gap-2"><I.Moon size={16} /> Night-watch mode</span>
            <span className="text-[12px] font-normal">{night ? "On" : "Off"}</span>
          </button>
          <button type="button" onClick={() => go("wallet")} className="flex h-11 items-center justify-between rounded-xl border border-line px-3 text-[13.5px] font-semibold">
            <span className="flex items-center gap-2"><I.Wallet size={16} /> Plans & credits</span>
            <span className="text-[12px] font-normal text-mute">{w.plan.name} · {w.balance} credits</span>
          </button>
        </section>
        <button type="button" onClick={() => go("session")} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-on-primary"><I.Play size={16} /> Earn XP: start 10 cards</button>
      </Scroll>
    </>
  )
}
