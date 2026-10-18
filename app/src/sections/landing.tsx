import { useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"

import { AnimatedShinyText } from "@/components/magicui/animated-shiny-text"
import { BlurFade } from "@/components/magicui/blur-fade"
import { BorderBeam } from "@/components/magicui/border-beam"
import { DotPattern } from "@/components/magicui/dot-pattern"
import { Iphone } from "@/components/magicui/iphone"
import { MagicCard } from "@/components/magicui/magic-card"
import { NumberTicker } from "@/components/magicui/number-ticker"
import { Ripple } from "@/components/magicui/ripple"
import { ShimmerButton } from "@/components/magicui/shimmer-button"
import { WordRotate } from "@/components/magicui/word-rotate"
import * as I from "@/components/icons"
import { ScaledScreen } from "@/components/PhoneApp"
import { StoryCard, StoryReader } from "@/components/StoryViews"
import { COSTS, EARN, PACKS, WELCOME_CREDITS, inr } from "@/credits"
import { cn } from "@/lib/utils"
import { useNav } from "@/nav"
import { BANK, STATS, TOPIC_EVIDENCE } from "@/data"
import { CHAPTERS, chaptersForRank, libForRank } from "@/library"
import { ChapterBadge, TopicBadge } from "@/components/topicIcons"
import { LESSONS, STORIES, storyById } from "@/stories"
import { CARDS, KIT_TOTAL, OBS } from "@/fleet"
import { IconTile } from "@/components/topicIcons"
import { BRAND, Logo, LogoMark, Wordmark } from "@/components/Brand"
import { LevelRing, MissionsCard, StreakPill } from "@/components/AppPlus"
import { SectionHead } from "./top"

/* ---------------- Nav ---------------- */
export function SiteNav() {
  const { openApp } = useNav()
  return (
    <header className="gutter sticky top-[env(safe-area-inset-top,0px)] z-50 border-b border-white/70 bg-white/75 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-4">
        <a href="#top" aria-label="NilObs home" className="flex items-center gap-3 no-underline">
          <Logo size={36} />
          <span className="hidden border-l border-line pl-3 text-[13px] font-semibold text-signal-ink lg:inline">{BRAND.tagline}</span>
        </a>
        <nav aria-label="Sections" className="hidden items-center gap-7 text-[14px] font-medium text-mute md:flex">
          <a className="hover:text-ink" href="#spot">Play</a>
          <a className="hover:text-ink" href="#ai">AI</a>
          <a className="hover:text-ink" href="#radar">Radar</a>
          <a className="hover:text-ink" href="#stories">Stories</a>
          <a className="hover:text-ink" href="#pricing">Pricing</a>
          <a className="hover:text-ink" href="#fleet">For ship managers</a>
        </nav>
        <button type="button" onClick={() => openApp()} className="flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-[13.5px] font-semibold text-on-primary">
          Start free <span className="hidden sm:inline">· {WELCOME_CREDITS} credits</span>
        </button>
      </div>
    </header>
  )
}

/* ---------------- Hero ---------------- */
const ROTATE_PORTS = ["Rotterdam", "Ulsan", "Durres", "Map Ta Phut", "Fujairah", "Houston", "Abidjan", "Singapore"]

function HeroPhone() {
  const noop = () => {}
  return (
    <div className="relative mx-auto w-full max-w-[330px]">
      <div aria-hidden="true" className="pointer-events-none drop-shadow-[0_40px_60px_rgba(16,35,58,0.18)] select-none">
        <Iphone>
          <ScaledScreen>
            <div className="phone-aurora flex h-[844px] w-[390px] flex-col gap-4 px-5 font-sans text-ink">
              <div className="h-[46px] shrink-0" />
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <LogoMark size={34} />
                  <Wordmark height={19} />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="tnum flex h-9 items-center gap-1 rounded-full border border-[#ffd2b0] bg-[#fff1e5]/80 px-2.5 font-mono text-[12.5px] font-semibold text-[#c2410c]"><I.Flame size={15} className="fill-[#ffb547]" />7</span>
                  <span className="tnum flex h-9 items-center gap-1 rounded-full border border-line bg-surface px-2.5 font-mono text-[12px] font-semibold"><I.Coin size={14} />105</span>
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="display text-[24px] leading-tight font-bold">Good evening, Second Officer</span>
                <span className="text-[13px] text-mute">Level 3 · Officer of the watch</span>
              </div>
              <div className="glass-deep flex flex-col gap-3 rounded-[24px] p-4">
                <span className="text-[11.5px] font-semibold tracking-[0.06em] text-white/60 uppercase">Today's missions</span>
                {([["Review 10 flashcards", 10, 10, "green", I.Check], ["Answer 5 in Spot the observation", 3, 5, "orange", I.Target], ["Read 1 inspection story", 0, 1, "violet", I.Newspaper]] as const).map(([l, v, t, c, Ic]) => (
                  <span key={l} className="flex items-center gap-3 rounded-2xl bg-white/[0.07] px-3 py-2.5">
                    <IconTile icon={Ic} color={c} size={32} />
                    <span className="flex flex-1 flex-col gap-1.5">
                      <span className="text-[13px] font-semibold text-white">{l}</span>
                      <span className="h-1.5 rounded-full bg-white/15"><span className="block h-full rounded-full bg-gradient-to-r from-[#ffb547] to-[#ff6a2b]" style={{ width: `${(v / t) * 100}%` }} /></span>
                    </span>
                    <span className="font-mono text-[11.5px] text-white/70">{v}/{t}</span>
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {([["Spot the observation", "Free", I.Target, "orange"], ["Flashcards", "6 due today", I.Layers, "blue"], ["Observation radar", "Free", I.Radar, "indigo"], ["Ready kit", `${KIT_TOTAL} checks`, I.Briefcase, "amber"]] as const).map(([l, s, Ic, c]) => (
                  <span key={l} className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-surface p-3.5">
                    <IconTile icon={Ic} color={c} size={38} />
                    <span className="flex flex-col">
                      <span className="text-[13.5px] leading-tight font-bold">{l}</span>
                      <span className="text-[11.5px] text-mute">{s}</span>
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </ScaledScreen>
        </Iphone>
      </div>
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0, y: [0, -6, 0] }}
        transition={{ opacity: { delay: 0.6 }, x: { delay: 0.6 }, y: { repeat: Infinity, duration: 5, ease: "easeInOut" } }}
        className="glass absolute top-[56%] -left-8 hidden w-[218px] flex-col gap-2 rounded-2xl p-3.5 sm:flex lg:-left-40"
      >
        <span className="flex items-center gap-2 text-[11px] font-semibold text-mute"><IconTile icon={I.LifeBuoy} color="orange" size={24} />Chapter 5 · Safety management</span>
        <span className="text-[13px] leading-snug font-semibold">Rating unfamiliar with the vessel's fire doors</span>
        <span className="flex items-center gap-1.5 text-[12px] font-bold text-sea"><I.Check size={14} /> Spotted · +19 XP · ×3 combo</span>
      </motion.div>
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0, y: [0, 6, 0] }}
        transition={{ opacity: { delay: 0.9 }, x: { delay: 0.9 }, y: { repeat: Infinity, duration: 6, ease: "easeInOut" } }}
        className="glass-deep absolute -right-6 bottom-[14%] hidden items-center gap-3 rounded-2xl p-3.5 sm:flex lg:-right-20"
      >
        <IconTile icon={I.Award} color="amber" size={42} />
        <span className="flex flex-col">
          <span className="text-[14px] leading-tight font-bold text-white">Badge: Full week</span>
          <span className="text-[11.5px] text-white/70">7-day streak · freeze earned</span>
        </span>
      </motion.div>
    </div>
  )
}

export function LandingHero() {
  const { openApp } = useNav()
  return (
    <section id="top" className="gutter relative overflow-hidden">
      <div className="relative mx-auto grid max-w-[1180px] items-center gap-12 pt-10 pb-14 lg:grid-cols-[minmax(0,1fr)_400px] lg:pt-16">
        <div className="flex flex-col gap-6">
          <a href="#spot" className="glass group w-fit rounded-full px-4 py-1.5 text-[13px] no-underline">
            <AnimatedShinyText className="inline-flex items-center gap-1.5 text-mute">
              New: {OBS.length} real observations to play with
              <I.ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </AnimatedShinyText>
          </a>
          <h1 className="display text-[clamp(2.4rem,5.4vw,4.2rem)] leading-[1.02] font-bold">
            Know what the inspector will ask at{" "}
            <WordRotate words={ROTATE_PORTS} duration={2200} className="bg-gradient-to-r from-[#0b6bcb] to-[#c4410c] bg-clip-text text-transparent" />
          </h1>
          <p className="max-w-[56ch] text-[18px] leading-relaxed text-mute">
            Practise on real SIRE 2.0 findings, rank-wise flashcards and full inspection reports, then rehearse with an AI inspector that grades every answer. Five minutes a day, with missions and streaks that keep you sharp between watches.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <ShimmerButton onClick={() => openApp()} background="linear-gradient(135deg,#1876e0,#0a52a8)" shimmerColor="#cfe6ff" className="h-12 gap-2 px-6 text-[15px] font-semibold">
              Start free with {WELCOME_CREDITS} credits <I.ArrowRight size={17} />
            </ShimmerButton>
            <a href="#spot" className="glass flex h-12 items-center gap-2 rounded-full px-5 text-[15px] font-semibold text-ink no-underline">
              <I.Target size={17} className="text-[#db4f10]" /> Play Spot the observation
            </a>
          </div>
          <p className="text-[13.5px] text-mute">No card, no sign-up. Flashcards, the radar, the ready kit and the game are free every day.</p>
          <dl className="glass mt-1 grid grid-cols-2 gap-x-6 gap-y-4 rounded-[22px] p-5 sm:grid-cols-4">
            {[
              { v: STORIES.length, l: "inspection stories", icon: I.Newspaper, c: "rose" },
              { v: OBS.length, l: "real observations", icon: I.Target, c: "orange" },
              { v: CARDS.length, l: "flashcards", icon: I.Layers, c: "blue" },
              { v: STATS.questions, l: "questions asked", icon: I.Chat, c: "teal" },
            ].map((s) => (
              <div key={s.l} className="flex items-center gap-3">
                <IconTile icon={s.icon} color={s.c as "blue"} size={36} />
                <div className="flex flex-col">
                  <dd className="tnum display text-[24px] leading-none font-bold"><NumberTicker value={s.v} className="text-ink" /></dd>
                  <dt className="text-[12.5px] text-mute">{s.l}</dt>
                </div>
              </div>
            ))}
          </dl>
        </div>
        <HeroPhone />
      </div>
    </section>
  )
}

/* ---------------- Field lessons ---------------- */
const LESSON_ICON: Record<string, [(q: { size?: number }) => ReactNode, string]> = {
  "Documents & SMS": [I.FileText, "tile-blue"],
  Records: [I.ListCheck, "tile-violet"],
  Equipment: [I.Wrench, "tile-orange"],
  Crew: [I.Users, "tile-teal"],
  Radar: [I.Radar, "tile-indigo"],
  UKC: [I.Waves, "tile-sky"],
  PIQ: [I.Camera, "tile-rose"],
  Results: [I.Trophy, "tile-amber"],
  "The day": [I.Clock, "tile-violet"],
}
export function Lessons({ onSource }: { onSource: (id: number) => void }) {
  const [open, setOpen] = useState(0)
  return (
    <section id="lessons" className="gutter scroll-mt-20 py-20">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-10">
        <SectionHead eyebrow="Field lessons" title={`Ten things ${STATS.debriefs} inspections taught us`}>
          Patterns that came up again and again in the crews' debriefs. Each one links to the inspections it came from.
        </SectionHead>
        <div className="grid gap-x-10 gap-y-0 lg:grid-cols-2">
          {LESSONS.map((l, i) => {
            const isOpen = open === i
            return (
              <BlurFade key={l.title} delay={(i % 4) * 0.06} inView className="border-t border-line">
                <button type="button" onClick={() => setOpen(isOpen ? -1 : i)} aria-expanded={isOpen} className="flex w-full items-start gap-4 py-5 text-left">
                  {(() => {
                    const [Icon, tint] = LESSON_ICON[l.tag] ?? [I.Lightbulb, "tile-amber"]
                    return <span className={cn("gloss flex size-11 shrink-0 items-center justify-center rounded-[14px]", tint)} aria-hidden="true"><Icon size={21} /></span>
                  })()}
                  <span className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="flex items-start justify-between gap-3">
                      <span className="flex flex-col gap-0.5">
                        <span className="text-[12px] font-semibold text-mute">{l.tag}</span>
                        <span className="display text-[20px] leading-snug font-bold">{l.title}</span>
                      </span>
                      <motion.span animate={{ rotate: isOpen ? 45 : 0 }} className="mt-1 shrink-0 text-mute"><I.Plus size={20} /></motion.span>
                    </span>
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="flex flex-col gap-3 pb-6 pl-0 sm:pl-[60px]">
                        <p className="text-[16px] leading-relaxed">{l.body}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[12.5px] text-mute">From:</span>
                          {l.sources.map((id) => {
                            const s = storyById(id)
                            return (
                              <button key={id} type="button" onClick={() => onSource(id)} className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12.5px] font-medium hover:border-mute">
                                {[s.d.port !== "Port not stated" ? s.d.port : s.d.country, s.d.major].filter(Boolean).join(" · ")}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </BlurFade>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ---------------- Stories ---------------- */
export function StoriesSection({ selected, setSelected }: { selected: number; setSelected: (id: number) => void }) {
  const { openApp } = useNav()
  const s = storyById(selected)
  const readerRef = useRef<HTMLDivElement>(null)
  const pick = (id: number) => {
    setSelected(id)
    if (window.matchMedia("(max-width: 1023px)").matches) readerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const free = STORIES.filter((x) => x.featured)
  return (
    <section id="stories" className="gutter scroll-mt-20 bg-surface-2/50 py-20">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-10">
        <SectionHead eyebrow="Inspection stories" title="How the inspection actually went">
          {STORIES.length} inspections: full reports with the attending superintendent's notes, and crew debriefs from the SIRE 2.0 channel. The inspector, the day, every question and observation, and what to take from it. {free.length} are free to read here; the rest open in the app.
        </SectionHead>
        <div className="grid items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:max-h-[880px] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:px-0 lg:pr-1">
            {STORIES.map((x) => (
              <div key={x.d.id} className="w-[270px] shrink-0 lg:w-full">
                <StoryCard s={x} active={x.d.id === selected} locked={!x.featured} onClick={() => pick(x.d.id)} />
              </div>
            ))}
          </div>
          <div ref={readerRef} className="relative scroll-mt-24 overflow-hidden rounded-3xl border border-line bg-bg p-5 sm:p-8">
            <AnimatePresence mode="wait">
              <motion.div key={selected} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                <StoryReader
                  s={s}
                  locked={!s.featured}
                  unlockSlot={
                    <div className="flex flex-col items-center gap-2 text-center">
                      <ShimmerButton onClick={() => openApp({ screen: "stories", storyId: s.d.id })} background="#0b6bcb" shimmerColor="#cfe6ff" className="h-12 gap-2 px-6 text-[15px] font-semibold">
                        Read the full story in the app <I.ArrowRight size={16} />
                      </ShimmerButton>
                      <span className="text-[12.5px] text-mute">{COSTS.story} credits. You start with {WELCOME_CREDITS} free.</span>
                    </div>
                  }
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------------- Pricing ---------------- */
function CostRow({ icon, label, sub, cost }: { icon: ReactNode; label: string; sub: string; cost: ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 border-b border-line py-3.5 last:border-0">
      <span className="gloss tile-blue flex size-10 shrink-0 items-center justify-center rounded-xl">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold">{label}</span>
        <span className="text-[13px] text-mute">{sub}</span>
      </span>
      <span className="shrink-0">{cost}</span>
    </div>
  )
}

export function Pricing() {
  const { openApp } = useNav()
  const credit = (n: number) => (
    <span className="tnum inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[12.5px] font-semibold"><I.Coin size={13} />{n}</span>
  )
  return (
    <section id="pricing" className="gutter scroll-mt-20 py-20">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-10">
        <SectionHead eyebrow="Pricing" title={`Start with ${WELCOME_CREDITS} free credits. Pay only for what you use.`}>
          No subscription. Try the app properly first; top up only once it has helped you.
        </SectionHead>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <div className="flex flex-col gap-5 rounded-3xl border border-line bg-surface p-6">
            <div className="flex flex-col">
              <span className="font-mono text-[11.5px] tracking-[0.1em] text-mute uppercase">What credits buy</span>
              <CostRow icon={<I.Clipboard size={19} />} label="Inspection brief" sub="For your oil major, port and rank" cost={credit(COSTS.brief)} />
              <CostRow icon={<I.Mic size={19} />} label="AI inspector" sub="Five questions graded on fact, procedure and record, with follow-ups" cost={credit(COSTS.interview)} />
              <CostRow icon={<I.Newspaper size={19} />} label="Full inspection story" sub="Yours to keep once unlocked" cost={credit(COSTS.story)} />
              <CostRow icon={<I.Layers size={19} />} label="Specialist deck" sub="ECDIS, CDI prep or China coast. Unlock once, keep it" cost={credit(30)} />
              <CostRow icon={<I.Sparkle size={19} />} label="AI question or close-out draft" sub="3 free every day, then per question" cost={credit(2)} />
            </div>
            <div className="flex flex-col gap-2 rounded-2xl bg-sea-soft p-4 text-sea">
              <span className="flex items-center gap-2 text-[14.5px] font-bold"><I.Check size={17} /> Always free</span>
              <span className="text-[13.5px] leading-relaxed">Rank-wise and rating flashcards, Spot the observation, the observation radar, the ready kit, daily missions, the question bank, field lessons and story previews.</span>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line p-4">
              <span className="gloss tile-rose flex size-10 shrink-0 items-center justify-center rounded-xl"><I.Plus size={19} /></span>
              <span className="flex flex-col">
                <span className="text-[15px] font-semibold">Share a debrief, earn {EARN.share} credits. Finish your daily missions, earn 5 more</span>
                <span className="text-[13px] text-mute">Anonymous. Names are removed before anyone sees it.</span>
              </span>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {PACKS.map((p) => (
              <div key={p.id} className={cn("relative flex flex-col gap-4 overflow-hidden rounded-3xl border p-5", p.popular ? "border-transparent bg-hero text-hero-ink" : "border-line bg-surface")}>
                <span className="flex items-center justify-between">
                  <span className="text-[16px] font-bold">{p.name}</span>
                  {p.popular && <span className="rounded-full bg-hero-accent px-2 py-0.5 font-mono text-[10px] font-semibold text-[#1a0a00]">POPULAR</span>}
                </span>
                <span className="flex flex-col">
                  <span className="tnum display text-[34px] leading-none font-bold">{inr(p.price)}</span>
                  <span className={cn("tnum mt-1 font-mono text-[12.5px]", p.popular ? "text-hero-muted" : "text-mute")}>{p.credits.toLocaleString("en-IN")} credits</span>
                </span>
                <span className={cn("text-[13.5px] leading-snug", p.popular ? "text-hero-muted" : "text-mute")}>{p.note}</span>
                <button
                  type="button"
                  onClick={() => openApp({ screen: "wallet", packId: p.id })}
                  className={cn("mt-auto h-11 rounded-xl text-[14px] font-semibold", p.popular ? "bg-hero-accent text-[#1a0a00]" : "border border-line hover:border-mute")}
                >
                  Buy {p.name}
                </button>
                {p.popular && <BorderBeam size={140} duration={8} colorFrom="#0b6bcb" colorTo="#f26b1d" borderWidth={1.5} />}
              </div>
            ))}
            <p className="text-[12.5px] leading-relaxed text-mute sm:col-span-3">Prices are for testing and include GST. Credits don't expire. Ship managers can buy credits for whole crews.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------------- Final CTA ---------------- */
export function FinalCta() {
  const { openApp } = useNav()
  return (
    <section className="gutter relative overflow-hidden py-24">
      <Ripple mainCircleSize={260} numCircles={7} className="[--foreground:var(--line)]" />
      <div className="relative mx-auto flex max-w-[640px] flex-col items-center gap-6 text-center">
        <h2 className="display text-[clamp(1.9rem,4vw,3rem)] leading-[1.05] font-bold">Your next inspection, briefed</h2>
        <p className="max-w-[48ch] text-[17px] leading-relaxed text-mute">Open the app, pick your rank, and spend your first {WELCOME_CREDITS} credits on what matters for your next port.</p>
        <ShimmerButton onClick={() => openApp()} background="#c4410c" shimmerColor="#ffffff" className="h-12 gap-2 px-7 text-[15px] font-semibold">
          Start free <I.ArrowRight size={17} />
        </ShimmerButton>
      </div>
    </section>
  )
}

export function useStorySelection() {
  const [selected, setSelected] = useState(18)
  const jump = (id: number) => {
    setSelected(id)
    requestAnimationFrame(() => document.getElementById("stories")?.scrollIntoView({ behavior: "smooth" }))
  }
  return { selected, setSelected, jump }
}


/* ---------------- 60-second confidence check (free) ---------------- */
const CHECK_RANKS: [string, string][] = [["Master", "Master"], ["C/O", "Chief Officer"], ["2/O", "Second Officer"], ["3/O", "Third Officer"], ["C/E", "Chief Engineer"]]

export function ConfidenceCheck() {
  const { openApp } = useNav()
  const [rank, setRank] = useState("2/O")
  const [can, setCan] = useState<Record<string, boolean>>({})
  const lib = libForRank(rank)
  const chapters = chaptersForRank(rank)
  const maxCh = Math.max(...chapters.map(([, n]) => n))
  const picks = useMemo(() => {
    const seen = new Set<string>()
    return BANK.filter((q) => q.rank === rank)
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((q) => (seen.has(q.topic) ? false : (seen.add(q.topic), true)))
      .slice(0, 5)
  }, [rank])
  const score = picks.filter((q) => can[q.id]).length
  const msg =
    score <= 1 ? "Good start. The app shows you exactly what to prepare for each one." : score <= 3 ? "Solid. Close the gaps with the free daily drill." : "You're ready for these. Now try the full checklist for your rank."
  return (
    <section id="check" className="gutter scroll-mt-20 py-16">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-8">
        <SectionHead eyebrow="Free · 60 seconds · no sign-up" title="How ready are you right now?">
          Pick your rank. See what the SIRE 2.0 library expects of you, and tick the real inspection questions you could answer today.
        </SectionHead>
        <div role="radiogroup" aria-label="Your rank" className="flex flex-wrap gap-2">
          {CHECK_RANKS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={rank === k}
              onClick={() => { setRank(k); setCan({}) }}
              className={cn("h-11 rounded-full border px-4 text-[14px] font-semibold transition-colors", rank === k ? "border-primary bg-primary text-on-primary" : "border-line bg-surface hover:border-mute")}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-6">
            <span className="flex items-center gap-3">
              <span className="tint flex size-11 items-center justify-center rounded-2xl bg-primary-soft text-primary"><I.ListCheck size={22} /></span>
              <span className="flex flex-col">
                <span className="tnum display text-[30px] leading-none font-bold"><NumberTicker key={rank} value={lib.length} className="text-ink" /></span>
                <span className="text-[13.5px] text-mute">SIRE 2.0 questions assigned to your rank</span>
              </span>
            </span>
            <ul className="flex flex-col gap-2.5">
              {chapters.map(([c, n]) => (
                <li key={c} className="flex items-center gap-3">
                  <ChapterBadge ch={c} size={32} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex justify-between gap-2 text-[13.5px]"><span className="truncate font-medium">{CHAPTERS[c]}</span><span className="tnum font-mono text-[12px] text-mute">{n}</span></span>
                    <span className="h-1.5 rounded-full bg-surface-2"><motion.span key={rank + c} initial={{ width: 0 }} animate={{ width: `${(n / maxCh) * 100}%` }} transition={{ duration: 0.6 }} className="block h-1.5 rounded-full bg-primary" /></span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[12px] leading-relaxed text-mute">Rank split from a ship manager's SIRE 2.0 rank-wise sheet. Question numbering from OCIMF's library.</p>
          </div>
          <div className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-6">
            <span className="text-[16px] font-bold">5 questions inspectors actually asked {CHECK_RANKS.find(([k]) => k === rank)?.[1]}s</span>
            <ul className="flex flex-col gap-2">
              {picks.map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={!!can[q.id]}
                    onClick={() => setCan((c) => ({ ...c, [q.id]: !c[q.id] }))}
                    className={cn("flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors", can[q.id] ? "border-sea/50 bg-sea-soft" : "border-line hover:border-mute")}
                  >
                    <TopicBadge topic={q.topic} size={34} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-[14.5px] leading-snug font-medium">{q.q}</span>
                      <span className="text-[12.5px] leading-snug text-mute">Show: {TOPIC_EVIDENCE[q.topic][0]}</span>
                    </span>
                    <span className={cn("mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border-2", can[q.id] ? "border-sea bg-sea text-white" : "border-line")}>{can[q.id] && <I.Check size={14} />}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 rounded-2xl bg-primary-soft p-4">
              <span className="flex items-center justify-between text-[14px] font-bold">
                <span className="flex items-center gap-2"><I.Sparkle size={17} className="text-hero-accent" /> You can answer {score} of {picks.length}</span>
              </span>
              <span className="h-2 rounded-full bg-[rgba(11,107,203,0.14)]"><motion.span animate={{ width: `${(score / Math.max(1, picks.length)) * 100}%` }} className="block h-2 rounded-full bg-primary" /></span>
              <span className="text-[13px] leading-snug text-mute">{msg}</span>
            </div>
            <button type="button" onClick={() => openApp({ screen: "bank", official: true })} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-on-primary">
              Open my full checklist, free <I.ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
