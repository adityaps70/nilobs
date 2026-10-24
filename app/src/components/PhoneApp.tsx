import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import confetti from "canvas-confetti"

import { AnimatedCircularProgressBar } from "@/components/magicui/animated-circular-progress-bar"
import { AnimatedList } from "@/components/magicui/animated-list"
import { BlurFade } from "@/components/magicui/blur-fade"
import { NumberTicker } from "@/components/magicui/number-ticker"
import { Ripple } from "@/components/magicui/ripple"
import { ShimmerButton } from "@/components/magicui/shimmer-button"
import { TypingAnimation } from "@/components/magicui/typing-animation"
import * as I from "@/components/icons"
import { cn } from "@/lib/utils"
import { StoryCard, StoryReader } from "@/components/StoryViews"
import { COSTS, CostTag, CreditPill, EARN, PLANS, WELCOME_CREDITS, WalletNudge, storyOfTheWeek, useWallet } from "@/credits"
import { WalletScreen } from "@/components/Plans"
import type { AppScreen } from "@/nav"
import { CHANNEL_STORIES, LESSONS, REPORT_STORIES, STORIES, storyById } from "@/stories"
import { KitScreen, LevelRing, MeScreen, MissionsCard, ObsOfTheDay, RadarScreen, SessionScreen, SpotScreen, StreakPill, TrainScreen } from "@/components/AppPlus"
import { useProgress } from "@/progress"
import { AiChip, AiInspector, AskCard, AskScreen, BriefPlan } from "@/components/AiFeatures"
import { PhotoCheck } from "@/components/PhotoCheck"
import { FLEET_STATS, KIT_TOTAL, OBS, type DeckId } from "@/fleet"
import { CHAPTERS, OCIMF_URL, SECTIONS, chapterOf, libForRank, officialFor, sectionOf } from "@/library"
import { ChapterBadge, IconTile, TopicBadge, type TileColor } from "@/components/topicIcons"
import { RolePicker, RoleSelect } from "@/components/RolePicker"
import { AccountChip } from "@/auth"
import { cleanRoleName, hasPreparedQuestions, isShore, roleOf, setCompany, setCurrentProfile, setCustomRole } from "@/roles"
import { Chip, Label, Scroll, Section, TopBar } from "@/components/ui"
import { BRAND, Logo, LogoMark } from "@/components/Brand"
import {
  BANK, DAY_TIMELINE, DEBRIEFS, FLASHCARDS, INTERVIEW, MAJORS, PORTS, RANKS, RANK_NAMES, RANK_TOPICS, SAMPLE_RAW, SHIP_TYPES,
  TOPIC_EVIDENCE, buildBrief, fmtDate, scoreAnswer, structureDebrief, topicCounts, type Brief, type Topic,
} from "@/data"

export type Screen = AppScreen

const NIGHT_COLORS = ["#ff4f42", "#b3342b", "#7a1a12"]
export function burst(el?: Element | null, opts: confetti.Options = {}) {
  const r = el?.getBoundingClientRect()
  const origin = r ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight } : { x: 0.5, y: 0.6 }
  confetti({ particleCount: 90, spread: 75, startVelocity: 32, origin, colors: ["#0b6bcb", "#f26b1d", "#0b7d64", "#ffcf70", "#7cc4ff"], disableForReducedMotion: true, ...opts })
}

/* ---------- small utilities ---------- */
function usePersist<T>(key: string, init: T, valid?: (x: unknown) => boolean) {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key)
      if (!s) return init
      const x = JSON.parse(s)
      return valid && !valid(x) ? init : (x as T)
    } catch {
      return init
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {
      /* storage unavailable: state just lives in memory */
    }
  }, [key, v])
  return [v, setV] as const
}
export const STORAGE_KEYS = ["sr.profile", "sr.ratings", "sr.saved", "sr.streak"]
const isObj = (x: unknown) => !!x && typeof x === "object" && !Array.isArray(x)
const isStrArr = (x: unknown) => Array.isArray(x) && x.every((v) => typeof v === "string")
/** Who the user is: any role from roles.ts (with their own words for "Other"), the ship type and, optionally, the company. */
export interface Profile { rank: string; ship: string; roleName?: string; company?: string }
const optStr = (v: unknown) => v === undefined || typeof v === "string"
const isProfile = (x: unknown) =>
  x === null ||
  (isObj(x) && typeof (x as Profile).rank === "string" && RANKS.includes((x as Profile).rank) && typeof (x as Profile).ship === "string" && optStr((x as Profile).roleName) && optStr((x as Profile).company))
const isBrief = (x: unknown) => {
  if (x === null) return true
  if (!isObj(x)) return false
  const b = x as Record<string, unknown>
  return typeof b.major === "string" && typeof b.port === "string" && typeof b.rank === "string" && typeof b.date === "string" && Array.isArray(b.done) && typeof b.plan === "string"
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const pad2 = (n: number) => String(n).padStart(2, "0")
/** Midnight UTC of the device's local date, so day counts don't drift with the time of day. */
const todayUTC = () => {
  const d = new Date()
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}
export const isoIn = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function daysTo(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return y ? Math.round((Date.UTC(y, m - 1, d) - todayUTC()) / 86400000) : 0
}
function describeDate(iso: string) {
  const [y, m, d] = (iso || "").split("-").map(Number)
  if (!y) return { label: "Date not set", rel: "" }
  const t = Date.UTC(y, m - 1, d)
  const days = Math.round((t - todayUTC()) / 86400000)
  const rel = days > 1 ? `in ${days} days` : days === 1 ? "tomorrow" : days === 0 ? "today" : "date has passed"
  return { label: `${DAYS[new Date(t).getUTCDay()]} ${d} ${MON[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ""}`, rel }
}

/** Renders the 390×844 app at whatever width its box has. */
export function ScaledScreen({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [s, setS] = useState(0.8)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setS(el.clientWidth / 390))
    ro.observe(el)
    setS(el.clientWidth / 390)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="relative size-full overflow-hidden">
      <div className="absolute top-0 left-0 h-[844px] w-[390px] origin-top-left" style={{ transform: `scale(${s})` }}>
        {children}
      </div>
    </div>
  )
}

/* =====================================================================
   App shell
   ===================================================================== */
type NavItem = { k: string; label: string; Icon: (p: { size?: number }) => ReactNode; target: Screen }

export function PhoneApp({
  screen, go: rawGo, night, setNight, framed = true, variant = "phone", storyId, setStoryId, onExit, officialSignal, deck: deckProp, askSeed: askSeedProp, askSignal, initialRank, planIntent,
}: {
  screen: Screen; go: (s: Screen) => void; night: boolean; setNight: (v: boolean) => void; framed?: boolean
  variant?: "phone" | "web"; storyId?: number; setStoryId?: (id: number | null) => void; onExit?: () => void
  officialSignal?: number
  deck?: DeckId
  askSeed?: string
  askSignal?: number
  initialRank?: string
  planIntent?: { select: string; cycle?: "monthly" | "annual"; n: number }
}) {
  const planDone = useRef(0)
  const wallet = useWallet()
  const [deck, setDeck] = useState<DeckId>(deckProp ?? "trending")
  useEffect(() => {
    if (deckProp) setDeck(deckProp)
  }, [deckProp])
  // a question typed on the site waits in the box (the price shows there); one from Today is sent straight away
  const [askSeed, setAskSeed] = useState<{ q: string; auto: boolean } | null>(askSeedProp ? { q: askSeedProp, auto: false } : null)
  useEffect(() => {
    if (askSignal && askSeedProp) setAskSeed({ q: askSeedProp, auto: false })
  }, [askSignal]) // eslint-disable-line react-hooks/exhaustive-deps
  const [profile, setProfile] = usePersist<Profile | null>("sr.profile", null, isProfile)
  // labels and AI prompts use the user's own words for "Other" and their company, if given
  setCustomRole(profile?.roleName)
  setCompany(profile?.company)
  setCurrentProfile(profile?.rank, profile?.ship)
  const [ratings, setRatings] = usePersist<Record<string, "yes" | "unsure">>("sr.ratings", {}, isObj)
  const [saved, setSaved] = usePersist<string[]>("sr.saved", [], isStrArr)
  const [streak, setStreak] = usePersist<{ n: number; last: string }>("sr.streak", { n: 0, last: "" }, isObj)
  const [libDone, setLibDone] = usePersist<Record<string, boolean>>("sr.lib", {}, isObj)
  // a plan chosen on the site opens once the user has picked a rank
  useEffect(() => {
    if (profile && planIntent && planIntent.n !== planDone.current) {
      planDone.current = planIntent.n
      const t = setTimeout(() => wallet.openPlans({ select: planIntent.select, cycle: planIntent.cycle, tab: planIntent.select.startsWith("t") ? "topup" : "plans" }), 350)
      return () => clearTimeout(t)
    }
  }, [profile, planIntent?.n]) // eslint-disable-line react-hooks/exhaustive-deps
  const [bankMode, setBankMode] = useState<"real" | "official">(officialSignal ? "official" : "real")
  useEffect(() => {
    if (officialSignal) setBankMode("official")
  }, [officialSignal])
  type SavedBrief = { major: string; port: string; rank: string; date: string; done: boolean[]; plan: string; ticket?: string }
  const [briefSaved, setBriefSaved] = usePersist<SavedBrief | null>("sr.brief", null, isBrief)
  const brief = useMemo<Brief | null>(() => (briefSaved ? { ...buildBrief(briefSaved.major, briefSaved.port, briefSaved.rank), ticket: briefSaved.ticket } : null), [briefSaved?.major, briefSaved?.port, briefSaved?.rank, briefSaved?.ticket]) // eslint-disable-line react-hooks/exhaustive-deps
  const briefDate = briefSaved?.date ?? ""
  const done = briefSaved?.done ?? []
  const setDone = (d: boolean[]) => setBriefSaved((b) => (b ? { ...b, done: d } : b))
  const setPlan = (t: string) => setBriefSaved((b) => (b ? { ...b, plan: t } : b))
  const building = useRef(false)
  const [bankTopic, setBankTopic] = useState<Topic | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false)
  useEffect(() => {
    const on = () => setOffline(false), off = () => setOffline(true)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    return () => {
      window.removeEventListener("online", on)
      window.removeEventListener("offline", off)
    }
  }, [])
  const [localStory, setLocalStory] = useState<number | null>(null)
  const story = storyId ?? localStory
  const pickStory = setStoryId ?? setLocalStory
  // Going to the Stories tab always lands on the list
  const go = (s: Screen) => {
    if (s === "stories") pickStory(null)
    rawGo(s)
  }

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const rank = profile?.rank ?? "2/O"
  const evidence = useMemo(() => (brief ? brief.focus.slice(0, 3).flatMap((f) => TOPIC_EVIDENCE[f.topic].slice(0, 3).map((e) => ({ e, topic: f.topic }))) : []), [brief])
  const readiness = brief ? Math.round((100 * evidence.filter((_, i) => done[i]).length) / Math.max(1, evidence.length)) : 0

  const build = (major: string, port: string, r: string, date: string) => {
    if (building.current) return
    const ticket = wallet.charge({ kind: "brief" }, { note: `${major} · ${port || "any port"} · ${r}` })
    if (!ticket) return
    building.current = true
    setBriefSaved({ major, port, rank: r, date, done: [], plan: "", ticket })
    go("loading")
    setTimeout(() => (building.current = false), 1500)
  }

  const tab =
    screen === "setup" || screen === "loading" || screen === "brief" ? "brief"
      : screen === "drill" || screen === "session" || screen === "spot" ? "train"
      : screen
  const primary: NavItem[] = [
    { k: "today", label: "Today", Icon: I.Home, target: "today" },
    { k: "train", label: "Train", Icon: I.Layers, target: "train" },
    { k: "ask", label: "Ask AI", Icon: I.Sparkle, target: "ask" },
    { k: "radar", label: "Radar", Icon: I.Radar, target: "radar" },
    { k: "stories", label: "Stories", Icon: I.Newspaper, target: "stories" },
  ]
  const secondary: NavItem[] = [
    { k: "practice", label: "AI inspector", Icon: I.Mic, target: "practice" },
    { k: "photo", label: "Photo check", Icon: I.Camera, target: "photo" },
    { k: "bank", label: "Questions", Icon: I.Book, target: "bank" },
    { k: "brief", label: "Inspection brief", Icon: I.Clipboard, target: brief ? "brief" : "setup" },
    { k: "kit", label: "Ready kit", Icon: I.Briefcase, target: "kit" },
    { k: "me", label: "Profile & progress", Icon: I.Award, target: "me" },
    { k: "share", label: "Share a debrief", Icon: I.Plus, target: "share" },
    { k: "wallet", label: "Plans & credits", Icon: I.Wallet, target: "wallet" },
  ]
  const openDeck = (d: DeckId) => {
    setDeck(d)
    go("session")
  }
  const web = variant === "web"

  const content = (
    <div className="relative min-h-0 flex-1">
      {offline && profile && (
        <div role="status" className="absolute inset-x-4 top-1 z-30 flex items-center gap-2 rounded-xl bg-ink px-3 py-2 text-[12px] leading-snug text-bg shadow-lg">
          <I.Wifi size={14} className="shrink-0" /> No signal. Flashcards, Spot, the radar, the ready kit and your saved brief still work; AI needs a connection.
        </div>
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={profile ? screen + (screen === "stories" ? String(story) : "") : "onboard"}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 flex flex-col"
        >
          {!profile ? (
            <Onboard initialRank={initialRank} onDone={(p) => { setProfile(p); if (screen === "today") go("today") }} />
          ) : (
            <>
              {screen === "today" && (
                <Today
                  {...{ rank, brief, briefDate, readiness, night, setNight, streak, ratings, go }}
                  web={web}
                  onExit={onExit}
                  openTopic={(t) => { setBankTopic(t); setBankMode("real"); go("bank") }}
                  openStory={(id) => { pickStory(id); rawGo("stories") }}
                  libDone={libDone}
                  openLibrary={() => { setBankMode("official"); go("bank") }}
                  openAsk={(q) => { setAskSeed(q ? { q, auto: true } : null); go("ask") }}
                />
              )}
              {screen === "stories" && <StoriesScreen storyId={story} setStoryId={pickStory} rank={rank} />}
              {(screen === "setup" || ((screen === "brief" || screen === "loading") && !brief)) && <Setup rank={rank} onBuild={build} hasBrief={!!brief} onBack={() => go(brief ? "brief" : "today")} />}
              {screen === "loading" && brief && <Loading brief={brief} onDone={() => go("brief")} />}
              {screen === "brief" && brief && (
                <BriefScreen brief={brief} date={briefDate} go={go} evidence={evidence} done={done} setDone={setDone} readiness={readiness} night={night} toast={setToast} plan={briefSaved?.plan ?? ""} setPlan={setPlan} />
              )}
              {screen === "practice" && (
                <>
                  <TopBar title="AI inspector" right={<CreditPill className="h-9" />} />
                  <AiInspector rank={rank} ship={profile?.ship ?? "Product"} fallback={<Interview rank={rank} night={night} />} />
                </>
              )}
              {screen === "bank" && (
                <Bank rank={rank} ratings={ratings} setRatings={setRatings} saved={saved} setSaved={setSaved} topic={bankTopic} setTopic={setBankTopic} go={go}
                  mode={bankMode} setMode={setBankMode} libDone={libDone} setLibDone={setLibDone} night={night} />
              )}
              {screen === "train" && <TrainScreen rank={rank} go={go} openDeck={openDeck} />}
              {screen === "ask" && (
                <AskScreen rank={rank} ship={profile?.ship ?? "Product"} seed={askSeed?.q ?? null} seedAuto={askSeed?.auto ?? false} clearSeed={() => setAskSeed(null)} openStory={(id) => { pickStory(id); rawGo("stories") }} go={go} />
              )}
              {(screen === "session" || screen === "drill") && <SessionScreen key={deck + screen} deck={screen === "drill" ? "trending" : deck} rank={rank} go={go} />}
              {screen === "photo" && <PhotoCheck rank={rank} ship={profile?.ship ?? "Product"} onAsk={(q) => { setAskSeed({ q, auto: false }); go("ask") }} />}
              {screen === "spot" && <SpotScreen go={go} />}
              {screen === "radar" && <RadarScreen rank={rank} go={go} />}
              {screen === "kit" && <KitScreen go={go} />}
              {screen === "me" && <MeScreen go={go} profile={profile} setProfile={setProfile} night={night} setNight={setNight} />}
              {screen === "share" && <Share night={night} />}
              {screen === "wallet" && <WalletScreen go={go} />}
            </>
          )}
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <motion.div role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="glass-deep absolute inset-x-5 bottom-4 z-20 rounded-2xl px-4 py-3 text-[13.5px] font-medium">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )

  const tabBar = profile && (
    <nav aria-label="App" className={cn("glass grid shrink-0 grid-cols-5 rounded-none border-x-0 border-b-0 px-1", web ? "h-[64px] pb-[env(safe-area-inset-bottom,0px)] lg:hidden" : "h-[82px] pb-5")}>
      {primary.map(({ k, label, Icon, target }) => (
        <button
          key={k}
          type="button"
          onClick={() => go(target)}
          aria-current={tab === k ? "page" : undefined}
          className={cn("relative flex flex-col items-center justify-center gap-1 text-[10.5px]", tab === k ? "font-bold text-ink" : "font-medium text-mute")}
        >
          {tab === k && <motion.span layoutId={web ? "tabdot-web" : "tabdot"} className="absolute inset-x-1.5 top-1.5 bottom-1.5 rounded-2xl bg-primary-soft" />}
          {k === "ask" ? (
            <span className="relative -mt-1 flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#7b5cff] to-[#1660d6] text-white shadow-[0_6px_14px_-6px_rgba(91,59,209,0.8)]"><Icon size={19} /></span>
          ) : (
            <span className={cn("relative", tab === k && "text-primary")}><Icon size={22} /></span>
          )}
          <span className="relative">{label}</span>
        </button>
      ))}
    </nav>
  )

  if (!web)
    return (
      <div className={cn("phone-aurora relative flex h-[844px] w-[390px] flex-col font-sans text-ink transition-colors duration-500", night && "night-watch bg-bg")}>
        <div className={cn("shrink-0", framed ? "h-[54px]" : "h-4")} />
        {content}
        {tabBar}
      </div>
    )

  return (
    <div className={cn("flex h-[100dvh] font-sans text-ink transition-colors duration-500", night && "night-watch bg-bg")}>
      {profile && (
        <aside className="glass no-scrollbar hidden w-[256px] shrink-0 flex-col gap-0.5 overflow-y-auto rounded-none border-y-0 border-l-0 px-3 py-4 lg:flex">
          <button type="button" onClick={onExit} className="mb-4 flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-surface-2">
            <Logo size={38} sub="Back to the site" />
          </button>
          {[...primary, ...secondary].map(({ k, label, Icon, target }, i) => (
            <button
              key={k}
              type="button"
              onClick={() => go(target)}
              aria-current={tab === k ? "page" : undefined}
              className={cn(
                "relative flex h-10 shrink-0 items-center gap-3 rounded-xl px-3 text-[14px] transition-colors",
                i === primary.length && "mt-3",
                tab === k ? "bg-white/80 font-bold text-ink shadow-[0_6px_18px_-12px_rgba(18,48,92,0.5)]" : "font-medium text-mute hover:bg-white/50 hover:text-ink"
              )}
            >
              {tab === k && <motion.span layoutId="sidedot" className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-full bg-primary" />}
              <span className={cn(tab === k && "text-primary")}><Icon size={19} /></span>
              {label}
            </button>
          ))}
          <SideLevel go={go} />
          <div className="mt-2 flex shrink-0 flex-col gap-2.5 rounded-2xl bg-white/60 p-4">
            <span className="font-mono text-[11px] tracking-[0.1em] text-mute uppercase">Your credits</span>
            <span className="tnum display text-[30px] leading-none font-bold">{wallet.balance}</span>
            <span className="text-[12.5px] leading-snug text-mute">{wallet.plan.name} plan{wallet.perks.pass && wallet.plan.id === "free" ? " + Voyage pass" : ""} · Interview {COSTS.interview} · Brief {COSTS.brief}</span>
            <button type="button" onClick={() => (wallet.plan.id === "free" && !wallet.perks.pass ? wallet.openPlans() : go("wallet"))} className="h-10 rounded-xl bg-primary text-[13.5px] font-semibold text-on-primary">{wallet.plan.id === "free" && !wallet.perks.pass ? "Upgrade" : "Plans & credits"}</button>
          </div>
          <button
            type="button"
            aria-pressed={night}
            onClick={() => setNight(!night)}
            className={cn("mt-2 flex h-10 items-center gap-2.5 rounded-xl px-3 text-[13.5px] font-medium", night ? "bg-signal-soft text-signal" : "text-mute hover:bg-surface-2")}
          >
            <I.Moon size={17} /> Night-watch mode
          </button>
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col pt-[max(12px,env(safe-area-inset-top,0px))] lg:pt-6">{content}</div>
        {tabBar}
      </div>
    </div>
  )
}

/* ---------------- Onboarding ---------------- */
function Onboard({ onDone, initialRank }: { onDone: (p: Profile) => void; initialRank?: string }) {
  const [rank, setRank] = useState<string | null>(initialRank && RANKS.includes(initialRank) ? initialRank : null)
  const [roleName, setRoleName] = useState("")
  const [ship, setShip] = useState("Product")
  const [company, setCo] = useState("")
  const named = rank !== "Other" || cleanRoleName(roleName).length >= 2
  const ready = !!rank && named
  const label = rank === "Other" ? cleanRoleName(roleName) || "your role" : rank ? RANK_NAMES[rank] : ""
  return (
    <Scroll className="gap-5 pt-4">
      <LogoMark size={56} />
      <div className="flex flex-col gap-2">
        <h2 className="display text-[30px] leading-[1.05] font-bold">Welcome aboard</h2>
        <p className="text-[15px] leading-snug text-mute">{BRAND.tagline} For every rank on board and the company's people ashore. No ship details and no sign-up to start.</p>
      </div>
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5">
        <IconTile icon={I.Coin} color="teal" size={40} />
        <span className="flex flex-col">
          <span className="text-[14.5px] font-bold">{WELCOME_CREDITS} free credits are waiting</span>
          <span className="text-[12.5px] leading-snug text-mute">{WELCOME_CREDITS - PLANS.free.credits} welcome credits plus {PLANS.free.credits} every month: enough for a mock interview, a brief and a few deep AI answers. Flashcards, the game, the radar and the ready kit are free every day.</span>
        </span>
      </div>
      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5"><Label>1 · Your role</Label></legend>
        <RolePicker
          value={rank}
          roleName={roleName}
          onChange={(r, n) => {
            setRank(r)
            setRoleName(n)
          }}
        />
      </fieldset>
      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5"><Label>2 · Ship type</Label></legend>
        <div className="flex flex-wrap gap-1.5">
          {SHIP_TYPES.map((s) => <Chip key={s} on={ship === s} onClick={() => setShip(s)}>{s} tanker</Chip>)}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1.5">
        <Label>3 · Company <span className="font-normal">(optional)</span></Label>
        <input value={company} maxLength={60} onChange={(e) => setCo(e.target.value)} placeholder="Only used to tailor AI answers" className="h-11 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink outline-none focus:border-primary" />
      </label>
      <div className="flex gap-2.5 rounded-2xl bg-sea-soft px-4 py-3 text-[13px] leading-snug text-sea">
        <I.Shield size={18} className="shrink-0" />
        Everything you share is anonymous. Ship, crew and inspector names are removed before anyone sees it.
      </div>
      <button
        type="button"
        disabled={!ready}
        onClick={() => rank && ready && onDone({ rank, ship, ...(rank === "Other" ? { roleName: cleanRoleName(roleName) } : {}), ...(company.trim() ? { company: company.trim().slice(0, 60) } : {}) })}
        className="flex h-[54px] items-center justify-center gap-2 rounded-2xl bg-primary text-[16px] font-semibold text-on-primary transition-opacity disabled:opacity-35"
      >
        {ready ? `Start as ${label}` : rank === "Other" ? "Type your role to start" : "Pick your role to start"} <I.ArrowRight size={18} />
      </button>
    </Scroll>
  )
}

/* ---------------- Sidebar level card ---------------- */
function SideLevel({ go }: { go: (s: Screen) => void }) {
  const prog = useProgress()
  return (
    <button type="button" onClick={() => go("me")} className="mt-auto flex shrink-0 items-center gap-3 rounded-2xl bg-white/60 p-3 text-left hover:bg-white/80">
      <LevelRing size={44} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13.5px] font-bold">{prog.level.name}</span>
        <span className="tnum text-[11.5px] text-mute">{prog.xp} XP · {prog.streak.n}-day streak</span>
      </span>
    </button>
  )
}

/* ---------------- Today ---------------- */
function Today(p: {
  rank: string; brief: Brief | null; briefDate: string; readiness: number; night: boolean; setNight: (v: boolean) => void; web?: boolean
  streak: { n: number; last: string }; ratings: Record<string, "yes" | "unsure">; go: (s: Screen) => void; openTopic: (t: Topic) => void
  openStory: (id: number) => void
  onExit?: () => void
  libDone: Record<string, boolean>
  openLibrary: () => void
  openAsk: (q?: string) => void
}) {
  const wallet = useWallet()
  const prog = useProgress()
  const when = describeDate(p.briefDate)
  const relevant = RANK_TOPICS[p.rank] || RANK_TOPICS["2/O"]
  const counts = new Map(topicCounts())
  const unsure = new Set(BANK.filter((q) => p.ratings[q.id] === "unsure").map((q) => q.topic))
  const weak = (unsure.size ? [...unsure] : [...relevant].sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0))).slice(0, 4)
  const lib = libForRank(p.rank)
  const libReady = lib.filter((q) => p.libDone[q.n]).length
  // same rule as the Questions screen's "For your rank" filter, so the two counts agree
  const mine = BANK.filter((q) => (q.rank ? q.rank === p.rank : relevant.includes(q.topic)))
  const tested = prog.readiness(p.rank).filter((r) => r.score != null).sort((a, b) => (a.score as number) - (b.score as number))
  const bankYes = mine.filter((q) => p.ratings[q.id] === "yes").length
  const pct = Math.round(((libReady + bankYes) / Math.max(1, lib.length + mine.length)) * 100)
  const tip = LESSONS[new Date().getDate() % LESSONS.length]
  const tipStory = storyById(tip.sources[0])
  const due = prog.dueCount("trending", p.rank)
  const h = new Date().getHours()
  const hello = h < 5 ? "Good to see you" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
  const picks = [...REPORT_STORIES.slice(0, 3), ...CHANNEL_STORIES.slice(0, 3)].sort((a, b) => b.d.date.localeCompare(a.d.date))

  const actions: { label: string; sub: string; icon: (q: { size?: number }) => ReactNode; color: TileColor; tag: ReactNode; onClick: () => void }[] = [
    { label: "Spot the observation", sub: `${OBS.length} real findings`, icon: I.Target, color: "orange", tag: <FreeTag />, onClick: () => p.go("spot") },
    { label: "Flashcards", sub: due ? `${due} due today` : "10 fresh cards ready", icon: I.Layers, color: "blue", tag: <FreeTag />, onClick: () => p.go("train") },
    { label: "Photo check", sub: "What would an inspector flag?", icon: I.Camera, color: "indigo", tag: <CostTag cost={COSTS.photo} className="text-mute" />, onClick: () => p.go("photo") },
    { label: "Ready kit", sub: `${KIT_TOTAL} pre-inspection checks`, icon: I.Briefcase, color: "amber", tag: <FreeTag />, onClick: () => p.go("kit") },
    { label: "Official checklist", sub: `${lib.length} questions for your role`, icon: I.ListCheck, color: "teal", tag: <FreeTag />, onClick: p.openLibrary },
    { label: "Inspection brief", sub: p.brief ? "Open your brief" : "Your oil major, port and rank", icon: I.Clipboard, color: "sky", tag: p.brief ? <FreeTag label="Ready" /> : <CostTag cost={COSTS.brief} className="text-mute" />, onClick: () => p.go(p.brief ? "brief" : "setup") },
    { label: "AI inspector", sub: "Graded answers, voice mode", icon: I.Mic, color: "violet", tag: <CostTag cost={COSTS.interview} className="text-mute" />, onClick: () => p.go("practice") },
    { label: "Inspection stories", sub: `${STORIES.length} real inspections`, icon: I.Newspaper, color: "rose", tag: wallet.perks.allStories ? <FreeTag label="Included" /> : <CostTag cost={COSTS.story} className="text-mute" />, onClick: () => p.go("stories") },
  ]

  return (
    <Scroll className="gap-5 pt-1">
      <header className="flex items-center justify-between gap-2">
        <button type="button" onClick={p.onExit} disabled={!p.onExit} aria-label={p.onExit ? "NilObs: back to the site" : undefined} className={cn("flex min-w-0 items-center gap-2.5 text-left", p.web && "lg:invisible")}>
          <Logo size={36} />
        </button>
        <div className="flex items-center gap-1.5">
          <StreakPill onClick={() => p.go("me")} />
          <button type="button" onClick={() => p.go("me")} aria-label="Your progress" className="rounded-full"><LevelRing size={40} /></button>
          <button
            type="button"
            aria-pressed={p.night}
            aria-label={p.night ? "Turn off night-watch mode" : "Turn on night-watch mode"}
            onClick={() => p.setNight(!p.night)}
            className={cn("hidden size-10 items-center justify-center rounded-full border sm:flex", p.night ? "border-signal bg-signal-soft text-signal" : "border-line bg-surface")}
          >
            <I.Moon size={18} />
          </button>
          <CreditPill onClick={() => p.go("wallet")} className="h-10" />
          <AccountChip role={RANK_NAMES[p.rank] || p.rank} onProfile={() => p.go("me")} onPlans={() => p.go("wallet")} />
        </div>
      </header>

      <div className="flex flex-col gap-1">
        <h2 className="display text-[27px] leading-[1.1] font-bold">{hello}, {RANK_NAMES[p.rank] || p.rank}</h2>
        <p className="text-[14px] text-mute">
          Level {prog.level.n} · {prog.level.name}
          {prog.level.next ? ` · ${prog.level.toNext} XP to ${prog.level.next.name}` : ""}
        </p>
      </div>

      <WalletNudge onOpen={() => p.go("wallet")} />

      <MissionsCard go={p.go} />

      <AskCard rank={p.rank} onAsk={p.openAsk} />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {actions.map((a, i) => (
          <motion.button
            key={a.label}
            type="button"
            onClick={a.onClick}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 * i }}
            whileHover={{ y: -2 }}
            className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-3.5 text-left"
          >
            <span className="flex items-start justify-between gap-2">
              <IconTile icon={a.icon} color={a.color} size={40} />
              {a.tag}
            </span>
            <span className="flex flex-col">
              <span className="text-[14px] leading-tight font-bold">{a.label}</span>
              <span className="mt-0.5 text-[12px] leading-snug text-mute">{a.sub}</span>
            </span>
          </motion.button>
        ))}
      </div>

      <ObsOfTheDay onMore={() => p.go("spot")} />

      <section aria-label="Your confidence" className="glass flex items-center gap-4 rounded-[22px] p-4">
        <AnimatedCircularProgressBar value={pct} gaugePrimaryColor="var(--primary)" gaugeSecondaryColor="rgba(11,107,203,0.14)" className="size-[86px] shrink-0 text-[19px] text-ink" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-[16px] font-bold">Your confidence</span>
          <span className="flex items-center gap-1.5 text-[13px]"><I.ListCheck size={15} className="shrink-0 text-primary" /> {libReady} of {lib.length} official questions ready</span>
          <span className="flex items-center gap-1.5 text-[13px]"><I.Check size={15} className="shrink-0 text-sea" /> {bankYes} of {mine.length} questions asked of {p.rank}s</span>
          <button type="button" onClick={p.openLibrary} className="self-start text-[13px] font-semibold text-primary">Tick off more →</button>
        </div>
      </section>

      {p.brief && (
        <button type="button" onClick={() => p.go("brief")} className="flex items-center gap-4 rounded-[22px] bg-hero p-4 text-left text-hero-ink">
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[12px] font-semibold text-hero-muted">Next inspection</span>
            <span className="display text-[19px] leading-tight font-bold">{p.brief.major} · {p.brief.port || "Any port"}</span>
            <span className="text-[13px] text-hero-muted">{p.briefDate ? `${when.label} · ${when.rel}` : "Set the inspection date"}</span>
          </span>
          <AnimatedCircularProgressBar value={p.readiness} gaugePrimaryColor="var(--hero-accent)" gaugeSecondaryColor="var(--hero-track)" className="size-[70px] shrink-0 text-[16px] text-hero-ink" />
        </button>
      )}

      <section className="glass flex flex-col gap-2.5 rounded-[22px] p-4">
        <span className="flex items-center gap-2 text-[12.5px] font-semibold text-signal-ink"><IconTile icon={I.Lightbulb} color="amber" size={26} /> Tip of the day</span>
        <span className="text-[16px] leading-snug font-bold">{tip.title}</span>
        <span className="text-[13.5px] leading-relaxed text-mute">{tip.body}</span>
        <button type="button" onClick={() => p.openStory(tipStory.d.id)} className="self-start text-[13px] font-semibold text-primary">See the inspection it came from →</button>
      </section>

      <Section title="Latest inspections" aside={<button type="button" onClick={() => p.go("stories")} className="font-sans text-[13px] font-semibold text-primary">All {STORIES.length}</button>}>
        <div className="no-scrollbar -mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1">
          {picks.map((s) => (
            <div key={s.d.id} className="w-[256px] shrink-0">
              <StoryCard s={s} locked={!wallet.isUnlocked(s.d.id)} onClick={() => p.openStory(s.d.id)} />
            </div>
          ))}
        </div>
      </Section>

      <Section title={tested.length ? "Your weakest topics" : unsure.size ? "Your weak spots" : `Most asked of ${p.rank}s`} aside={tested.length ? "from your results" : "tap to study"}>
        <div className="flex flex-wrap gap-2">
          {(tested.length ? tested.slice(0, 4).map((r) => [r.topic, r.score] as const) : weak.map((t) => [t, null] as const)).map(([t, sc]) => (
            <button key={t} type="button" onClick={() => p.openTopic(t)} className="flex h-11 items-center gap-2 rounded-full border border-line bg-surface pr-3.5 pl-1.5 text-[13px] font-medium hover:border-mute">
              <TopicBadge topic={t} size={30} />
              {t}
              {sc != null && <span className={cn("tnum font-mono text-[11.5px] font-semibold", sc >= 75 ? "text-sea" : sc >= 50 ? "text-amber-ink" : "text-signal-ink")}>{sc}%</span>}
            </button>
          ))}
        </div>
        {tested.length > 0 && <button type="button" onClick={() => p.go("me")} className="self-start text-[13px] font-semibold text-primary">See readiness by topic →</button>}
      </Section>
    </Scroll>
  )
}

function FreeTag({ label = "Free" }: { label?: string }) {
  return <span className="rounded-full bg-sea-soft px-2 py-0.5 text-[11px] font-semibold text-sea">{label}</span>
}

/* ---------------- Brief setup ---------------- */
function Setup({ rank: r0, onBuild, hasBrief, onBack }: { rank: string; onBuild: (m: string, p: string, r: string, d: string) => void; hasBrief?: boolean; onBack?: () => void }) {
  const [major, setMajor] = useState("ENOC")
  const [port, setPort] = useState("Durres")
  const [rank, setRank] = useState(r0)
  const [date, setDate] = useState(() => isoIn(4))
  const min = isoIn(0)
  const max = isoIn(365)
  const bad = !date ? "Pick the inspection date." : date < min ? "That date has passed. Pick today or a later date." : date > max ? "Pick a date within the next year." : ""
  return (
    <>
      <TopBar title={hasBrief ? "New brief" : "Build a brief"} onBack={hasBrief ? onBack : undefined} right={<CreditPill />} />
      <Scroll>
        <p className="text-[14px] leading-snug text-mute">Pick who's inspecting and where. The brief is built from debriefs by officers who faced the same.</p>
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2"><Label>Oil major / inspecting body</Label></legend>
            <div className="flex flex-wrap gap-1.5">
              {MAJORS.map((m) => <Chip key={m} on={major === m} onClick={() => setMajor(m)}>{m}</Chip>)}
            </div>
          </fieldset>
          <div className="grid grid-cols-[1.35fr_1fr] gap-2.5">
            <label className="flex flex-col gap-1.5" htmlFor="app-port">
              <Label>Port</Label>
              <select id="app-port" value={port} onChange={(e) => setPort(e.target.value)} className="h-11 rounded-xl border border-line bg-surface px-2.5 text-[14px] text-ink">
                {PORTS.map((d) => <option key={d.id} value={d.port}>{d.port}</option>)}
                <option value="">Other port</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5" htmlFor="app-date">
              <Label>Date</Label>
              <input id="app-date" type="date" value={date} min={min} max={max} onChange={(e) => setDate(e.target.value)} className={cn("h-11 rounded-xl border bg-surface px-2 text-[13px] text-ink", bad ? "border-signal" : "border-line")} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5" htmlFor="app-role">
            <Label>The brief is for</Label>
            <RoleSelect id="app-role" value={rank} onChange={(r) => setRank(r)} />
          </label>
        </div>
        {bad && <p className="text-center text-[12.5px] font-medium text-signal-ink">{bad}</p>}
        <ShimmerButton onClick={() => !bad && onBuild(major, port, rank, date)} disabled={!!bad} borderRadius="14px" background="var(--primary)" shimmerColor="var(--signal)" className="h-[54px] w-full justify-between border-0 px-5 text-[15.5px] font-semibold text-on-primary disabled:opacity-50">
          <span>Build my {major} brief</span>
          <CostTag cost={COSTS.brief} className="opacity-80" />
        </ShimmerButton>
        <p className="text-center text-[12px] leading-snug text-mute">Includes a day-by-day AI prep plan. {hasBrief ? "Your current brief is replaced." : `Low on credits? Share a debrief and earn ${EARN.share}.`}</p>
      </Scroll>
    </>
  )
}

/* ---------------- Loading ---------------- */
function Loading({ brief, onDone }: { brief: Brief; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3300)
    return () => clearTimeout(t)
  }, [onDone])
  const steps = [
    `Found ${brief.matched.length} matching debrief${brief.matched.length === 1 ? "" : "s"}`,
    `Picked ${brief.questions.length} questions for a ${brief.rank}`,
    `Checked ${brief.negatives.length} recent negative observations`,
    "Listed the records to have ready",
  ]
  return (
    <div className="flex flex-1 flex-col items-center px-6 pt-6">
      <div className="relative h-[300px] w-full overflow-hidden">
        <Ripple mainCircleSize={90} numCircles={6} className="[--foreground:var(--signal)]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-[72px] items-center justify-center rounded-full bg-primary text-on-primary shadow-lg"><I.Radar size={34} /></span>
        </div>
      </div>
      <TypingAnimation className="text-center font-mono text-[13px] text-mute" duration={28} showCursor={false}>
        {`Matching: ${brief.major} · ${brief.port || "any port"} · ${brief.rank}`}
      </TypingAnimation>
      <AnimatedList delay={650} className="mt-5 w-full gap-2">
        {steps.map((s) => (
          <div key={s} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-[13.5px]">
            <span className="flex size-6 items-center justify-center rounded-full bg-sea-soft text-sea"><I.Check size={14} /></span>
            {s}
          </div>
        ))}
      </AnimatedList>
    </div>
  )
}

/* ---------------- Brief ---------------- */
function BriefScreen(p: {
  brief: Brief; date: string; go: (s: Screen) => void; evidence: { e: string; topic: Topic }[]; done: boolean[]; setDone: (d: boolean[]) => void
  readiness: number; night: boolean; toast: (s: string) => void; plan: string; setPlan: (t: string) => void
}) {
  const { brief } = p
  const listRef = useRef<HTMLDivElement>(null)
  const n = p.evidence.filter((_, i) => p.done[i]).length
  const when = describeDate(p.date)
  const toggle = (i: number) => {
    const next = p.evidence.map((_, j) => (j === i ? !p.done[j] : !!p.done[j]))
    p.setDone(next)
    if (next.every(Boolean)) burst(listRef.current, p.night ? { colors: NIGHT_COLORS } : {})
  }
  const dates = brief.matched.map((d) => d.date).sort()
  const summary = () =>
    [
      `NilObs brief: ${brief.major} · ${brief.port || "any port"} · ${brief.rank} · ${when.label}`,
      `Likely focus: ${brief.focus.map((f) => f.topic).join(", ")}`,
      `Have ready:\n${p.evidence.map((x, i) => `${p.done[i] ? "[x]" : "[ ]"} ${x.e}`).join("\n")}`,
      `Questions asked of ${brief.rank}s:\n${brief.questions.slice(0, 6).map((q, i) => `${i + 1}. ${q.q}`).join("\n")}`,
      p.plan ? `Prep plan:\n${p.plan.replace(/\*\*/g, "")}` : "",
    ].filter(Boolean).join("\n\n")
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary())
      p.toast("Brief copied. Paste it into notes or a message; it reads fine without signal.")
    } catch {
      p.toast("Couldn't copy here. Try Send to WhatsApp instead.")
    }
  }
  return (
    <>
      <TopBar title="Your brief" onBack={() => p.go("today")} right={<button type="button" onClick={() => p.go("setup")} className="h-9 rounded-full border border-line bg-surface px-3 text-[12.5px] font-semibold">New brief</button>} />
      <Scroll className="gap-5">
        <div className="rounded-[20px] bg-hero p-[18px] text-hero-ink">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[11.5px] font-semibold tracking-[0.08em] text-hero-muted uppercase">{brief.major} · {brief.port || "Any port"} · {brief.rank}</span>
              <span className="display text-[23px] leading-tight font-bold">{when.label}</span>
              <span className="text-[13px] text-hero-muted">{when.rel}</span>
            </div>
            <div className="relative">
              <AnimatedCircularProgressBar value={p.readiness} gaugePrimaryColor="var(--hero-accent)" gaugeSecondaryColor="var(--hero-track)" className="size-[86px] text-[19px] text-hero-ink" />
              <span className="absolute inset-x-0 -bottom-4 text-center font-mono text-[9.5px] tracking-[0.08em] text-hero-muted uppercase">ready</span>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-1.5">
            <div className="flex justify-between text-[12.5px]"><span className="text-hero-muted">Confidence</span><span className="font-semibold">{brief.confidence.level}</span></div>
            <div className="grid grid-cols-5 gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.span key={i} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.15 + i * 0.07 }} className={cn("h-1.5 origin-left rounded-full", i < brief.confidence.score ? "bg-hero-accent" : "bg-hero-track")} />
              ))}
            </div>
            <p className="mt-1 text-[12.5px] leading-snug text-hero-muted">
              {brief.matched.length
                ? `Based on ${brief.matched.length} matching debrief${brief.matched.length === 1 ? "" : "s"} (${fmtDate(dates[0])}${dates.length > 1 ? `–${fmtDate(dates[dates.length - 1])}` : ""}), topped up from all ${DEBRIEFS.length}.`
                : `No debriefs for ${brief.major === "Other" ? "this inspecting body" : brief.major} yet, so this is built from all ${DEBRIEFS.length}.`}
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(summary().slice(0, 3500))}`} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-hero-track text-[13px] font-semibold">
              <I.Send size={16} /> Send to WhatsApp
            </a>
            <button type="button" onClick={copy} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-hero-track text-[13px] font-semibold">
              <I.FileText size={16} /> Copy the brief
            </button>
          </div>
        </div>

        <BriefPlan brief={brief} date={when.label} evidence={p.evidence.map((x) => x.e)} daysLeft={daysTo(p.date)} plan={p.plan} setPlan={p.setPlan} />

        <Section title="Likely focus" aside="debriefs that raised it">
          <div className="flex flex-col rounded-2xl border border-line bg-surface px-3.5">
            {brief.focus.map((f, i) => (
              <div key={f.topic} className="flex flex-col gap-1.5 border-b border-line py-3 last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2.5 text-[14px] font-semibold"><TopicBadge topic={f.topic} size={30} />{f.topic}</span>
                  <span className="tnum font-mono text-[11.5px] text-mute">{brief.matched.length && f.inMatched ? `${f.inMatched} of ${brief.matched.length} matching` : `${f.overall} of ${DEBRIEFS.length} overall`}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(6, f.pct * 100)}%` }} transition={{ delay: 0.2 + i * 0.1, duration: 0.6 }} className="h-1.5 rounded-full bg-primary" />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Have these ready" aside={`${n} of ${p.evidence.length} done`}>
          <div ref={listRef} className="flex flex-col rounded-2xl border border-line bg-surface px-3.5">
            {p.evidence.map((x, i) => (
              <label key={x.e} className="flex min-h-11 cursor-pointer items-start gap-3 border-b border-line py-3 text-[13.5px] leading-snug last:border-0">
                <input type="checkbox" checked={!!p.done[i]} onChange={() => toggle(i)} className="mt-0.5 size-[18px] shrink-0 accent-[var(--signal)]" />
                <span className="flex flex-col gap-0.5">
                  <span className={cn(p.done[i] && "text-mute line-through")}>{x.e}</span>
                  <span className="font-mono text-[10.5px] text-mute">{x.topic}</span>
                </span>
              </label>
            ))}
          </div>
        </Section>

        <Section title={`Questions for a ${brief.rank}`} aside="asked in debriefs">
          <ol className="flex flex-col gap-2">
            {brief.questions.map((q, i) => (
              <li key={q.q}>
                <BlurFade delay={0.1 + i * 0.06} className="flex gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
                  <span className="tnum font-mono text-[12px] font-semibold text-signal-ink">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex flex-col gap-1">
                    <span className="text-[13.5px] leading-snug">{q.q}</span>
                    <span className="font-mono text-[10.5px] text-mute">{q.source}</span>
                  </span>
                </BlurFade>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="How the day usually runs" aside="from debriefs">
          <ol className="relative flex flex-col gap-3.5 pl-6">
            <span aria-hidden="true" className="absolute top-2 bottom-2 left-[7px] w-px bg-line" />
            {DAY_TIMELINE.map((t) => (
              <li key={t.stage} className="relative flex flex-col gap-0.5">
                <span aria-hidden="true" className="absolute top-1 -left-6 size-[15px] rounded-full border-2 border-signal bg-bg" />
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[14px] font-bold">{t.stage}</span>
                  <span className="font-mono text-[11px] text-signal-ink">{t.time}</span>
                </span>
                <span className="text-[13px] leading-snug text-mute">{t.detail}</span>
                <span className="font-mono text-[10.5px] text-mute">{t.src}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Recent negative observations" aside={brief.negatives[0]?.source}>
          <div className="flex flex-col gap-2 rounded-2xl border border-signal/30 bg-signal-soft p-3.5">
            {brief.negatives.map((x) => (
              <div key={x.text} className="flex gap-2.5 text-[13px] leading-snug">
                <I.Alert size={16} className="mt-px shrink-0 text-signal-ink" />
                {x.text}
              </div>
            ))}
          </div>
        </Section>

        <button type="button" onClick={() => p.go("practice")} className="flex h-[52px] items-center justify-between rounded-[14px] bg-primary px-5 text-[15px] font-semibold text-on-primary">
          Rehearse with the AI inspector <I.ArrowRight size={18} />
        </button>
        <p className="text-center text-[11.5px] leading-snug text-mute">Built from crew-submitted debriefs with names removed. Not OCIMF guidance.</p>
      </Scroll>
    </>
  )
}

/* ---------------- Practise: interview + drill ---------------- */
function Practise({ mode, go, rank, night, onDrillDone }: { mode: "interview" | "drill"; go: (s: Screen) => void; rank: string; night: boolean; onDrillDone: () => void }) {
  return (
    <>
      <TopBar title="Practise" />
      <div className="px-5 pb-3">
        <div role="tablist" aria-label="Practice mode" className="grid grid-cols-2 rounded-xl bg-surface-2 p-1">
          {([["interview", "Mock interview"], ["drill", "Daily drill"]] as const).map(([k, l]) => (
            <button key={k} role="tab" type="button" aria-selected={mode === k} onClick={() => go(k === "drill" ? "drill" : "practice")} className={cn("relative h-10 rounded-lg text-[13.5px] font-semibold", mode === k ? "text-ink" : "text-mute")}>
              {mode === k && <motion.span layoutId="seg" className="absolute inset-0 rounded-lg bg-surface shadow-sm" />}
              <span className="relative">{l}</span>
            </button>
          ))}
        </div>
      </div>
      {mode === "interview" ? <Interview rank={rank} night={night} /> : <Drill rank={rank} night={night} onDone={onDrillDone} />}
    </>
  )
}

function Interview({ rank, night }: { rank: string; night: boolean }) {
  const key = roleOf(rank).interview
  if (!key || !INTERVIEW[key]) return <NoPreparedInterview rank={rank} />
  return <PreparedInterview rank={rank} bankKey={key} night={night} />
}
/** Roles without a prepared mock interview (catering, shore staff, "Other"): the AI inspector writes one. */
function NoPreparedInterview({ rank }: { rank: string }) {
  return (
    <Scroll className="pt-2">
      <div className="flex flex-col gap-3 rounded-[20px] bg-hero p-5 text-hero-ink">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-hero-track"><I.Mic size={24} /></span>
        <span className="display text-[22px] leading-tight font-bold">Interview practice for a {RANK_NAMES[rank] || rank}</span>
        <span className="text-[14px] leading-relaxed text-hero-muted">
          The AI inspector writes questions for your role{isShore(rank) ? ", the way an inspector, a vetting team or an auditor would ask the company," : ""} grades each answer and suggests a stronger one. Sign in with Google above to start. Until then, flashcards and Spot the observation are free.
        </span>
      </div>
    </Scroll>
  )
}
function PreparedInterview({ rank, bankKey, night }: { rank: string; bankKey: string; night: boolean }) {
  const wallet = useWallet()
  const [started, setStarted] = useState(false)
  const bank = INTERVIEW[bankKey]
  const [qi, setQi] = useState(0)
  const [text, setText] = useState("")
  const [answer, setAnswer] = useState<string | null>(null)
  const [showModel, setShowModel] = useState(false)
  const [scores, setScores] = useState<number[]>([])
  const scoreRef = useRef<HTMLDivElement>(null)
  const finished = qi >= bank.length
  const q = bank[Math.min(qi, bank.length - 1)]
  const result = useMemo(() => (answer ? scoreAnswer(answer, q) : null), [answer, q])
  const hits = result?.filter((r) => r.hit).length ?? 0

  useEffect(() => {
    if (result && hits === result.length) burst(scoreRef.current, { particleCount: 60, ...(night ? { colors: NIGHT_COLORS } : {}) })
  }, [result, hits, night])

  const next = () => {
    setScores((s) => [...s, hits])
    setQi((i) => i + 1)
    setAnswer(null)
    setText("")
    setShowModel(false)
  }
  if (!started) {
    return (
      <Scroll className="pt-2">
        <div className="flex flex-col gap-4 rounded-[20px] bg-hero p-5 text-hero-ink">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-hero-track"><I.Mic size={24} /></span>
          <span className="display text-[22px] leading-tight font-bold">Mock interview for a {RANK_NAMES[rank] || rank}</span>
          <span className="text-[14px] leading-relaxed text-hero-muted">
            {bank.length} question{bank.length > 1 ? "s" : ""} inspectors asked {bankKey === rank ? "your rank" : `a ${RANK_NAMES[bankKey]}`} in real inspections. After each answer you get feedback on the fact, the procedure and the record, plus a model answer.
          </span>
          <button
            type="button"
            onClick={() => !!wallet.charge({ kind: "mockInterview" }, { note: RANK_NAMES[rank] || rank }) && setStarted(true)}
            className="flex h-12 items-center justify-between rounded-xl bg-hero-accent px-4 text-[15px] font-semibold text-[#1a0a00]"
          >
            Start session <CostTag cost={COSTS.interview} />
          </button>
        </div>
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-line p-4">
          <span className="text-[14px] font-bold">Answer like you're ready</span>
          <span className="text-[13px] leading-snug text-mute">State the fact. Say where the SMS covers it. Show the record that proves it's done.</span>
        </div>
        <p className="text-center text-[12.5px] text-mute">Want something free? Flashcards and Spot the observation cost nothing.</p>
      </Scroll>
    )
  }
  if (finished) {
    const total = scores.reduce((a, b) => a + b, 0)
    const max = bank.reduce((a, b) => a + b.rubric.length, 0)
    return (
      <Scroll className="items-center pt-6 text-center">
        <AnimatedCircularProgressBar value={Math.round((total / max) * 100)} gaugePrimaryColor="var(--sea)" gaugeSecondaryColor="var(--line)" className="size-[120px] text-[26px] text-ink" />
        <h3 className="display text-[24px] font-bold">Session done</h3>
        <p className="max-w-[30ch] text-[14px] leading-snug text-mute">You covered {total} of {max} points inspectors look for. With AI switched on, every graded interview is saved to your progress.</p>
        <button type="button" onClick={() => { setQi(0); setScores([]); setStarted(false) }} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-on-primary">
          <I.Refresh size={17} /> New session
        </button>
      </Scroll>
    )
  }
  return (
    <>
      <div className="px-5 pb-2">
        <div className="flex items-center justify-between text-[12px] text-mute">
          <span>{RANK_NAMES[rank] || rank} · the AI plays the inspector</span>
          <span className="tnum font-mono font-semibold text-ink">{qi + 1}/{bank.length}</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-surface-2">
          <motion.div animate={{ width: `${((qi + (answer ? 1 : 0.4)) / bank.length) * 100}%` }} className="h-1.5 rounded-full bg-signal" />
        </div>
      </div>
      <div className="no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto px-4 pt-2 pb-3 [&>*]:shrink-0">
        <div className="flex items-end gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[10px] font-semibold">INS</span>
          <div className="flex max-w-[86%] flex-col gap-1.5 rounded-[18px] rounded-bl-[6px] border border-line bg-surface px-3.5 py-3">
            <TypingAnimation key={qi} className="text-[15px] leading-snug" duration={22} showCursor={false}>{q.q}</TypingAnimation>
            <span className="font-mono text-[10.5px] text-mute">{q.context}</span>
          </div>
        </div>
        {!answer && (
          <div className="flex items-center gap-1.5 pl-10">
            <span className="text-[11.5px] text-mute">Cover:</span>
            {["Fact", "Procedure", "Record"].map((x) => <span key={x} className="rounded-full border border-dashed border-line px-2.5 py-1 font-mono text-[10.5px] text-mute">{x}</span>)}
          </div>
        )}
        {answer && (
          <>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-[86%] self-end rounded-[18px] rounded-br-[6px] bg-primary px-3.5 py-3 text-[14px] leading-snug text-on-primary">
              {answer}
            </motion.div>
            <div ref={scoreRef} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-bold">Feedback</span>
                <span className={cn("tnum rounded-full px-2.5 py-1 font-mono text-[11.5px] font-semibold", hits === result!.length ? "bg-sea-soft text-sea" : "bg-amber-soft text-amber-ink")}>{hits} of {result!.length} points</span>
              </div>
              {result!.map((r, i) => (
                <BlurFade key={r.label} delay={0.15 + i * 0.18}>
                  <div className="flex gap-2.5 text-[13px] leading-snug">
                    {r.hit ? <I.Check size={17} className="mt-px shrink-0 text-sea" /> : <I.Alert size={16} className="mt-px shrink-0 text-signal-ink" />}
                    <span><b className="font-semibold">{r.label}.</b> {r.hit ? "Covered." : r.hint}</span>
                  </div>
                </BlurFade>
              ))}
              <button type="button" onClick={() => setShowModel((v) => !v)} className="self-start text-[13px] font-semibold text-signal-ink underline-offset-2 hover:underline">
                {showModel ? "Hide model answer" : "Show model answer"}
              </button>
              <AnimatePresence>
                {showModel && (
                  <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed">
                    {q.model}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t border-line bg-surface px-3.5 pt-3 pb-3">
        {answer ? (
          <button type="button" onClick={next} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-on-primary">
            {qi + 1 < bank.length ? "Next question" : "See my score"} <I.ArrowRight size={17} />
          </button>
        ) : (
          <>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setText(q.samples[0])} className="h-9 rounded-full border border-line px-3 text-[12px] font-medium hover:border-mute">Try a quick answer</button>
              <button type="button" onClick={() => setText(q.samples[1])} className="h-9 rounded-full border border-line px-3 text-[12px] font-medium hover:border-mute">Try a strong answer</button>
            </div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) setAnswer(text.trim()) }}>
              <label htmlFor="app-answer" className="sr-only">Your answer</label>
              <textarea id="app-answer" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer, as you'd say it…" className="min-h-12 flex-1 resize-none rounded-xl border border-line bg-bg px-3 py-2 text-[14px] leading-snug" />
              <button type="submit" aria-label="Send answer" className="flex size-12 shrink-0 items-center justify-center self-end rounded-xl bg-signal text-on-primary"><I.Send size={19} /></button>
            </form>
          </>
        )}
      </div>
    </>
  )
}

function Drill({ rank, night, onDone }: { rank: string; night: boolean; onDone: () => void }) {
  const cards = useMemo(() => {
    const rel = RANK_TOPICS[rank] || RANK_TOPICS["2/O"]
    return [...FLASHCARDS].sort((a, b) => Number(rel.includes(b.topic)) - Number(rel.includes(a.topic))).slice(0, 5)
  }, [rank])
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [got, setGot] = useState<boolean[]>([])
  const endRef = useRef<HTMLDivElement>(null)
  const finished = i >= cards.length
  useEffect(() => {
    if (!finished) return
    onDone()
    const t = setTimeout(() => burst(endRef.current, night ? { colors: NIGHT_COLORS } : {}), 250)
    return () => clearTimeout(t)
  }, [finished]) // eslint-disable-line react-hooks/exhaustive-deps
  const answer = (ok: boolean) => {
    setGot((g) => [...g, ok])
    setFlipped(false)
    setI((v) => v + 1)
  }
  if (finished) {
    const n = got.filter(Boolean).length
    return (
      <Scroll className="items-center pt-6 text-center">
        <div ref={endRef} className="flex size-20 items-center justify-center rounded-full bg-sea-soft text-sea"><I.Flame size={36} /></div>
        <h3 className="display text-[24px] font-bold">Drill done</h3>
        <p className="max-w-[30ch] text-[14px] leading-snug text-mute">You knew {n} of {cards.length}. The ones you missed come back first tomorrow.</p>
        <div className="flex w-full flex-col gap-2 text-left">
          {cards.map((c, j) => (
            <div key={c.q} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] leading-snug">
              {got[j] ? <I.Check size={16} className="mt-px shrink-0 text-sea" /> : <I.Refresh size={15} className="mt-px shrink-0 text-signal-ink" />}
              {c.q}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => { setI(0); setGot([]) }} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-[14.5px] font-semibold">
          <I.Refresh size={16} /> Run it again
        </button>
      </Scroll>
    )
  }
  const c = cards[i]
  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pb-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11.5px] text-mute">{c.topic}</span>
        <span className="flex gap-1.5" aria-label={`Card ${i + 1} of ${cards.length}`}>
          {cards.map((_, j) => <span key={j} className={cn("h-1.5 w-6 rounded-full", j < i ? (got[j] ? "bg-sea" : "bg-signal") : j === i ? "bg-ink" : "bg-line")} />)}
        </span>
      </div>
      <button type="button" onClick={() => setFlipped((f) => !f)} aria-label={flipped ? "Show the question" : "Show the answer"} className="relative flex-1 [perspective:1200px]">
        <motion.div animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }} className="relative size-full [transform-style:preserve-3d]">
          <div className="absolute inset-0 flex flex-col justify-between rounded-[24px] border border-line bg-surface p-6 text-left [backface-visibility:hidden]">
            <span className="font-mono text-[11px] tracking-[0.1em] text-signal-ink uppercase">Question</span>
            <span className="display text-[26px] leading-[1.15] font-bold">{c.q}</span>
            <span className="flex items-center gap-2 text-[13px] text-mute"><I.Refresh size={15} /> Tap to turn over</span>
          </div>
          <div className="absolute inset-0 flex flex-col justify-between rounded-[24px] bg-hero p-6 text-left text-hero-ink [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <span className="font-mono text-[11px] tracking-[0.1em] text-hero-muted uppercase">Answer</span>
            <span className="text-[19px] leading-snug font-medium">{c.a}</span>
            <span className="text-[12px] text-hero-muted">Written for this prototype. Check it against your SMS.</span>
          </div>
        </motion.div>
      </button>
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => answer(false)} className="flex h-[52px] items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-[15px] font-semibold"><I.Refresh size={17} /> Not yet</button>
        <button type="button" onClick={() => answer(true)} className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-on-primary"><I.Check size={18} /> Knew it</button>
      </div>
    </div>
  )
}

/* ---------------- Question bank ---------------- */
type Ratings = Record<string, "yes" | "unsure">
function Bank(p: {
  rank: string; ratings: Ratings; setRatings: (f: (r: Ratings) => Ratings) => void
  saved: string[]; setSaved: (f: (s: string[]) => string[]) => void; topic: Topic | null; setTopic: (t: Topic | null) => void; go: (s: Screen) => void
  mode: "real" | "official"; setMode: (m: "real" | "official") => void
  libDone: Record<string, boolean>; setLibDone: (f: (d: Record<string, boolean>) => Record<string, boolean>) => void; night: boolean
}) {
  const [query, setQuery] = useState("")
  const [mine, setMine] = useState(true)
  const [onlySaved, setOnlySaved] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const rel = RANK_TOPICS[p.rank] || RANK_TOPICS["2/O"]
  const topics = topicCounts().map(([t]) => t).filter((t) => (!mine || rel.includes(t)) && BANK.some((q) => q.topic === t))
  const ql = query.trim().toLowerCase()
  const list = BANK.filter(
    (q) =>
      (!mine || (q.rank ? q.rank === p.rank : rel.includes(q.topic))) &&
      (!p.topic || q.topic === p.topic) &&
      (!onlySaved || p.saved.includes(q.id)) &&
      (!ql || (q.q + " " + q.source + " " + q.topic).toLowerCase().includes(ql))
  )
  const yes = list.filter((q) => p.ratings[q.id] === "yes").length
  const unsure = list.filter((q) => p.ratings[q.id] === "unsure").length
  const { setRatings, setSaved } = p
  const rate = useCallback(
    (id: string, v: "yes" | "unsure") =>
      setRatings((r) => {
        const next = { ...r }
        if (next[id] === v) delete next[id]
        else next[id] = v
        return next
      }),
    [setRatings]
  )
  const hl = (s: string) => {
    if (!ql) return s
    const i = s.toLowerCase().indexOf(ql)
    if (i < 0) return s
    return <>{s.slice(0, i)}<mark className="rounded-[3px] bg-signal-soft px-0.5 text-signal-ink">{s.slice(i, i + ql.length)}</mark>{s.slice(i + ql.length)}</>
  }
  const modeToggle = (
    <div className="px-5 pb-3">
      <div role="tablist" aria-label="Question source" className="grid grid-cols-2 rounded-xl bg-surface-2 p-1">
        {([["real", "Asked in real inspections", I.Chat], ["official", "Official checklist", I.ListCheck]] as const).map(([k, l, Icon]) => (
          <button key={k} role="tab" type="button" aria-selected={p.mode === k} onClick={() => p.setMode(k)} className={cn("relative flex h-11 items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold", p.mode === k ? "text-ink" : "text-mute")}>
            {p.mode === k && <motion.span layoutId="qseg" className="absolute inset-0 rounded-lg bg-surface shadow-sm" />}
            <span className="relative flex items-center gap-1.5"><Icon size={16} />{l}</span>
          </button>
        ))}
      </div>
    </div>
  )
  if (p.mode === "official")
    return (
      <>
        <TopBar title="Questions" right={<CreditPill />} />
        {modeToggle}
        <OfficialChecklist rank={p.rank} done={p.libDone} setDone={p.setLibDone} night={p.night} />
      </>
    )
  return (
    <>
      <TopBar title="Questions" right={<CreditPill />} />
      {modeToggle}
      <div className="flex flex-col gap-2.5 px-5 pb-3">
        <label htmlFor="app-search" className="flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3">
          <I.Search size={17} className="text-mute" />
          <span className="sr-only">Search questions</span>
          <input id="app-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search: radar, UKC, Antwerp…" className="h-full flex-1 bg-transparent text-[14px] outline-none" />
        </label>
        <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5">
          <Chip size="sm" on={mine} onClick={() => setMine(!mine)}>For {p.rank}s</Chip>
          <Chip size="sm" on={onlySaved} onClick={() => setOnlySaved(!onlySaved)}>{p.saved.length ? `Saved (${p.saved.length})` : "Saved"}</Chip>
          {topics.map((t) => <Chip key={t} size="sm" on={p.topic === t} onClick={() => p.setTopic(p.topic === t ? null : t)}>{t}</Chip>)}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <motion.span animate={{ width: `${(yes / Math.max(1, list.length)) * 100}%` }} className="h-2 bg-sea" />
            <motion.span animate={{ width: `${(unsure / Math.max(1, list.length)) * 100}%` }} className="h-2 bg-signal" />
          </div>
          <span className="tnum font-mono text-[11px] text-mute">{list.length} questions · {yes} I can answer · {unsure} not sure</span>
        </div>
      </div>
      <Scroll className="gap-2.5">
        {list.map((q) => {
          const isOpen = open === q.id
          const r = p.ratings[q.id]
          const isSaved = p.saved.includes(q.id)
          return (
            <article key={q.id} className={cn("flex flex-col rounded-2xl border bg-surface transition-colors", r === "yes" ? "border-sea/50" : r === "unsure" ? "border-signal/50" : "border-line")}>
              <div className="flex items-start gap-1 p-3.5 pb-2">
                <TopicBadge topic={q.topic} size={34} />
                <button type="button" onClick={() => setOpen(isOpen ? null : q.id)} aria-expanded={isOpen} className="ml-2 flex min-w-0 flex-1 flex-col gap-1 text-left">
                  <span className="text-[14px] leading-snug font-medium">{hl(q.q)}</span>
                  <span className="font-mono text-[10.5px] text-mute">{q.topic}{q.rank ? ` · asked of ${q.rank}` : ""} · {hl(q.source)}</span>
                </button>
                <button type="button" aria-label={isSaved ? "Remove from saved" : "Save question"} aria-pressed={isSaved} onClick={() => setSaved((s) => (s.includes(q.id) ? s.filter((x) => x !== q.id) : [...s, q.id]))} className={cn("-mt-1 -mr-1 flex size-10 shrink-0 items-center justify-center rounded-lg", isSaved ? "text-signal-ink" : "text-mute")}>
                  <I.Bookmark size={18} fill={isSaved ? "currentColor" : "none"} />
                </button>
              </div>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="mx-3.5 mb-2 flex flex-col gap-1.5 rounded-xl bg-surface-2 p-3">
                      <span className="font-mono text-[10.5px] tracking-[0.08em] text-mute uppercase">What they want to see</span>
                      {TOPIC_EVIDENCE[q.topic].map((e) => (
                        <span key={e} className="flex gap-2 text-[12.5px] leading-snug"><I.Check size={14} className="mt-0.5 shrink-0 text-sea" />{e}</span>
                      ))}
                      {officialFor(q.topic).length > 0 && (
                        <>
                          <span className="mt-2 text-[12px] font-semibold text-mute">Related SIRE 2.0 questions</span>
                          {officialFor(q.topic).map((o) => (
                            <span key={o.n} className="flex gap-2 text-[12.5px] leading-snug">
                              <span className="tnum shrink-0 rounded-md bg-primary-soft px-1.5 font-mono text-[11px] font-semibold text-primary">{o.n}</span>
                              {o.t}
                            </span>
                          ))}
                        </>
                      )}
                      <button type="button" onClick={() => p.go("practice")} className="mt-1 self-start text-[12.5px] font-semibold text-primary">Rehearse with the AI inspector →</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="flex items-center gap-1.5 px-3.5 pb-3">
                <button type="button" aria-pressed={r === "yes"} onClick={() => rate(q.id, "yes")} className={cn("flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold", r === "yes" ? "border-sea bg-sea-soft text-sea" : "border-line text-mute")}>
                  <I.Check size={14} /> I can answer
                </button>
                <button type="button" aria-pressed={r === "unsure"} onClick={() => rate(q.id, "unsure")} className={cn("flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold", r === "unsure" ? "border-signal bg-signal-soft text-signal-ink" : "border-line text-mute")}>
                  Not sure
                </button>
                {!isOpen && <button type="button" onClick={() => setOpen(q.id)} className="ml-auto text-[12px] font-semibold text-mute">What to show</button>}
              </div>
            </article>
          )
        })}
        {!list.length && <p className="pt-6 text-center text-[13px] text-mute">Nothing matches. Clear a filter or try another word.</p>}
      </Scroll>
    </>
  )
}

/* ---------------- Share ---------------- */
const words = (t: string) => new Set(t.toLowerCase().match(/[a-z]{3,}/g) || [])
/** Returns why a debrief can't earn credits yet, or "" if it looks like a real one. */
function debriefProblem(text: string, parsed: ReturnType<typeof structureDebrief>) {
  const mine = words(text), sample = words(SAMPLE_RAW)
  let shared = 0
  for (const w of mine) if (sample.has(w)) shared++
  if (mine.size && shared / mine.size > 0.6) return "That's mostly the example. Write your own debrief to share it."
  if (text.length < 120 || parsed.questions < 2) return "Add a bit more: where it was, who inspected, and what they asked or found. A few lines is enough."
  const facts = [parsed.port !== "Not found", parsed.major !== "Not stated", parsed.date !== "Not found"].filter(Boolean).length
  if (facts < 2) return "Say where and when it was, and who inspected (the oil major), so the next crew can use it."
  const distinct = new Set(text.toLowerCase().split(/[\s,;.]+/).filter((w) => w.length > 3))
  if (distinct.size < 15) return "That doesn't read like a debrief yet. Describe what the inspector asked and checked."
  return ""
}
function Share({ night }: { night: boolean }) {
  const wallet = useWallet()
  const [raw, setRaw] = useState("")
  const [stage, setStage] = useState<"edit" | "working" | "done">("edit")
  const [err, setErr] = useState("")
  const [earned, setEarned] = useState<boolean | null>(null)
  const doneRef = useRef<HTMLDivElement>(null)
  const parsed = useMemo(() => structureDebrief(raw), [raw])
  const status = wallet.share()
  const run = () => {
    const text = raw.trim()
    const problem = debriefProblem(text, parsed)
    if (problem) return setErr(problem)
    setErr("")
    setStage("working")
    setTimeout(() => {
      const ok = wallet.recordShare(text)
      setEarned(ok)
      setStage("done")
      if (ok) setTimeout(() => burst(doneRef.current, night ? { colors: NIGHT_COLORS } : {}), 900)
    }, 1300)
  }
  const fields: [string, string][] = [["Port", parsed.port], ["Oil major", parsed.major], ["Date", parsed.date], ["Area", parsed.area], ["Questions", `${parsed.questions} found`]]
  return (
    <>
      <TopBar title="Share a debrief" right={status.ok ? <span className="tnum mr-1 rounded-full bg-sea-soft px-2 py-1 font-mono text-[11px] font-semibold whitespace-nowrap text-sea">+{EARN.share}</span> : undefined} />
      <Scroll>
        {stage === "edit" ? (
          <>
            <div className="flex gap-2.5 rounded-2xl bg-sea-soft px-4 py-3 text-[13px] leading-snug text-sea">
              <I.Shield size={18} className="shrink-0" />
              <span>Anonymous by design. Your name, the ship and the inspector's name are removed before a moderator sees it.</span>
            </div>
            <p className="text-[13.5px] leading-snug text-mute">
              Paste it the way you'd post it in a group. The next officer facing the same inspection gets the benefit.{" "}
              {status.ok ? `You earn ${EARN.share} credits for each debrief, up to ${EARN.sharePerMonth} a month.` : status.why}
            </p>
            <label htmlFor="app-raw" className="sr-only">Your debrief</label>
            <textarea id="app-raw" value={raw} onChange={(e) => { setRaw(e.target.value); setErr("") }} rows={10} placeholder={"Where and when, who inspected, how long, and what they asked or found.\ne.g. SIRE at Fujairah, 12 Oct, Shell. Bridge 2 hrs: asked for ECDIS safety contour, UKC calc..."} className="rounded-2xl border border-line bg-surface p-3.5 font-mono text-[12.5px] leading-relaxed" />
            {!raw && <button type="button" onClick={() => setRaw(SAMPLE_RAW)} className="self-start text-[12.5px] font-semibold text-primary">See an example</button>}
            {err && <p className="text-[13px] font-medium text-signal-ink">{err}</p>}
            <button type="button" onClick={run} disabled={!raw.trim()} className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-primary text-[15px] font-semibold text-on-primary disabled:opacity-50">
              <I.Cpu size={18} /> Structure it
            </button>
          </>
        ) : stage === "working" ? (
          <div className="flex flex-col items-center gap-4 pt-10">
            <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }} className="flex size-14 items-center justify-center rounded-full border-2 border-line border-t-signal" />
            <TypingAnimation className="font-mono text-[13px] text-mute" duration={30} showCursor={false}>Reading, tagging, removing names…</TypingAnimation>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
              {fields.map(([k, v], i) => (
                <BlurFade key={k} delay={i * 0.12}>
                  <div className="flex justify-between gap-3 px-3.5 py-2.5 text-[13.5px]">
                    <span className="font-mono text-[11.5px] tracking-[0.06em] text-mute uppercase">{k}</span>
                    <span className="text-right font-semibold">{v}</span>
                  </div>
                </BlurFade>
              ))}
            </div>
            <BlurFade delay={0.65}>
              <div className="flex flex-wrap gap-1.5">
                {parsed.topics.map((t) => <span key={t} className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium">{t}</span>)}
              </div>
            </BlurFade>
            <BlurFade delay={0.8}>
              <div className="flex gap-2.5 rounded-xl bg-sea-soft px-3.5 py-3 text-[13px] leading-snug text-sea">
                <I.Shield size={18} className="shrink-0" />
                <span>{parsed.removed.length ? `${parsed.removed.join(" and ")} removed before publishing.` : "No names found. Names are always removed."}</span>
              </div>
            </BlurFade>
            <BlurFade delay={0.95}>
              <div ref={doneRef} className="flex items-center justify-between rounded-2xl border border-line bg-surface px-3.5 py-3">
                <span className="flex flex-col">
                  <span className="text-[14px] font-bold">Sent for review</span>
                  <span className="text-[12px] text-mute">{earned ? "A moderator checks it, usually within a day" : "Thank you. It still helps the next crew"}</span>
                </span>
                {earned ? <span className="tnum display text-[22px] font-bold text-sea">+<NumberTicker value={EARN.share} delay={1} className="text-sea" /></span> : <I.Check size={22} className="text-sea" />}
              </div>
            </BlurFade>
            <p className="text-center text-[12px] text-mute">{earned ? `You now have ${wallet.balance} credits.` : wallet.share().ok ? "" : wallet.share().why}</p>
            <button type="button" onClick={() => { setStage("edit"); setRaw(""); setEarned(null) }} className="h-10 text-[13px] font-semibold text-signal-ink">Share another</button>
          </div>
        )}
      </Scroll>
    </>
  )
}

/* ---------------- Stories ---------------- */
function StoriesScreen({ storyId, setStoryId, rank }: { storyId: number | null; setStoryId: (id: number | null) => void; rank: string }) {
  const wallet = useWallet()
  const prog = useProgress()
  const [filter, setFilter] = useState<"all" | "reports" | "channel" | "mine" | "clean" | "negatives">("all")
  const openId = storyId
  const openUnlocked = openId != null && STORIES.some((x) => x.d.id === openId) && wallet.isUnlocked(openId)
  useEffect(() => {
    if (openId != null && openUnlocked) prog.readStory(openId)
  }, [openId, openUnlocked]) // eslint-disable-line react-hooks/exhaustive-deps
  if (storyId != null && !STORIES.some((x) => x.d.id === storyId)) {
    return (
      <>
        <TopBar title="Story" onBack={() => setStoryId(null)} />
        <Scroll className="items-center gap-3 pt-10 text-center">
          <IconTile icon={I.Newspaper} color="slate" size={56} />
          <p className="text-[15px] font-semibold">That story isn't here any more.</p>
          <button type="button" onClick={() => setStoryId(null)} className="h-11 rounded-xl bg-primary px-5 text-[14px] font-semibold text-on-primary">See all stories</button>
        </Scroll>
      </>
    )
  }
  if (storyId != null) {
    const s = storyById(storyId)
    const unlocked = wallet.isUnlocked(s.d.id)
    return (
      <>
        <TopBar title="Story" onBack={() => setStoryId(null)} right={<CreditPill />} />
        <Scroll className="pt-2 pb-10">
          <StoryReader
            s={s}
            size="md"
            locked={!unlocked}
            unlockSlot={
              <div className="flex w-full flex-col items-center gap-2 px-2">
                <button type="button" onClick={() => wallet.unlock(s.d.id)} className="flex h-12 w-full max-w-[340px] items-center justify-between rounded-xl bg-primary px-5 text-[15px] font-semibold text-on-primary">
                  Read the full story <CostTag cost={COSTS.story} />
                </button>
                <span className="text-[12px] text-mute">Unlocked stories stay yours. You have {wallet.balance} credits.</span>
                <button type="button" onClick={() => wallet.openPlans({ reason: "Every inspection story is included with Watchkeeper, Command and the Voyage pass.", select: "watch" })} className="text-[12.5px] font-semibold text-primary">Or read them all with a plan →</button>
              </div>
            }
          />
        </Scroll>
      </>
    )
  }
  const list = STORIES.filter((s) =>
    filter === "all" ? true
      : filter === "reports" ? s.d.src === "report"
      : filter === "channel" ? s.d.src !== "report"
      : filter === "mine" ? s.d.questions.some((q) => (q.who || s.d.rank) === rank)
      : filter === "clean" ? s.resultTone === "good"
      : s.resultTone === "bad"
  )
  return (
    <>
      <TopBar title="Inspection stories" right={<CreditPill />} />
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-5 pb-3">
        {([["all", `All ${STORIES.length}`], ["reports", "Inspection reports"], ["channel", "Crew debriefs"], ["mine", `Asked of ${rank}s`], ["clean", "Clean results"], ["negatives", "With observations"]] as const).map(([k, l]) => (
          <Chip key={k} size="sm" on={filter === k} onClick={() => setFilter(k)}>{l}</Chip>
        ))}
      </div>
      <Scroll className="gap-2.5">
        <p className="text-[13px] leading-snug text-mute">{REPORT_STORIES.length} inspection reports with the attending superintendent's notes, and {CHANNEL_STORIES.length} crew debriefs from the SIRE 2.0 channel. {wallet.perks.allStories ? "Every story is included in your plan." : `Previews are free, three stories are always free, and one more is free each week. Any other story is ${COSTS.story} credits and stays yours.`} The first read of each earns 20 XP.</p>
        {!wallet.perks.allStories && (
          <button type="button" onClick={() => setStoryId(storyOfTheWeek())} className="flex items-center gap-3 rounded-2xl border border-[#ffd2b0] bg-[#fff6ee]/85 px-3.5 py-3 text-left">
            <IconTile icon={I.Gift} color="orange" size={34} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[12px] font-semibold text-[#c2410c]">Free this week</span>
              <span className="truncate text-[13.5px] font-bold">{storyById(storyOfTheWeek()).headline}</span>
            </span>
            <I.ArrowRight size={16} className="text-mute" />
          </button>
        )}
        {list.map((s) => (
          <StoryCard key={s.d.id} s={s} locked={!wallet.isUnlocked(s.d.id)} onClick={() => setStoryId(s.d.id)} />
        ))}
        {!list.length && <p className="pt-6 text-center text-[13px] text-mute">No stories match yet.</p>}
      </Scroll>
    </>
  )
}

/* ---------------- Official checklist (rank-wise) ---------------- */
function OfficialChecklist({ rank, done, setDone, night }: { rank: string; done: Record<string, boolean>; setDone: (f: (d: Record<string, boolean>) => Record<string, boolean>) => void; night: boolean }) {
  const r = rank
  const list = libForRank(r)
  const shore = isShore(r)
  const ready = list.filter((q) => done[q.n]).length
  const chapters = [...new Set(list.map((q) => chapterOf(q.n)))]
  const [open, setOpen] = useState<string | null>(chapters[0] ?? null)
  const ref = useRef<HTMLDivElement>(null)
  const toggle = (n: string) =>
    setDone((d) => {
      const next = { ...d }
      if (next[n]) delete next[n]
      else next[n] = true
      const nowReady = list.filter((q) => next[q.n]).length
      if (nowReady === list.length) burst(ref.current, night ? { colors: NIGHT_COLORS } : {})
      return next
    })
  return (
    <Scroll className="gap-3">
      <div ref={ref} className="flex items-center gap-4 rounded-[22px] border border-[#d6e7fb] bg-primary-soft p-4">
        <AnimatedCircularProgressBar value={Math.round((ready / Math.max(1, list.length)) * 100)} gaugePrimaryColor="var(--primary)" gaugeSecondaryColor="rgba(11,107,203,0.14)" className="size-[76px] shrink-0 text-[17px] text-ink" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[16px] font-bold">{ready} of {list.length} ready</span>
          <span className="text-[13px] leading-snug text-mute">{shore ? `SIRE 2.0 questions a ${RANK_NAMES[r] || r} usually looks after. Tick each one your ships could show evidence for today.` : `SIRE 2.0 questions a ${RANK_NAMES[r] || r} usually covers. Tick each one you could answer and show evidence for today.`}</span>
        </div>
      </div>
      {chapters.map((c) => {
        const qs = list.filter((q) => chapterOf(q.n) === c)
        const n = qs.filter((q) => done[q.n]).length
        const isOpen = open === c
        const sections = [...new Set(qs.map((q) => sectionOf(q.n)))]
        return (
          <section key={c} className="overflow-hidden rounded-2xl border border-line bg-surface">
            <button type="button" onClick={() => setOpen(isOpen ? null : c)} aria-expanded={isOpen} className="flex w-full items-center gap-3 p-3.5 text-left">
              <ChapterBadge ch={c} size={40} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-bold">{CHAPTERS[c]}</span>
                <span className="text-[12.5px] text-mute">Chapter {c} · {n} of {qs.length} ready</span>
              </span>
              <span className="h-1.5 w-14 shrink-0 rounded-full bg-surface-2"><span className="block h-1.5 rounded-full bg-sea" style={{ width: `${(n / qs.length) * 100}%` }} /></span>
              <motion.span animate={{ rotate: isOpen ? 90 : 0 }} className="text-mute"><I.ArrowRight size={16} /></motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                  <div className="flex flex-col gap-3 border-t border-line px-3.5 pt-3 pb-3.5">
                    {sections.map((sec) => (
                      <div key={sec} className="flex flex-col gap-1">
                        <span className="text-[12px] font-semibold text-mute">{sec} · {SECTIONS[sec] ?? ""}</span>
                        {qs.filter((q) => sectionOf(q.n) === sec).map((q) => (
                          <button key={q.n} type="button" role="checkbox" aria-checked={!!done[q.n]} onClick={() => toggle(q.n)} className="flex min-h-11 items-center gap-3 rounded-xl px-1.5 py-2 text-left hover:bg-surface-2">
                            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors", done[q.n] ? "border-sea bg-sea text-white" : "border-line")}>
                              {done[q.n] && <I.Check size={14} />}
                            </span>
                            <span className="tnum w-[52px] shrink-0 font-mono text-[11.5px] font-semibold text-primary">{q.n}</span>
                            <span className={cn("text-[13.5px] leading-snug", done[q.n] && "text-mute")}>{q.t}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )
      })}
      <p className="px-1 text-[12px] leading-relaxed text-mute">
        Question numbers and short titles from the SIRE 2.0 Question Library (OCIMF). Who covers what follows the usual division of duties; your company's SMS may split them differently. Read the full questions and guidance in{" "}
        <a href={OCIMF_URL} target="_blank" rel="noreferrer" className="font-semibold text-primary underline-offset-2 hover:underline">OCIMF's library</a>.
      </p>
    </Scroll>
  )
}
