import { Component, forwardRef, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { HOSTED } from "@/ai"
import { AnimatePresence, motion } from "motion/react"

import { AnimatedBeam } from "@/components/magicui/animated-beam"
import { AnimatedShinyText } from "@/components/magicui/animated-shiny-text"
import { BorderBeam } from "@/components/magicui/border-beam"
import { DotPattern } from "@/components/magicui/dot-pattern"
import { Globe } from "@/components/magicui/globe"
import { Iphone } from "@/components/magicui/iphone"
import { MagicCard } from "@/components/magicui/magic-card"
import { Marquee } from "@/components/magicui/marquee"
import { NumberTicker } from "@/components/magicui/number-ticker"
import { WordRotate } from "@/components/magicui/word-rotate"
import * as I from "@/components/icons"
import { CARDS, KIT_TOTAL, OBS } from "@/fleet"
import { Logo } from "@/components/Brand"
import { PhoneApp, STORAGE_KEYS, ScaledScreen, type Screen } from "@/components/PhoneApp"
import { useTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { DEBRIEFS, PORTS, STATS, fmtCoord, fmtDate, placeLabel } from "@/data"

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="flex items-center gap-2 text-[14px] font-semibold text-signal-ink"><span className="size-1.5 rounded-full bg-hero-accent" />{children}</span>
}

export function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex max-w-[760px] flex-col gap-3">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="display text-[clamp(1.9rem,3.6vw,2.9rem)] leading-[1.05] font-bold">{title}</h2>
      {children && <p className="max-w-[62ch] text-[17px] leading-relaxed text-mute">{children}</p>}
    </div>
  )
}

export function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [q])
  return m
}

/* ---------------- Nav ---------------- */
export function Nav() {
  return (
    <header className="gutter sticky top-[env(safe-area-inset-top,0px)] z-50 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-2.5 no-underline">
          <Logo size={36} />
          <span className="hidden rounded-full border border-line px-2 py-0.5 font-mono text-[10.5px] text-mute sm:inline">prototype</span>
        </a>
        <nav aria-label="Sections" className="hidden items-center gap-7 text-[14px] font-medium text-mute md:flex">
          <a className="hover:text-ink" href="#features">For officers</a>
          <a className="hover:text-ink" href="#insights">Insights</a>
          <a className="hover:text-ink" href="#fleet">For ship managers</a>
          <a className="hover:text-ink" href="#model">Who pays</a>
        </nav>
        <a href="#waitlist" className="rounded-full bg-primary px-4 py-2 text-[13.5px] font-semibold text-on-primary no-underline">Join waitlist</a>
      </div>
    </header>
  )
}

/* ---------------- Globe (used in Insights) ---------------- */
class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function GlobeCard() {
  const { systemTheme } = useTheme()
  const dark = systemTheme === "dark"
  const config = useMemo(
    () => ({
      width: 800, height: 800, onRender: () => {}, devicePixelRatio: 2, phi: 0, theta: 0.28,
      dark: dark ? 1 : 0, diffuse: dark ? 1.1 : 0.5, mapSamples: 16000, mapBrightness: dark ? 4.5 : 1.25, mapBaseBrightness: 0,
      baseColor: (dark ? [0.12, 0.2, 0.3] : [1, 1, 1]) as [number, number, number],
      markerColor: [232 / 255, 89 / 255, 12 / 255] as [number, number, number],
      glowColor: (dark ? [0.1, 0.18, 0.3] : [0.92, 0.95, 1]) as [number, number, number],
      markers: PORTS.map((d) => ({ location: d.coords as [number, number], size: d.negatives ? 0.09 : 0.055 })),
    }),
    [dark]
  )
  const feed = useMemo(() => [...PORTS].sort((a, b) => b.date.localeCompare(a.date)), [])
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % feed.length), 2800)
    return () => clearInterval(t)
  }, [feed.length])
  const d = feed[i]
  const hasGL = useMemo(() => {
    try {
      const c = document.createElement("canvas")
      return !!(c.getContext("webgl") || c.getContext("experimental-webgl"))
    } catch {
      return false
    }
  }, [])
  const fallback = (
    <div aria-hidden="true" className="absolute inset-[6%] overflow-hidden rounded-full border border-line bg-surface">
      <DotPattern width={14} height={14} cr={1.2} className="text-ink/25" />
    </div>
  )
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[420px]">
      {hasGL ? (
        <Boundary fallback={fallback}>
          <Globe config={config} className="max-w-none" />
        </Boundary>
      ) : (
        fallback
      )}
      <div className="pointer-events-none absolute right-0 bottom-1 left-0 flex justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={d.id}
            initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
            transition={{ duration: 0.35 }}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface/90 px-4 py-2.5 shadow-lg backdrop-blur"
          >
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-signal" />
            </span>
            <span className="flex flex-col">
              <span className="text-[14px] font-semibold">{placeLabel(d)}</span>
              <span className="font-mono text-[11px] text-mute">{fmtCoord(d.coords!)} · {fmtDate(d.date)}{d.major ? ` · ${d.major}` : ""}</span>
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ---------------- Live app frame ---------------- */
function AppFrame({ children, framed }: { children: ReactNode; framed: boolean }) {
  if (framed)
    return (
      <div className="mx-auto w-full max-w-[370px] drop-shadow-[0_30px_50px_rgba(16,35,58,0.12)]">
        <Iphone>
          <ScaledScreen>{children}</ScaledScreen>
        </Iphone>
      </div>
    )
  // On a phone, show the app itself, not a phone inside a phone.
  return (
    <div className="mx-auto aspect-[390/844] w-full max-w-[430px] overflow-hidden rounded-[30px] border border-line shadow-[0_20px_50px_-20px_rgba(16,35,58,0.12)]">
      <ScaledScreen>{children}</ScaledScreen>
    </div>
  )
}

const TOUR: { label: string; hint: string; screen?: Screen; reset?: boolean; night?: boolean; icon: ReactNode }[] = [
  { label: "Set up in two taps", hint: "Pick your rank or role", reset: true, icon: <I.Users size={17} /> },
  { label: "Build a brief", hint: "Oil major, port, rank", screen: "setup", icon: <I.Clipboard size={17} /> },
  { label: "Rehearse with an AI inspector", hint: "Feedback on each answer", screen: "practice", icon: <I.Mic size={17} /> },
  { label: "Photo-check an area", hint: "What an inspector would flag", screen: "photo", icon: <I.Camera size={17} /> },
  { label: "Ten flashcards a day", hint: "Spaced repetition and a streak", screen: "drill", icon: <I.Flame size={17} /> },
  { label: "Share a debrief", hint: "Anonymous, earns briefs", screen: "share", icon: <I.Plus size={17} /> },
]

/* ---------------- Hero with the live app ---------------- */
const ROTATE_PORTS = ["Durres", "Antwerp", "Fujairah", "Houston", "Mollendo", "Tema", "Singapore"]

export function Experience() {
  const [screen, setScreen] = useState<Screen>("today")
  const [night, setNight] = useState(false)
  const [appKey, setAppKey] = useState(0)
  const appRef = useRef<HTMLDivElement>(null)
  const narrow = useMedia("(max-width: 1023px)")
  const framed = useMedia("(min-width: 640px)")

  const run = (t: (typeof TOUR)[number]) => {
    if (t.reset) {
      for (const k of STORAGE_KEYS) {
        try { localStorage.removeItem(k) } catch { /* ignore */ }
      }
      setAppKey((k) => k + 1)
      setScreen("today")
    }
    if (t.screen) setScreen(t.screen)
    if (narrow) appRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const activeIdx = TOUR.findIndex((t) => t.screen && (t.screen === screen || (t.screen === "setup" && (screen === "loading" || screen === "brief"))))

  const app = (
    <PhoneApp key={appKey} screen={screen} go={setScreen} night={night} setNight={setNight} framed={framed} />
  )

  return (
      <section id="top" className="gutter relative overflow-hidden">
        <DotPattern width={22} height={22} cr={1} className="text-ink/15 [mask-image:radial-gradient(700px_circle_at_75%_35%,white,transparent)]" />
        <div className="relative mx-auto grid max-w-[1180px] items-start gap-10 pt-10 pb-14 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-16 lg:pt-14">
          <div className="flex flex-col gap-6">
            <a href="#insights" className="group w-fit rounded-full border border-line bg-surface px-4 py-1.5 text-[13px] no-underline">
              <AnimatedShinyText className="inline-flex items-center gap-1.5 text-mute">
                Built from {STATS.debriefs} real debriefs in a 15K-follower SIRE 2.0 channel
                <I.ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </AnimatedShinyText>
            </a>
            <h1 className="display text-[clamp(2.4rem,5.2vw,4.1rem)] leading-[1.02] font-bold">
              Walk into your next SIRE inspection knowing what they'll ask at{" "}
              <WordRotate words={ROTATE_PORTS} duration={2200} className="text-signal-ink" />
            </h1>
            <p className="max-w-[54ch] text-[18px] leading-relaxed text-mute">
              A brief for your oil major, port and rank. The records to have ready. An AI inspector to rehearse with, a photo check for the spaces they'll walk, and five minutes of drills a day. All built from what officers were actually asked.
            </p>

            <div className="flex flex-col gap-3">
              <span className="font-mono text-[11.5px] tracking-[0.12em] text-mute uppercase">Try it now, it's live</span>
              <ol className="grid gap-2 sm:grid-cols-2">
                {TOUR.map((t, i) => (
                  <li key={t.label}>
                    <button
                      type="button"
                      onClick={() => run(t)}
                      aria-pressed={activeIdx === i}
                      className={cn(
                        "relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-3 text-left transition-colors",
                        activeIdx === i ? "border-transparent bg-surface shadow-[0_10px_30px_-16px_rgba(16,35,58,0.12)]" : "border-line hover:bg-surface/70"
                      )}
                    >
                      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", activeIdx === i ? "bg-signal text-white" : "bg-surface-2 text-ink")}>{t.icon}</span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[14.5px] leading-tight font-semibold">{t.label}</span>
                        <span className="text-[12.5px] text-mute">{t.hint}</span>
                      </span>
                      {activeIdx === i && <BorderBeam size={70} duration={6} colorFrom="#0b6bcb" colorTo="#f26b1d" borderWidth={1.5} />}
                    </button>
                  </li>
                ))}
                <li className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={() => { setNight(!night); if (narrow) appRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) }}
                    aria-pressed={night}
                    className={cn("flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors", night ? "border-[#e8382b] bg-[#0b0000] text-[#ff4f42]" : "border-line hover:bg-surface/70")}
                  >
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", night ? "bg-[#240402]" : "bg-surface-2")}><I.Moon size={17} /></span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[14.5px] leading-tight font-semibold">{night ? "Night-watch mode is on" : "Night-watch mode"}</span>
                      <span className={cn("text-[12.5px]", night ? "text-[#b3342b]" : "text-mute")}>Dim red display that keeps your night vision on the bridge</span>
                    </span>
                  </button>
                </li>
              </ol>
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 sm:grid-cols-4">
              {[
                { v: STATS.debriefs, l: "crew debriefs" },
                { v: STATS.questions, l: "real questions" },
                { v: STATS.ports, l: "named ports" },
                { v: STATS.majors, l: "oil majors & bodies" },
              ].map((s) => (
                <div key={s.l} className="flex flex-col gap-0.5">
                  <dt className="order-2 text-[13px] text-mute">{s.l}</dt>
                  <dd className="tnum display order-1 text-[30px] leading-none font-bold"><NumberTicker value={s.v} className="text-ink" /></dd>
                </div>
              ))}
            </dl>
          </div>

          <div ref={appRef} id="live-app" className="scroll-mt-20">
            <AppFrame framed={framed}>{app}</AppFrame>
          </div>
        </div>
      </section>
  )
}

/* ---------------- Marquee ---------------- */
export function QuestionMarquee() {
  const qs = DEBRIEFS.flatMap((d) => d.questions.filter((q) => q.q.length < 70).slice(0, 2).map((q) => ({ q: q.q, where: d.port === "Port not stated" ? d.country || "Port n/s" : d.port, major: d.major })))
  const half = Math.ceil(qs.length / 2)
  const Row = ({ items, reverse }: { items: typeof qs; reverse?: boolean }) => (
    <Marquee pauseOnHover reverse={reverse} className="[--duration:70s] [--gap:0.75rem]">
      {items.map((x) => (
        <figure key={x.q + x.where} className="flex items-center gap-3 rounded-full border border-line bg-surface px-4 py-2.5 whitespace-nowrap">
          <blockquote className="text-[14px]">“{x.q}”</blockquote>
          <figcaption className="font-mono text-[11px] text-mute">{x.where}{x.major ? ` · ${x.major}` : ""}</figcaption>
        </figure>
      ))}
    </Marquee>
  )
  return (
    <section aria-label="Questions inspectors asked" className="relative flex flex-col gap-1 border-y border-line bg-surface-2/60 py-5">
      <Row items={qs.slice(0, half)} />
      <Row items={qs.slice(half)} reverse />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-linear-to-r from-bg to-transparent sm:w-32" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-linear-to-l from-bg to-transparent sm:w-32" />
    </section>
  )
}

/* ---------------- Value for officers ---------------- */
export function Features() {
  const items = [
    { icon: <I.Book size={20} />, tile: "tile-blue", title: "Real questions, sorted for you", body: `${STATS.questions} questions from real inspections plus ${CARDS.length} rank-wise flashcards with model answers. Your weak spots come up first.` },
    { icon: <I.Radar size={20} />, tile: "tile-indigo", title: "See where findings land", body: `${OBS.length} real observations, sorted by chapter, type and cause, each with a one-line fix.` },
    { icon: <I.Mic size={20} />, tile: "tile-violet", title: "Rehearse out loud", body: "The AI inspector asks what was asked of your rank and checks your answer for the fact, the procedure and the record." },
    { icon: <I.Flame size={20} />, tile: "tile-orange", title: "Five minutes a day", body: "Three daily missions, a streak with freezes, XP and levels. Cards you miss come back first. Fits between watches." },
    { icon: <I.Briefcase size={20} />, tile: "tile-amber", title: "Ready kit for the ship", body: `${KIT_TOTAL} pre-inspection checks: the drill matrix, rest-hour cross-checks, cyber evidence, photo rules and CDI prep.` },
    { icon: <I.Moon size={20} />, tile: "tile-slate", title: "Built for watchkeeping", body: HOSTED ? "Night-watch mode keeps your night vision. Practise without signing up, and we never ask for your ship. Sign in with Google only for the AI and to sync." : "Night-watch mode keeps your night vision. Anonymous by design: no sign-up, no name, no ship." },
  ]
  return (
    <section id="features" className="gutter scroll-mt-20 py-20">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-10">
        <SectionHead eyebrow="For officers" title="Everything you'd want from a senior who's sat through fifty inspections.">
          Debriefs in a WhatsApp channel help, but they scroll away. NilObs keeps every one, sorts it for your job and turns it into practice.
        </SectionHead>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((x) => (
            <MagicCard key={x.title} gradientColor="rgba(11,107,203,0.06)" gradientFrom="#0b6bcb" gradientTo="#f26b1d" className="rounded-3xl">
              <div className="flex h-full flex-col gap-3 p-6">
                <span className={cn("gloss flex size-11 items-center justify-center rounded-[14px]", x.tile)}>{x.icon}</span>
                <h3 className="text-[18px] font-bold">{x.title}</h3>
                <p className="text-[15px] leading-relaxed text-mute">{x.body}</p>
              </div>
            </MagicCard>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------------- How it works (Animated beams) ---------------- */
const Node = forwardRef<HTMLDivElement, { icon: ReactNode; label: string; sub?: string; big?: boolean; tone?: "signal" | "sea" | "plain" }>(
  ({ icon, label, sub, big, tone = "plain" }, ref) => (
    <div className="flex w-[88px] flex-col items-center gap-2 text-center sm:w-[132px]">
      <div
        ref={ref}
        className={cn(
          "z-10 flex items-center justify-center rounded-full border-2 bg-surface shadow-[0_0_24px_-10px_rgba(0,0,0,0.35)]",
          big ? "size-20 sm:size-24" : "size-14 sm:size-16",
          tone === "signal" ? "border-signal text-signal-ink" : tone === "sea" ? "border-sea text-sea" : "border-line text-ink"
        )}
      >
        {icon}
      </div>
      <span className="text-[12.5px] leading-tight font-semibold sm:text-[14px]">{label}</span>
      {sub && <span className="hidden text-[12px] leading-snug text-mute sm:block">{sub}</span>}
    </div>
  )
)

export function HowItWorks() {
  const box = useRef<HTMLDivElement>(null)
  const a = useRef<HTMLDivElement>(null)
  const b = useRef<HTMLDivElement>(null)
  const c = useRef<HTMLDivElement>(null)
  const ai = useRef<HTMLDivElement>(null)
  const o1 = useRef<HTMLDivElement>(null)
  const o2 = useRef<HTMLDivElement>(null)
  const o3 = useRef<HTMLDivElement>(null)
  const beam = { containerRef: box, pathColor: "var(--muted)", pathOpacity: 0.25, pathWidth: 2, gradientStartColor: "#0b6bcb", gradientStopColor: "#f26b1d" }
  return (
    <section className="gutter py-16">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-10">
        <SectionHead eyebrow="How it works" title="Debriefs in. Briefs, rehearsals and fleet data out.">
          Officers keep posting the way they do now. One AI step turns each post into structured, de-identified data, and a moderator approves it before it goes live.
        </SectionHead>
        <div ref={box} className="chart-grid relative flex items-center justify-between overflow-hidden rounded-3xl border border-line bg-surface px-3 py-10 sm:px-12 sm:py-14">
          <div className="flex flex-col gap-8">
            <Node ref={a} icon={<I.Chat size={24} />} label="WhatsApp debriefs" sub="Officers post after an inspection" />
            <Node ref={b} icon={<I.Archive size={24} />} label="Channel archive" sub="Back to Sep 2024" />
            <Node ref={c} icon={<I.Users size={24} />} label="Fleet uploads" sub="Ship managers add their own" />
          </div>
          <div className="flex flex-col items-center gap-3">
            <Node ref={ai} big tone="signal" icon={<I.Cpu size={34} />} label="Structure & de-identify" sub="Port, major, rank, topic; names removed" />
            <span className="flex items-center gap-1.5 rounded-full bg-sea-soft px-3 py-1 text-[11.5px] font-semibold text-sea"><I.Shield size={14} /> Moderator approves</span>
          </div>
          <div className="flex flex-col gap-8">
            <Node ref={o1} tone="sea" icon={<I.Clipboard size={24} />} label="Briefs & question bank" sub="For officers" />
            <Node ref={o2} tone="sea" icon={<I.Mic size={24} />} label="Mock interviews & drills" sub="AI plays the inspector" />
            <Node ref={o3} tone="sea" icon={<I.Gauge size={24} />} label="Fleet console" sub="For ship managers" />
          </div>
          <AnimatedBeam {...beam} fromRef={a} toRef={ai} curvature={-40} duration={4} />
          <AnimatedBeam {...beam} fromRef={b} toRef={ai} duration={4} delay={0.6} />
          <AnimatedBeam {...beam} fromRef={c} toRef={ai} curvature={40} duration={4} delay={1.2} />
          <AnimatedBeam {...beam} fromRef={ai} toRef={o1} curvature={-40} duration={4} delay={2} />
          <AnimatedBeam {...beam} fromRef={ai} toRef={o2} duration={4} delay={2.5} />
          <AnimatedBeam {...beam} fromRef={ai} toRef={o3} curvature={40} duration={4} delay={3} />
        </div>
      </div>
    </section>
  )
}
