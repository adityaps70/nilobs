// The live side of NilObs: the industry feed, today's drill and its reminder, the inspection pulse and the weekly
// league. Everything here comes from nilobs.com's server (worker/feed.js, push.js, pulse.js, league.js) and keeps
// itself fresh while it's on screen; a saved copy of the feed covers a ship with no signal.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { motion } from "motion/react"
import * as I from "@/components/icons"
import { cn } from "@/lib/utils"
import { Chip, Scroll, Section, TopBar } from "@/components/ui"
import { IconTile, TopicBadge, type TileColor } from "@/components/topicIcons"
import { UNAUTHORIZED_EVENT, useAuth } from "@/auth"
import { useProgress } from "@/progress"
import { roleOf } from "@/roles"
import type { Brief, Topic } from "@/data"
import type { AppScreen } from "@/nav"
import { SpotGame } from "@/components/AppPlus"
import { SignInScreen } from "@/app/AppGate"

type Ico = (p: { size?: number; className?: string }) => ReactNode

/* ---------------- talking to the server ---------------- */
type Res<T> = { ok: boolean; status: number; data: T | null }
async function api<T>(path: string, body?: unknown): Promise<Res<T>> {
  try {
    const res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    })
    const data = (await res.json().catch(() => null)) as T | null
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}
const ls = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(k)
      return v == null ? d : (JSON.parse(v) as T)
    } catch {
      return d
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v))
    } catch {
      /* not saved */
    }
  },
}
/** Run `f` now, every `ms` while the page is visible, and whenever it comes back to the front. */
function usePoll(f: () => void, ms: number) {
  const ref = useRef(f)
  ref.current = f
  useEffect(() => {
    ref.current()
    const t = setInterval(() => document.visibilityState === "visible" && ref.current(), ms)
    const vis = () => document.visibilityState === "visible" && ref.current()
    document.addEventListener("visibilitychange", vis)
    return () => {
      clearInterval(t)
      document.removeEventListener("visibilitychange", vis)
    }
  }, [ms])
}
export function ago(t: number) {
  const m = (Date.now() - t) / 60000
  if (m < 2) return "just now"
  if (m < 60) return `${Math.round(m)} min ago`
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`
  const d = Math.floor(m / 1440)
  return d === 1 ? "yesterday" : `${d} days ago`
}
export type Side = "deck" | "engine" | "ratings" | "shore" | "other"
export function sideOf(rank: string): Side {
  if (rank === "Other") return "other"
  const r = roleOf(rank)
  if (r.group === "deck") return "deck"
  if (r.group === "cadet") return /deck/i.test(r.name) ? "deck" : "engine"
  if (r.group === "engine") return "engine"
  if (r.group === "rating" || r.group === "catering") return "ratings"
  if (r.group === "shore") return "shore"
  return "other"
}

/* ---------------- the industry feed ---------------- */
export interface FeedItem {
  id: string
  source: string
  sourceName: string
  official: boolean
  url: string
  title: string
  publishedAt: number
  kind: string
  takeaway: string
  check: string
  roles: string[]
  topics: Topic[]
}
const FEED_CACHE = "sr.feedCache"
const FEED_SEEN = "sr.feedSeen"
type FeedState = { items: FeedItem[]; at: number; updatedAt: number; loading: boolean; failed: boolean }
let feed: FeedState = { ...ls.get(FEED_CACHE, { items: [] as FeedItem[], at: 0, updatedAt: 0 }), loading: false, failed: false }
const feedListeners = new Set<() => void>()
const emit = () => feedListeners.forEach((f) => f())
async function refreshFeed(force = false) {
  if (feed.loading || (!force && Date.now() - feed.at < 4 * 60000)) return
  feed = { ...feed, loading: true }
  emit()
  const r = await api<{ items: FeedItem[]; updatedAt: number; pending?: number }>(`/api/feed?limit=40&r=${Math.floor(Date.now() / 30000)}`)
  if (r.ok && r.data && Array.isArray(r.data.items)) {
    feed = { items: r.data.items, at: Date.now(), updatedAt: r.data.updatedAt || 0, loading: false, failed: false }
    ls.set(FEED_CACHE, { items: feed.items, at: feed.at, updatedAt: feed.updatedAt })
    // new items are being read by the AI right now: look again shortly
    if (r.data.pending && !pendingRetry) {
      pendingRetry = true
      setTimeout(() => {
        pendingRetry = false
        refreshFeed(true)
      }, 35000)
    }
  } else feed = { ...feed, loading: false, failed: true }
  emit()
}
let pendingRetry = false
export function useFeed() {
  const [, tick] = useState(0)
  useEffect(() => {
    const f = () => tick((n) => n + 1)
    feedListeners.add(f)
    return () => {
      feedListeners.delete(f)
    }
  }, [])
  usePoll(() => refreshFeed(), 5 * 60000)
  return feed
}
const forSide = (it: FeedItem, side: Side) => side === "other" || !it.roles.length || it.roles.includes(side)
const seenAt = () => ls.get<number>(FEED_SEEN, 0)

const KIND: Record<string, { label: string; icon: Ico; color: TileColor }> = {
  detention: { label: "Port state control", icon: I.Shield, color: "rose" },
  alert: { label: "Safety alert", icon: I.Alert, color: "orange" },
  accident: { label: "Accident report", icon: I.LifeBuoy, color: "amber" },
  rule: { label: "Rules & guidance", icon: I.FileText, color: "sky" },
  sire: { label: "SIRE & vetting", icon: I.ListCheck, color: "violet" },
  industry: { label: "Industry", icon: I.Ship, color: "teal" },
}
const kindOf = (k: string) => KIND[k] || KIND.industry

function FeedCard({ it, fresh, onTopic, onAsk }: { it: FeedItem; fresh?: boolean; onTopic?: (t: Topic) => void; onAsk?: (q: string) => void }) {
  const k = kindOf(it.kind)
  return (
    <article className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-mute">
        <IconTile icon={k.icon} color={k.color} size={26} />
        <span className="font-semibold text-ink">{k.label}</span>
        <span aria-hidden="true">·</span>
        <span>{it.sourceName}{it.official ? " (official)" : ""}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={new Date(it.publishedAt).toISOString()}>{ago(it.publishedAt)}</time>
        {fresh && <span className="rounded-full bg-signal px-2 py-0.5 text-[10.5px] font-bold text-white">New</span>}
      </div>
      <h3 className="text-[15.5px] leading-snug font-bold">{it.title}</h3>
      {it.takeaway && <p className="text-[13.5px] leading-relaxed">{it.takeaway}</p>}
      {it.check && (
        <div className="flex gap-2 rounded-xl bg-sea-soft px-3 py-2.5 text-[13px] leading-snug text-sea">
          <I.Check size={16} className="mt-px shrink-0" />
          <span><b>Check on board:</b> {it.check}</span>
        </div>
      )}
      {!!it.topics.length && onTopic && (
        <div className="flex flex-wrap gap-1.5">
          {it.topics.map((t) => (
            <button key={t} type="button" onClick={() => onTopic(t)} className="flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface pr-2.5 pl-1 text-[12px] font-medium hover:border-mute">
              <TopicBadge topic={t} size={22} /> {t}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold">
        <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-primary">Read at {it.sourceName} ↗</a>
        {onAsk && <button type="button" onClick={() => onAsk(`What does this mean for my next inspection, and what should I check? "${it.title}"`)} className="text-primary">Ask NilObs about it</button>}
      </div>
    </article>
  )
}

export function LiveScreen({ rank, openTopic, openAsk }: { rank: string; openTopic: (t: Topic) => void; openAsk: (q: string) => void }) {
  const f = useFeed()
  const side = sideOf(rank)
  const [tab, setTab] = useState<"mine" | "all">("mine")
  const [kind, setKind] = useState<string>("")
  const seen = useRef(seenAt()).current
  useEffect(() => {
    const t = setTimeout(() => ls.set(FEED_SEEN, Date.now()), 1500)
    return () => clearTimeout(t)
  }, [])
  const list = f.items.filter((it) => (tab === "all" || forSide(it, side)) && (!kind || it.kind === kind))
  const kinds = [...new Set(f.items.map((i) => i.kind))].filter((k) => KIND[k])
  return (
    <>
      <TopBar title="Live updates" right={<button type="button" aria-label="Refresh" onClick={() => refreshFeed(true)} className="flex size-10 items-center justify-center rounded-xl hover:bg-surface-2"><I.Refresh size={18} className={f.loading ? "animate-spin" : ""} /></button>} />
      <Scroll className="gap-3">
        <p className="text-[13px] leading-snug text-mute">
          Official accident reports and guidance, port state control and maritime news, read by NilObs's AI for {side === "other" ? "you" : `a ${roleOf(rank).name}`}. Checked every few hours{f.updatedAt ? `, last ${ago(f.updatedAt)}` : ""}. Always read the source before acting on it.
        </p>
        <div className="flex gap-1.5">
          <Chip size="sm" on={tab === "mine"} onClick={() => setTab("mine")}>For you</Chip>
          <Chip size="sm" on={tab === "all"} onClick={() => setTab("all")}>Everything</Chip>
        </div>
        {kinds.length > 1 && (
          <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5">
            <Chip size="sm" on={!kind} onClick={() => setKind("")}>All kinds</Chip>
            {kinds.map((k) => <Chip key={k} size="sm" on={kind === k} onClick={() => setKind(k)}>{KIND[k].label}</Chip>)}
          </div>
        )}
        {list.map((it) => <FeedCard key={it.id} it={it} fresh={it.publishedAt > seen && seen > 0} onTopic={openTopic} onAsk={openAsk} />)}
        {!list.length && (
          <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-line px-4 py-10 text-center">
            <IconTile icon={I.Antenna} color="teal" size={46} />
            <span className="text-[15px] font-bold">{f.loading ? "Checking for updates…" : f.failed && !f.items.length ? "No signal for updates right now" : "Nothing new for you yet"}</span>
            <span className="max-w-[34ch] text-[13px] text-mute">{f.failed && !f.items.length ? "Your flashcards, Spot and the ready kit still work offline." : "New reports and alerts are checked every few hours. Try Everything to see all of them."}</span>
          </div>
        )}
      </Scroll>
    </>
  )
}

/** Today: the newest updates for this role. */
export function LiveCard({ rank, go }: { rank: string; go: (s: AppScreen) => void }) {
  const f = useFeed()
  const side = sideOf(rank)
  const seen = seenAt()
  const mine = f.items.filter((it) => forSide(it, side))
  const fresh = mine.filter((it) => it.publishedAt > seen).length
  if (!mine.length) return null
  return (
    <section aria-label="Live updates" className="flex flex-col gap-2.5 rounded-[22px] border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[15px] font-bold">
          <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-60" /><span className="relative inline-flex size-2.5 rounded-full bg-signal" /></span>
          Live from the industry
        </span>
        {fresh > 0 && seen > 0 && <span className="rounded-full bg-signal px-2 py-0.5 text-[11px] font-bold text-white">{fresh} new</span>}
      </div>
      {mine.slice(0, 2).map((it) => {
        const k = kindOf(it.kind)
        return (
          <button key={it.id} type="button" onClick={() => go("live")} className="flex items-start gap-3 rounded-2xl p-1.5 text-left hover:bg-surface-2">
            <IconTile icon={k.icon} color={k.color} size={34} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13.5px] leading-snug font-semibold">{it.title}</span>
              <span className="line-clamp-2 text-[12.5px] leading-snug text-mute">{it.check || it.takeaway}</span>
              <span className="text-[11.5px] text-mute">{k.label} · {it.sourceName} · {ago(it.publishedAt)}</span>
            </span>
          </button>
        )
      })}
      <button type="button" onClick={() => go("live")} className="self-start text-[13px] font-semibold text-primary">All live updates →</button>
    </section>
  )
}

/** The home page: a taste of the feed for visitors (public). */
export function LiveTeaser({ onOpen }: { onOpen: () => void }) {
  const f = useFeed()
  const items = f.items.slice(0, 3)
  if (!items.length) return null
  return (
    <section aria-labelledby="live-teaser" className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-5 py-12">
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2 text-[12.5px] font-semibold tracking-wide text-signal-ink uppercase">
          <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-60" /><span className="relative inline-flex size-2.5 rounded-full bg-signal" /></span>
          Live
        </span>
        <h2 id="live-teaser" className="display text-[28px] leading-tight font-bold">What changed this week, and what to check on board</h2>
        <p className="max-w-[60ch] text-[14.5px] text-mute">Accident reports, port state control and safety alerts, read every few hours and turned into one thing to check, for your role.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {items.map((it) => <FeedCard key={it.id} it={it} />)}
      </div>
      <button type="button" onClick={onOpen} className="self-start rounded-full bg-primary px-5 py-3 text-[14.5px] font-semibold text-on-primary">Get updates for your role →</button>
    </section>
  )
}

/* ---------------- today's drill ---------------- */
type Card = ReturnType<ReturnType<typeof useProgress>["session"]>["cards"][number]
function drillFocus(prog: ReturnType<typeof useProgress>, rank: string, brief: Brief | null, briefDate: string): { topics: Topic[]; why: string } {
  const date = briefDate ? Date.parse(briefDate + "T00:00:00") : NaN
  const days = Number.isFinite(date) ? Math.ceil((date - Date.now()) / 86400000) : null
  if (brief && days != null && days >= 0 && days <= 21) {
    const topics = brief.focus.slice(0, 3).map((f) => f.topic)
    return { topics, why: days === 0 ? "Inspection today: your brief's focus topics" : `Inspection in ${days} day${days === 1 ? "" : "s"}: your brief's focus topics` }
  }
  const tested = prog.readiness(rank).filter((r) => r.score != null).sort((a, b) => (a.score as number) - (b.score as number))
  if (tested.length) return { topics: tested.slice(0, 2).map((r) => r.topic), why: `Your weakest topics: ${tested.slice(0, 2).map((r) => r.topic).join(" and ")}` }
  return { topics: [], why: "A mix of what inspectors ask your rank most" }
}
function pickCards(prog: ReturnType<typeof useProgress>, rank: string, topics: Topic[]): Card[] {
  const pool = prog.session("trending", rank, 40).cards
  const pref = pool.filter((c) => topics.includes(c.p))
  return [...pref, ...pool.filter((c) => !topics.includes(c.p))].slice(0, 3)
}

export function DrillCard({ rank, go, brief, briefDate }: { rank: string; go: (s: AppScreen) => void; brief: Brief | null; briefDate: string }) {
  const prog = useProgress()
  const focus = drillFocus(prog, rank, brief, briefDate)
  if (prog.drillDoneToday)
    return (
      <section aria-label="Today's drill" className="flex items-center gap-3 rounded-[22px] border border-line bg-surface p-4">
        <IconTile icon={I.Check} color="green" size={42} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-bold">Today's drill is done</span>
          <span className="text-[12.5px] text-mute">{prog.live.n > 1 ? `${prog.live.n}-day streak. ` : ""}A new one is ready tomorrow.</span>
        </span>
        <button type="button" onClick={() => go("league")} className="text-[13px] font-semibold text-primary">League →</button>
      </section>
    )
  return (
    <button type="button" onClick={() => go("daily")} className="flex items-center gap-4 rounded-[22px] bg-hero p-4 text-left text-hero-ink">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[12px] font-semibold text-hero-muted">Today's drill · 5 minutes</span>
        <span className="display text-[19px] leading-tight font-bold">3 cards, 2 spot rounds, 1 live update</span>
        <span className="text-[13px] text-hero-muted">{focus.why}</span>
      </span>
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/15"><I.Play size={20} /></span>
    </button>
  )
}

export function DailyDrill({ rank, go, brief, briefDate, openTopic }: { rank: string; go: (s: AppScreen) => void; brief: Brief | null; briefDate: string; openTopic: (t: Topic) => void }) {
  const prog = useProgress()
  const f = useFeed()
  const focus = useMemo(() => drillFocus(prog, rank, brief, briefDate), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [cards] = useState(() => pickCards(prog, rank, focus.topics))
  const live = useMemo(() => f.items.find((it) => forSide(it, sideOf(rank)) && it.check) || null, [f.items, rank])
  const steps = ["cards", "spot", ...(live ? ["live"] : []), "done"] as const
  const [step, setStep] = useState(0)
  const [ci, setCi] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [xp, setXp] = useState(0)
  const doneRef = useRef<HTMLDivElement>(null)
  const name = steps[Math.min(step, steps.length - 1)]
  const next = () => setStep((s) => s + 1)
  useEffect(() => {
    if (name !== "done") return
    const t = setTimeout(() => setXp((x) => x + prog.finishDrill(doneRef.current)), 300)
    return () => clearTimeout(t)
  }, [name]) // eslint-disable-line react-hooks/exhaustive-deps
  const answer = (ok: boolean) => {
    const c = cards[ci]
    if (!c) return
    setXp((x) => x + prog.reviewCard(c.i, ok))
    setFlipped(false)
    if (ci + 1 >= cards.length) next()
    else setCi(ci + 1)
  }
  useEffect(() => {
    if (!cards.length && name === "cards") next() // no cards left to show today: straight to Spot
  }, [cards.length, name])
  const card = cards[ci]
  return (
    <>
      <TopBar title="Today's drill" onBack={() => go("today")} />
      <Scroll className="gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="flex gap-1" aria-label={`Step ${Math.min(step + 1, steps.length)} of ${steps.length}`}>
            {steps.map((s, j) => <span key={s} className={cn("h-1.5 flex-1 rounded-full", j < step ? "bg-primary" : j === step ? "bg-signal" : "bg-surface-2")} />)}
          </span>
          <span className="text-[12.5px] text-mute">{focus.why}</span>
        </div>

        {name === "cards" && card && (
          <motion.div key={card.i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
            <span className="text-[13px] font-semibold text-mute">Card {ci + 1} of {cards.length} · {card.p}</span>
            <button type="button" onClick={() => setFlipped((v) => !v)} className="glass flex min-h-[200px] flex-col gap-3 rounded-[24px] p-5 text-left">
              <span className="text-[17px] leading-snug font-semibold">{card.q}</span>
              {flipped ? <span className="text-[14.5px] leading-relaxed text-mute">{card.a}</span> : <span className="mt-auto text-[13px] font-semibold text-primary">Tap to see the answer</span>}
            </button>
            {flipped && (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => answer(false)} className="h-12 rounded-2xl border border-line bg-surface text-[14.5px] font-semibold">Not yet</button>
                <button type="button" onClick={() => answer(true)} className="h-12 rounded-2xl bg-primary text-[14.5px] font-semibold text-on-primary">Knew it</button>
              </div>
            )}
          </motion.div>
        )}

        {name === "spot" && (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-mute">Spot the observation · 2 rounds</span>
            <SpotGame rounds={2} onExit={next} />
          </div>
        )}

        {name === "live" && live && (
          <div className="flex flex-col gap-3">
            <span className="text-[13px] font-semibold text-mute">One live update for your role</span>
            <FeedCard it={live} onTopic={openTopic} />
            <button type="button" onClick={next} className="h-12 rounded-2xl bg-primary text-[14.5px] font-semibold text-on-primary">I'll check it on board</button>
          </div>
        )}

        {name === "done" && (
          <div className="flex flex-col items-center gap-4 pt-2 text-center">
            <div ref={doneRef}><IconTile icon={I.Trophy} color="amber" size={80} /></div>
            <h2 className="display text-[27px] leading-tight font-bold">Drill done</h2>
            <p className="max-w-[34ch] text-[14.5px] text-mute">+{xp} XP today. {prog.live.n > 1 ? `That's a ${prog.live.n}-day streak.` : "Come back tomorrow to start a streak."} A new drill is ready tomorrow.</p>
            <ReminderCard compact />
            <div className="grid w-full grid-cols-2 gap-2">
              <button type="button" onClick={() => go("league")} className="h-12 rounded-2xl border border-line bg-surface text-[14px] font-semibold">Weekly league</button>
              <button type="button" onClick={() => go("today")} className="h-12 rounded-2xl bg-primary text-[14px] font-semibold text-on-primary">Back to Today</button>
            </div>
          </div>
        )}
      </Scroll>
    </>
  )
}

/* ---------------- reminders ---------------- */
const REMINDER = "sr.reminder"
const canPush = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
const onIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const installed = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true
const keyBytes = (b64: string) => {
  const s = b64.replace(/-/g, "+").replace(/_/g, "/")
  return Uint8Array.from(atob(s + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0))
}
const hourLabel = (h: number) => new Date(2020, 0, 1, h).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

export function ReminderCard({ compact }: { compact?: boolean }) {
  const auth = useAuth()
  const saved = ls.get<{ on: boolean; hour: number }>(REMINDER, { on: false, hour: 19 })
  const [on, setOn] = useState(saved.on)
  const [hour, setHour] = useState(saved.hour)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const supported = canPush()
  useEffect(() => {
    // a browser that lost its subscription (cleared data, another device) shows as off
    if (!supported || !saved.on) return
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((s) => !s && setOn(false)).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (auth.status !== "in") return null
  const subscribe = async (h: number) => {
    const reg = await navigator.serviceWorker.ready
    const k = await api<{ publicKey: string }>("/api/push/key")
    if (!k.ok || !k.data?.publicKey) throw new Error("no key")
    let sub = await reg.pushManager.getSubscription()
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k.data.publicKey) })
    const r = await api<{ error?: string }>("/api/push/subscribe", { endpoint: sub.endpoint, hour: h, tz: -new Date().getTimezoneOffset() })
    if (!r.ok) throw new Error(r.data?.error || "Couldn't turn reminders on.")
  }
  const turnOn = async (h = hour) => {
    setBusy(true)
    setMsg("")
    try {
      const perm = await Notification.requestPermission()
      if (perm !== "granted") {
        setMsg(perm === "denied" ? "Notifications are blocked for nilobs.com. Allow them in your browser's site settings, then try again." : "No problem. Turn them on any time.")
        return
      }
      await subscribe(h)
      setOn(true)
      ls.set(REMINDER, { on: true, hour: h })
      setMsg(`Done. Your drill reminder comes at ${hourLabel(h)} every day.`)
    } catch (e) {
      setMsg((e as Error).message && (e as Error).message !== "no key" ? (e as Error).message : "This browser couldn't turn on reminders.")
    } finally {
      setBusy(false)
    }
  }
  const turnOff = async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await api("/api/push/unsubscribe", { endpoint: sub.endpoint })
        await sub.unsubscribe().catch(() => {})
      }
    } catch {
      /* already off */
    }
    setOn(false)
    ls.set(REMINDER, { on: false, hour })
    setMsg("Reminders are off.")
    setBusy(false)
  }
  const changeHour = async (h: number) => {
    setHour(h)
    ls.set(REMINDER, { on, hour: h })
    if (on) {
      setBusy(true)
      try {
        await subscribe(h)
        setMsg(`Reminder moved to ${hourLabel(h)}.`)
      } catch {
        setMsg("Couldn't move the reminder. Try again.")
      }
      setBusy(false)
    }
  }
  const test = async () => {
    const r = await api<{ sent?: number; error?: string }>("/api/push/test", {})
    setMsg(r.ok && r.data?.sent ? "Sent. It should arrive in a few seconds." : r.data?.error || "Couldn't send a test.")
  }
  return (
    <section aria-label="Daily reminder" className={cn("flex w-full flex-col gap-2.5 rounded-[20px] border border-line bg-surface p-4 text-left", compact && "max-w-[420px]")}>
      <div className="flex items-center gap-3">
        <IconTile icon={I.Bell} color="violet" size={38} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[14.5px] font-bold">Daily drill reminder</span>
          <span className="text-[12.5px] text-mute">One notification a day at the time you pick. Off any time.</span>
        </span>
      </div>
      {!supported ? (
        <p className="text-[12.5px] text-mute">This browser can't show reminders. Try Chrome, Edge, Firefox or Safari.</p>
      ) : onIos() && !installed() ? (
        <p className="text-[12.5px] leading-snug text-mute">On iPhone and iPad: tap Share, then <b>Add to Home Screen</b>, open NilObs from there, and turn reminders on.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[13px] font-semibold">
            Time
            <select aria-label="Reminder time" value={hour} disabled={busy} onChange={(e) => changeHour(Number(e.target.value))} className="h-10 rounded-xl border border-line bg-surface px-2 text-[13px]">
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </label>
          {on ? (
            <>
              <button type="button" disabled={busy} onClick={test} className="h-10 rounded-xl border border-line px-3 text-[13px] font-semibold">Send a test</button>
              <button type="button" disabled={busy} onClick={turnOff} className="h-10 rounded-xl px-3 text-[13px] font-semibold text-signal-ink">Turn off</button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={() => turnOn()} className="h-10 rounded-xl bg-primary px-4 text-[13px] font-semibold text-on-primary">{busy ? "One moment…" : "Turn on reminders"}</button>
          )}
        </div>
      )}
      {msg && <p role="status" className="text-[12.5px] leading-snug text-mute">{msg}</p>}
    </section>
  )
}

/* ---------------- the inspection pulse ---------------- */
interface PulseItem { id: string; daysAgo: number; ship: string; role: string; region: string; inspection: string; summary: string; questions: string[]; topics: Topic[] }
interface PulseView { items: PulseItem[]; trending: { topic: Topic; n: number }[]; week: number }
let pulseCache: PulseView | null = null
function usePulse() {
  const [v, setV] = useState<PulseView | null>(pulseCache)
  const [failed, setFailed] = useState(false)
  usePoll(async () => {
    const r = await api<PulseView>("/api/pulse")
    if (r.ok && r.data) {
      pulseCache = r.data
      setV(r.data)
      setFailed(false)
    } else setFailed(true)
  }, 2 * 60000)
  return { v, failed }
}
const daysLabel = (n: number) => (n === 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`)

export function PulseScreen({ go, openTopic }: { go: (s: AppScreen) => void; openTopic: (t: Topic) => void }) {
  const { v, failed } = usePulse()
  return (
    <>
      <TopBar title="Inspection pulse" />
      <Scroll className="gap-3">
        <SignInScreen title="Sign in to see the pulse" text="What inspectors asked this month, from debriefs other crews shared with names removed. It's free: sign in to read it and share your own." />
        <p className="text-[13px] leading-snug text-mute">What inspectors asked in the last few weeks, from debriefs NilObs users shared. Names of ships, people, companies and ports are removed before anything appears here.</p>
        {v && v.trending.length > 0 && (
          <Section title="Trending this fortnight" aside={`${v.week} debrief${v.week === 1 ? "" : "s"} this week`}>
            <div className="flex flex-wrap gap-2">
              {v.trending.map((t) => (
                <button key={t.topic} type="button" onClick={() => openTopic(t.topic)} className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface pr-3 pl-1.5 text-[13px] font-medium hover:border-mute">
                  <TopicBadge topic={t.topic} size={26} /> {t.topic} <span className="tnum font-mono text-[11.5px] text-mute">×{t.n}</span>
                </button>
              ))}
            </div>
          </Section>
        )}
        {v?.items.map((d) => (
          <article key={d.id} className="flex flex-col gap-2 rounded-[20px] border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-mute">
              <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold text-ink">{d.inspection}</span>
              <span>{[d.role, d.ship && `${d.ship} tanker`, d.region].filter(Boolean).join(" · ")}</span>
              <span aria-hidden="true">·</span>
              <span>{daysLabel(d.daysAgo)}</span>
            </div>
            {d.summary && <p className="text-[14px] leading-snug font-medium">{d.summary}</p>}
            {!!d.questions.length && (
              <ul className="flex flex-col gap-1 text-[13px] leading-snug">
                {d.questions.map((q, i) => <li key={i} className="flex gap-2"><I.Chat size={14} className="mt-0.5 shrink-0 text-primary" />{q}</li>)}
              </ul>
            )}
            {!!d.topics.length && (
              <div className="flex flex-wrap gap-1.5">
                {d.topics.map((t) => <button key={t} type="button" onClick={() => openTopic(t)} className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium">{t}</button>)}
              </div>
            )}
          </article>
        ))}
        {v && !v.items.length && (
          <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-line px-4 py-10 text-center">
            <IconTile icon={I.Users} color="sky" size={46} />
            <span className="text-[15px] font-bold">Be the first this week</span>
            <span className="max-w-[34ch] text-[13px] text-mute">Had an inspection recently? Share what they asked. It's anonymous and helps the next crew.</span>
          </div>
        )}
        {!v && <p className="py-8 text-center text-[13px] text-mute">{failed ? "Couldn't load the pulse. Check your connection." : "Loading…"}</p>}
        <button type="button" onClick={() => go("share")} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-[14.5px] font-semibold text-on-primary"><I.Plus size={18} /> Share your debrief</button>
      </Scroll>
    </>
  )
}

/** Today: what inspectors are asking, at a glance. */
export function PulseCard({ go }: { go: (s: AppScreen) => void }) {
  const { v } = usePulse()
  if (!v || (!v.items.length && !v.trending.length)) return null
  return (
    <button type="button" onClick={() => go("pulse")} className="flex flex-col gap-2 rounded-[22px] border border-line bg-surface p-4 text-left">
      <span className="flex items-center gap-2 text-[15px] font-bold"><IconTile icon={I.Users} color="sky" size={28} /> Inspection pulse</span>
      <span className="text-[13px] leading-snug text-mute">
        {v.trending.length ? `Inspectors are asking about ${v.trending.slice(0, 3).map((t) => t.topic).join(", ")}.` : "Fresh debriefs from other crews."} {v.week ? `${v.week} new this week.` : ""}
      </span>
      <span className="text-[13px] font-semibold text-primary">See what they asked →</span>
    </button>
  )
}

/* ---------------- weekly leagues ---------------- */
interface LeagueView {
  week: { start: number; end: number }
  group: string
  groups: { id: string; name: string; players: number }[]
  players: number
  top: { pos: number; name: string; role: string; xp: number; you: boolean }[]
  you: { pos: number | null; xp: number; name: string; named: boolean; inGroup: boolean; toNext: number } | null
}
const LEAGUE_KEY = "sr.league"
let leagueCache: Record<string, LeagueView> = {}
function useLeague(group: string) {
  const [v, setV] = useState<LeagueView | null>(leagueCache[group] || null)
  const [failed, setFailed] = useState(false)
  const load = useCallback(async () => {
    const r = await api<LeagueView>(`/api/league${group ? `?group=${encodeURIComponent(group)}` : ""}`)
    if (r.ok && r.data) {
      leagueCache[group] = r.data
      setV(r.data)
      setFailed(false)
    } else setFailed(true)
  }, [group])
  usePoll(load, 60000)
  return { v, failed, reload: load }
}
const endsIn = (end: number) => {
  const h = Math.max(0, Math.round((end - Date.now()) / 3600000))
  return h >= 48 ? `${Math.floor(h / 24)} days left` : h >= 1 ? `${h} h left` : "ends soon"
}

export function LeagueScreen() {
  const auth = useAuth()
  const [group, setGroup] = useState("")
  const { v, failed, reload } = useLeague(group)
  const saved = ls.get<{ show: boolean; name: string }>(LEAGUE_KEY, { show: false, name: "" })
  const [show, setShow] = useState(saved.show)
  const [name, setName] = useState(saved.name || (auth.user?.name || "").split(" ")[0] || "")
  const [note, setNote] = useState("")
  const save = (s: boolean, n: string) => {
    ls.set(LEAGUE_KEY, { show: s, name: n.trim().slice(0, 24) })
    setNote(s ? "Saved. Your name shows on the board within a minute." : "You're anonymous on the board.")
    setTimeout(reload, 6000)
  }
  return (
    <>
      <TopBar title="Weekly league" />
      <Scroll className="gap-3">
        <SignInScreen title="Sign in to join this week's league" text="Weekly XP rankings with people in roles like yours, from Monday to Sunday. Anonymous unless you choose a name. Your guest progress comes with you." />
        {v && (
          <>
            <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5">
              {v.groups.map((g) => <Chip key={g.id} size="sm" on={v.group === g.id} onClick={() => setGroup(g.id)}>{g.name} · {g.players}</Chip>)}
            </div>
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-hero px-4 py-3 text-hero-ink">
              <span className="flex flex-col">
                <span className="text-[12px] text-hero-muted">This week · {endsIn(v.week.end)}</span>
                <span className="display text-[20px] font-bold">
                  {v.you?.inGroup ? (v.you.pos ? `You're #${v.you.pos} of ${v.players}` : "Earn XP to join this week") : v.groups.find((g) => g.id === v.group)?.name}
                </span>
              </span>
              {v.you?.inGroup && <span className="tnum display text-[24px] font-bold">{v.you.xp} XP</span>}
            </div>
            {v.you?.inGroup && v.you.pos && v.you.pos > 1 && <p className="text-[13px] text-mute">{v.you.toNext} XP to pass #{v.you.pos - 1}. A drill is about 60 XP.</p>}
            <ol className="flex flex-col gap-1.5">
              {v.top.map((p) => (
                <li key={p.pos + p.name} className={cn("flex items-center gap-3 rounded-2xl border px-3.5 py-2.5", p.you ? "border-primary bg-primary-soft" : "border-line bg-surface")}>
                  <span className={cn("tnum flex size-8 shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-bold", p.pos === 1 ? "bg-[#ffcf5a] text-[#3a2600]" : p.pos === 2 ? "bg-[#dfe6ef] text-ink" : p.pos === 3 ? "bg-[#f1c3a1] text-[#3d1d06]" : "bg-surface-2")}>{p.pos}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] font-semibold">{p.name}{p.you ? " (you)" : ""}</span>
                    <span className="truncate text-[12px] text-mute">{p.role}</span>
                  </span>
                  <span className="tnum font-mono text-[13px] font-semibold">{p.xp} XP</span>
                </li>
              ))}
            </ol>
            {!v.top.length && <p className="py-6 text-center text-[13px] text-mute">No one has earned XP in this league yet this week. Be the first.</p>}
          </>
        )}
        {!v && <p className="py-8 text-center text-[13px] text-mute">{failed ? "Couldn't load the league. Check your connection." : "Loading…"}</p>}
        <section aria-label="League privacy" className="flex flex-col gap-2 rounded-[20px] border border-line bg-surface p-4">
          <label className="flex items-center justify-between gap-3 text-[14px] font-semibold">
            Show my name on the board
            <input type="checkbox" checked={show} onChange={(e) => { setShow(e.target.checked); save(e.target.checked, name) }} className="size-5 accent-[var(--primary)]" />
          </label>
          {show && (
            <input aria-label="Name on the board" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} onBlur={() => save(true, name)} className="h-11 rounded-xl border border-line bg-surface px-3 text-[14px]" />
          )}
          <span className="text-[12px] text-mute">Off by default: others see your role and a number. Weeks start on Monday.</span>
          {note && <span role="status" className="text-[12px] text-mute">{note}</span>}
        </section>
      </Scroll>
    </>
  )
}

/** Today: your place this week. */
export function LeagueCard({ go }: { go: (s: AppScreen) => void }) {
  const { v } = useLeague("")
  if (!v || !v.you) return null
  return (
    <button type="button" onClick={() => go("league")} className="flex flex-col gap-2 rounded-[22px] border border-line bg-surface p-4 text-left">
      <span className="flex items-center gap-2 text-[15px] font-bold"><IconTile icon={I.Trophy} color="amber" size={28} /> Weekly league</span>
      <span className="text-[13px] leading-snug text-mute">
        {v.you.pos ? `You're #${v.you.pos} of ${v.players} ${v.groups.find((g) => g.id === v.group)?.name.toLowerCase()} this week, with ${v.you.xp} XP.` : `Earn XP this week to join the ${v.groups.find((g) => g.id === v.group)?.name.toLowerCase()} league.`}
        {v.you.pos && v.you.pos > 1 ? ` ${v.you.toNext} XP to pass #${v.you.pos - 1}.` : ""}
      </span>
      <span className="text-[13px] font-semibold text-primary">See the board →</span>
    </button>
  )
}

/* ---------------- sharing a debrief to the pulse ---------------- */
export type PulseShare = { status: "live" | "checking" | "pending" | "rejected" | "error"; message: string }
export async function shareToPulse(text: string): Promise<PulseShare> {
  const r = await api<{ status?: string; error?: string }>("/api/pulse", { text })
  if (!r.ok) return { status: "error", message: r.data?.error || "Couldn't publish it to the pulse right now." }
  const s = r.data?.status
  if (s === "live") return { status: "live", message: "Published anonymously in the Inspection pulse." }
  if (s === "rejected") return { status: "rejected", message: "Not published: it didn't read like an inspection debrief." }
  return { status: s === "pending" ? "pending" : "checking", message: "Being checked. It appears in the Inspection pulse shortly." }
}
