// Landing sections built on the fleet data: a playable Spot the observation, the observation radar,
// and the daily habit loop (missions, streaks, levels, badges, decks).
import { useState, type ReactNode } from "react"
import { motion } from "motion/react"

import * as I from "@/components/icons"
import { ChapterBars, FactorBars, Heatmap, LevelRing, MissionsCard, ObsCard, SpotGame, StreakPill, TypeSplit } from "@/components/AppPlus"
import { IconTile, type TileColor } from "@/components/topicIcons"
import { BENCH, CARDS, CHAPTER_NAMES, DECKS, KIT_TOTAL, OBS, cardsFor } from "@/fleet"
import { BADGES, LEVELS, useProgress } from "@/progress"
import { useNav } from "@/nav"
import { COSTS } from "@/credits"
import { HOSTED } from "@/ai"
import { cn } from "@/lib/utils"
import { SectionHead } from "./top"

/* ---------------- Spot the observation (playable) ---------------- */
export function SpotSection() {
  const { openApp } = useNav()
  const p = useProgress()
  return (
    <section id="spot" className="gutter scroll-mt-20 py-20">
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-24">
          <SectionHead eyebrow="Free · play now" title="Spot the observation">
            Each round is a finding an inspector really wrote up on a tanker this year or last. Guess the SIRE 2.0 chapter or whether it was human, process or hardware. Then see how the crew could have avoided it.
          </SectionHead>
          <ul className="flex flex-col gap-3">
            {([
              [I.Target, "orange", `${OBS.length} real findings`, "SIRE 2.0, CDI and pre-vetting audits from 2025 and 2026"],
              [I.Lightbulb, "teal", "Every round ends with the fix", "One practical line on how to stay out of the report"],
              [I.Zap, "amber", "Combos, XP and a daily mission", "Your score carries over when you open the app"],
            ] as const).map(([Icon, c, t, s]) => (
              <li key={t} className="flex items-center gap-3.5">
                <IconTile icon={Icon} color={c as TileColor} size={44} />
                <span className="flex flex-col">
                  <span className="text-[15.5px] font-bold">{t}</span>
                  <span className="text-[14px] leading-snug text-mute">{s}</span>
                </span>
              </li>
            ))}
          </ul>
          {p.xp > 0 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="glass flex items-center gap-3 self-start rounded-2xl px-3.5 py-2.5">
              <LevelRing size={38} />
              <span className="flex flex-col">
                <span className="tnum text-[14px] font-bold">{p.xp} XP · {p.level.name}</span>
                <span className="text-[12.5px] text-mute">Saved in this browser. Keep going in the app.</span>
              </span>
            </motion.div>
          )}
        </div>
        <div className="glass min-w-0 rounded-[28px] p-4 sm:p-6">
          <SpotGame rounds={5} embedded onExit={() => openApp({ screen: "spot" })} />
        </div>
      </div>
    </section>
  )
}

/* ---------------- Observation radar ---------------- */
export function RadarSection() {
  const { openApp } = useNav()
  const [ch, setCh] = useState<number | null>(5)
  const sample = OBS.filter((o) => (!ch || o.c === ch) && o.f && o.y).slice(0, 3)
  return (
    <section id="radar" className="gutter scroll-mt-20 py-20">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-10">
        <SectionHead eyebrow="Observation radar" title="Where inspectors actually find problems">
          {OBS.length} real findings from SIRE 2.0, CDI and pre-vetting inspections in 2025 and 2026, sorted by chapter, type and cause. Tap a chapter to read real examples.
        </SectionHead>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="glass flex min-w-0 flex-col gap-3 rounded-[26px] p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[16px] font-bold">Findings by SIRE 2.0 chapter</h3>
              <span className="tnum font-mono text-[11.5px] text-mute">n = {OBS.length}</span>
            </div>
            <ChapterBars list={OBS} active={ch} onPick={setCh} />
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <div className="glass flex flex-col gap-3 rounded-[26px] p-5">
              <h3 className="text-[16px] font-bold">What kind of finding</h3>
              <TypeSplit list={OBS.filter((o) => !ch || o.c === ch)} />
            </div>
            <div className="glass flex flex-col gap-3 rounded-[26px] p-5">
              <h3 className="text-[16px] font-bold">Why people got caught out <span className="font-normal text-mute">(human findings)</span></h3>
              <FactorBars list={OBS.filter((o) => !ch || o.c === ch)} type="H" n={4} />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[17px] font-bold">{ch ? `Real examples: chapter ${ch}, ${CHAPTER_NAMES[ch]}` : "Real examples"}</h3>
            <span className="text-[13px] text-mute">Industry average: {BENCH.avgNeg} negative observations per SIRE 2.0 inspection (INTERTANKO, {BENCH.period})</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {sample.map((o) => <ObsCard key={o.t} o={o} />)}
          </div>
          <button type="button" onClick={() => openApp({ screen: "radar" })} className="flex h-12 items-center gap-2 self-start rounded-full bg-primary px-5 text-[14.5px] font-semibold text-on-primary">
            Open the full radar, free <I.ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  )
}

/* ---------------- Daily habit loop ---------------- */
const DECK_ICON = { trending: I.TrendUp, ratings: I.Users, ecdis: I.Monitor, cdi: I.Droplet, china: I.Compass } as const

export function HabitSection() {
  const { openApp } = useNav()
  return (
    <section id="habit" className="gutter scroll-mt-20 py-20">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-10">
        <SectionHead eyebrow="Five minutes a day" title="A little every day, so nothing surprises you on the day">
          Three small missions each day, a streak to protect, levels from Cadet to Vetting ace, and flashcards that come back just before you'd forget them.
        </SectionHead>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <MissionsCard go={(s) => openApp({ screen: s })} onSpot={() => document.getElementById("spot")?.scrollIntoView({ behavior: "smooth" })} />
            <div className="glass flex flex-col gap-3 rounded-[24px] p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[16px] font-bold">Your activity</h3>
                <StreakPill />
              </div>
              <Heatmap weeks={17} />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <div className="glass flex flex-col gap-3 rounded-[24px] p-5">
              <h3 className="text-[16px] font-bold">{CARDS.length} flashcards in {DECKS.length} decks</h3>
              <ul className="flex flex-col">
                {DECKS.map((d) => (
                  <li key={d.id}>
                    <button type="button" onClick={() => openApp({ screen: "session", deck: d.id })} className="flex w-full items-center gap-3 border-b border-line py-3 text-left last:border-0">
                      <IconTile icon={DECK_ICON[d.id]} color={d.color as TileColor} size={40} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[14.5px] leading-tight font-bold">{d.name}</span>
                        <span className="text-[12.5px] leading-snug text-mute">{d.sub}</span>
                      </span>
                      <span className="tnum font-mono text-[12px] text-mute">{CARDS.filter((c) => c.d === d.id).length}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", d.cost ? "bg-surface-2 text-mute" : "bg-sea-soft text-sea")}>{d.cost ? `${d.cost} credits or in plans` : "Free"}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-[12.5px] leading-snug text-mute">Rank-wise decks: {cardsFor("trending", "2/O").length} cards for a second officer, {cardsFor("trending", "C/O").length} for a chief officer, {cardsFor("trending", "C/E").length} for engineers.</p>
            </div>
            <div className="glass flex flex-col gap-3 rounded-[24px] p-5">
              <h3 className="text-[16px] font-bold">Levels and badges</h3>
              <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {LEVELS.map((l) => (
                  <span key={l.n} className="flex shrink-0 flex-col items-center gap-1 rounded-2xl bg-white/50 px-3 py-2 text-center">
                    <span className="display text-[16px] font-bold">{l.n}</span>
                    <span className="max-w-[86px] text-[11px] leading-tight text-mute">{l.name}</span>
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {BADGES.slice(0, 10).map((b) => {
                  const Icon = (I as unknown as Record<string, (q: { size?: number }) => ReactNode>)[b.icon]
                  return (
                    <span key={b.id} title={`${b.name}: ${b.sub}`} className="flex flex-col items-center gap-1 text-center">
                      <IconTile icon={Icon} color="amber" size={40} />
                      <span className="text-[10.5px] leading-tight text-mute">{b.name}</span>
                    </span>
                  )
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => openApp({ screen: "train" })} className="flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-[14.5px] font-semibold text-on-primary">
                <I.Play size={16} /> Start today's 10 cards
              </button>
              <button type="button" onClick={() => openApp({ screen: "kit" })} className="glass flex h-12 items-center gap-2 rounded-full px-5 text-[14.5px] font-semibold">
                <I.Briefcase size={16} /> Ready kit · {KIT_TOTAL} checks
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------------- AI ---------------- */
export function AiSection() {
  const { openApp } = useNav()
  const [q, setQ] = useState("")
  const feats = [
    { icon: I.Mic, c: "violet", t: "AI inspector", s: "Five questions for your rank or role, typed or spoken. In a voice interview the inspector reads each question aloud and you answer out loud. Every answer is graded on the fact, the procedure and the record.", tag: `${COSTS.interview} credits` },
    { icon: I.Sparkle, c: "indigo", t: "Ask NilObs", s: `Ask anything. Answers draw on ${OBS.length} real observations and ${CARDS.length} Q&As, and show the records they came from. Quick or deep.`, tag: `from ${COSTS.askQuick} credit` },
    { icon: I.FileCheck, c: "teal", t: "Close-out drafts", s: "On any observation: why it was raised, the likely root cause, the fix on board, and a close-out response you can copy. Saved for next time.", tag: `${COSTS.explain} credit` },
    { icon: I.Camera, c: "sky", t: "Photo check", s: "Snap an area, a piece of equipment or a record. See what an inspector would flag, why, and how to fix it first, with similar findings from real inspections. Photos aren't stored.", tag: `${COSTS.photo} credits a photo` },
  ] as const
  return (
    <section id="ai" className="gutter scroll-mt-20 py-20">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-10">
        <SectionHead eyebrow="AI, powered by Claude" title="An inspector in your pocket who never runs out of questions">
          Practise out loud, get graded like the real thing, and ask about anything you're unsure of. Every answer is grounded in real inspections.
        </SectionHead>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 grid-cols-1 content-start gap-3 sm:grid-cols-2">
            {feats.map((f) => (
              <div key={f.t} className="glass flex flex-col gap-3 rounded-[22px] p-4">
                <span className="flex items-start justify-between gap-2">
                  <IconTile icon={f.icon} color={f.c as TileColor} size={42} />
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-mute">{f.tag}</span>
                </span>
                <span className="text-[16px] font-bold">{f.t}</span>
                <span className="text-[13.5px] leading-snug text-mute">{f.s}</span>
              </div>
            ))}
          </div>
          <div className="glass flex min-w-0 flex-col gap-3 rounded-[26px] p-5">
            <span className="text-[11.5px] font-semibold tracking-[0.06em] text-mute uppercase">Example of a graded answer</span>
            <div className="flex items-end gap-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2a3f63] to-[#0e2a50] font-mono text-[10px] font-bold text-white">INS</span>
              <span className="rounded-[18px] rounded-bl-[6px] border border-line bg-white/80 px-3.5 py-3 text-[14.5px] leading-snug">What do you check before you sign an enclosed space entry permit?</span>
            </div>
            <span className="max-w-[80%] self-end rounded-[18px] rounded-br-[6px] bg-primary px-3.5 py-3 text-[14px] leading-snug text-on-primary">Gas readings and that the space is ventilated.</span>
            <div className="flex flex-col gap-2 rounded-[20px] border border-line bg-white/80 p-4">
              <span className="flex items-center gap-3">
                <span className="display flex size-12 items-center justify-center rounded-full border-[5px] border-[#e08a00] text-[17px] font-bold">5</span>
                <span className="rounded-full bg-amber-soft px-2.5 py-0.5 text-[12px] font-bold text-amber-ink">Needs work</span>
              </span>
              {[[true, "Fact.", "Gas readings and ventilation are right."], [false, "Procedure.", "Say where your SMS covers entry, and who authorises it."], [false, "Record.", "Name the permit, the gas meter calibration record and the standby person."]].map(([ok, k, t]) => (
                <span key={k as string} className="flex gap-2 text-[13px] leading-snug">
                  {ok ? <I.Check size={16} className="mt-px shrink-0 text-sea" /> : <I.Alert size={15} className="mt-px shrink-0 text-signal-ink" />}
                  <span><b className="font-semibold">{k as string}</b> {t as string}</span>
                </span>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2a3f63] to-[#0e2a50] font-mono text-[10px] font-bold text-white">INS</span>
              <span className="rounded-[18px] rounded-bl-[6px] border border-[#d9cffd] bg-[#f7f4ff] px-3.5 py-3 text-[14px] leading-snug"><b className="mr-1 text-[11px] font-semibold text-[#5a3bd1]">Follow-up</b>When was your gas meter last calibrated, and where is that recorded?</span>
            </div>
            <form className="mt-1 flex gap-2" onSubmit={(e) => { e.preventDefault(); openApp({ screen: "ask", ask: q.trim() || undefined }) }}>
              <label htmlFor="land-ask" className="sr-only">Ask NilObs</label>
              <input id="land-ask" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask NilObs, e.g. common mooring observations" className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-white/85 px-3.5 text-[14.5px] outline-none focus:border-primary" />
              <button type="submit" className="flex h-12 shrink-0 items-center gap-2 rounded-xl bg-gradient-to-br from-[#7b5cff] to-[#1660d6] px-4 text-[14px] font-semibold text-white"><I.Sparkle size={16} /> Ask</button>
            </form>
            <button type="button" onClick={() => openApp({ screen: "practice" })} className="self-start text-[13.5px] font-semibold text-primary">Try the AI inspector →</button>
          </div>
        </div>
        <p className="text-[12.5px] leading-snug text-mute">{HOSTED ? "AI features run on Claude." : "AI features run on Claude: sign in to Claude on this page to use them, on your own Claude account."} AI answers can be wrong: check them against your SMS and the current rules.</p>
      </div>
    </section>
  )
}
