import { useEffect, useRef, useState, type FormEvent } from "react"
import { HOSTED } from "@/ai"
import { AnimatePresence, motion } from "motion/react"

import { AnimatedCircularProgressBar } from "@/components/magicui/animated-circular-progress-bar"
import { BlurFade } from "@/components/magicui/blur-fade"
import { BorderBeam } from "@/components/magicui/border-beam"
import { MagicCard } from "@/components/magicui/magic-card"
import { NumberTicker } from "@/components/magicui/number-ticker"
import { Ripple } from "@/components/magicui/ripple"
import { Safari } from "@/components/magicui/safari"
import { ShimmerButton } from "@/components/magicui/shimmer-button"
import * as I from "@/components/icons"
import { burst } from "@/components/PhoneApp"
import { Logo } from "@/components/Brand"
import { cn } from "@/lib/utils"
import { FLEET, REPEATS, RANKS, RANK_NAMES, topicCounts } from "@/data"
import { SectionHead } from "./top"
import { FLEET as FLEET_PLAN, PLANS, fmtPrice } from "@/economy"
import { useWallet } from "@/credits"
import { useNav } from "@/nav"

function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [q])
  return m
}

const STATE_PILL: Record<string, [string, string]> = {
  ready: ["Ready", "bg-sea-soft text-sea"],
  "on-track": ["On track", "bg-sea-soft text-sea"],
  attention: ["Needs attention", "bg-amber-soft text-amber-ink"],
  "not-started": ["Not started", "bg-signal-soft text-signal-ink"],
  sent: ["Briefs sent", "bg-sea-soft text-sea"],
}

/* ---------------- Fleet console ---------------- */
function FleetConsole() {
  const [sent, setSent] = useState<Record<string, boolean>>({})
  const rows = FLEET.map((v) => (sent[v.vessel] ? { ...v, briefed: v.crew, state: "sent" } : v))
  const briefed = rows.reduce((n, v) => n + v.briefed, 0)
  const crew = rows.reduce((n, v) => n + v.crew, 0)
  const scored = FLEET.filter((v) => v.score)
  const avg = Math.round(scored.reduce((n, v) => n + v.score, 0) / scored.length)
  const repeats = REPEATS.reduce((n, r) => n + r.ships, 0)
  const asked = topicCounts().slice(0, 4)
  const send = (vessel: string, el: HTMLElement) => {
    setSent((s) => ({ ...s, [vessel]: true }))
    burst(el, { particleCount: 70 })
  }
  const sendAll = (el: HTMLElement) => {
    setSent(Object.fromEntries(FLEET.map((v) => [v.vessel, true])))
    burst(el)
  }
  const kpis = [
    { label: "Inspections in the next 30 days", value: FLEET.length, suffix: "", icon: <I.Ship size={18} /> },
    { label: "Officers briefed", value: briefed, suffix: ` / ${crew}`, icon: <I.Users size={18} /> },
    { label: "Average mock-interview score", value: avg, suffix: "%", icon: <I.Mic size={18} /> },
    { label: "Repeat observations still open", value: repeats, suffix: "", icon: <I.Alert size={18} /> },
  ]
  return (
    <div className="flex min-w-0 flex-col gap-5 bg-bg p-4 font-sans text-ink sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] tracking-[0.1em] text-mute uppercase">[Ship manager] · 24 tankers</span>
          <span className="display text-[24px] leading-none font-bold">Fleet readiness</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-dashed border-line px-2.5 py-1 font-mono text-[11px] text-mute">Sample data</span>
          <ShimmerButton onClick={(e) => sendAll(e.currentTarget)} background="#0b6bcb" shimmerColor="#cfe6ff" className="h-10 px-4 text-[13.5px] font-semibold">
            Send briefs to every crew
          </ShimmerButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map((k) => (
          <MagicCard key={k.label} gradientColor="rgba(11,107,203,0.06)" gradientFrom="#0b6bcb" gradientTo="#f26b1d" className="rounded-2xl">
            <div className="flex flex-col gap-2 p-4">
              <span className="text-mute">{k.icon}</span>
              <span className="tnum display text-[28px] leading-none font-bold">
                <NumberTicker key={k.value} value={k.value} startValue={Math.max(0, k.value - 3)} className="text-ink" />
                <span className="text-[16px] text-mute">{k.suffix}</span>
              </span>
              <span className="text-[12.5px] leading-snug text-mute">{k.label}</span>
            </div>
          </MagicCard>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-soft text-amber-ink"><I.Alert size={18} /></span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[14.5px] font-bold">MT Vessel B: Shell at Antwerp in 9 days</span>
                <span className="text-[13px] leading-snug text-mute">
                  Only 2 of 6 officers have opened their brief. The last Shell inspection at Antwerp spent three hours on SMS documents in the master's cabin.
                </span>
              </div>
            </div>
            {!sent["MT Vessel B"] && <BorderBeam size={120} duration={7} colorFrom="#f26b1d" colorTo="#ffcf70" borderWidth={1.5} />}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[640px] text-left text-[13.5px]">
              <caption className="sr-only">Upcoming inspections</caption>
              <thead>
                <tr className="border-b border-line font-mono text-[10.5px] tracking-[0.08em] text-mute uppercase">
                  <th className="px-4 py-3 font-medium">Vessel</th>
                  <th className="px-3 py-3 font-medium">Inspection</th>
                  <th className="px-3 py-3 font-medium">Crew briefed</th>
                  <th className="px-3 py-3 font-medium">Mock score</th>
                  <th className="px-4 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const [label, cls] = STATE_PILL[v.state]
                  const pct = v.briefed / v.crew
                  return (
                    <tr key={v.vessel} className="border-b border-line last:border-0">
                      <td className="px-4 py-3"><span className="flex flex-col"><span className="font-semibold">{v.vessel}</span><span className="text-[12px] text-mute">{v.type}</span></span></td>
                      <td className="px-3 py-3"><span className="flex flex-col"><span>{v.major} · {v.port}</span><span className="font-mono text-[11.5px] text-mute">{v.date}</span></span></td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2.5">
                          <span className="h-2 w-24 rounded-full bg-surface-2">
                            <motion.span animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.7 }} className={cn("block h-2 rounded-full", pct === 1 ? "bg-sea" : pct >= 0.5 ? "bg-primary" : "bg-signal")} />
                          </span>
                          <span className="tnum font-mono text-[12px]">{v.briefed}/{v.crew}</span>
                        </span>
                      </td>
                      <td className="tnum px-3 py-3 font-mono">{v.score ? `${v.score}%` : "–"}</td>
                      <td className="px-4 py-3 text-right">
                        {v.state === "attention" || v.state === "not-started" ? (
                          <button type="button" onClick={(e) => send(v.vessel, e.currentTarget)} className="rounded-full bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-on-primary">
                            {v.state === "attention" ? "Nudge crew" : "Send briefs"}
                          </button>
                        ) : (
                          <span className={cn("rounded-full px-2.5 py-1 text-[12px] font-semibold", cls)}>{label}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
            <AnimatedCircularProgressBar value={Math.round((briefed / crew) * 100)} gaugePrimaryColor="#0b7d64" gaugeSecondaryColor="rgba(127,140,160,0.18)" className="size-[84px] text-[18px] text-ink" />
            <span className="flex flex-col gap-1">
              <span className="text-[14px] font-bold">Crews briefed</span>
              <span className="text-[12.5px] leading-snug text-mute">Share of officers on ships with an inspection in 30 days</span>
            </span>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
            <span className="text-[14px] font-bold">Repeat observations</span>
            {REPEATS.map((r) => (
              <span key={r.text} className="flex items-start justify-between gap-3 text-[13px] leading-snug">
                {r.text}
                <span className="tnum shrink-0 rounded-full bg-signal-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-signal-ink">{r.ships} ships</span>
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4">
            <span className="text-[14px] font-bold">Asked most, all fleets</span>
            {asked.map(([t, n]) => (
              <span key={t} className="grid grid-cols-[1fr_70px_18px] items-center gap-2 text-[12.5px]">
                {t}
                <span className="h-1.5 rounded-full bg-surface-2"><span className="block h-1.5 rounded-full bg-primary" style={{ width: `${(n / asked[0][1]) * 100}%` }} /></span>
                <span className="tnum text-right font-mono text-[11px]">{n}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Fleet() {
  const wide = useMedia("(min-width: 1024px)")
  return (
    <section id="fleet" className="gutter scroll-mt-20 py-20">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-10">
        <SectionHead eyebrow="For ship managers" title="See every crew's readiness before the inspector does.">
          The same debriefs, pooled across fleets, become a console for vetting superintendents. Send briefs, see who rehearsed, and catch repeat observations early. Try the buttons.
        </SectionHead>
        {HOSTED && <FleetOffer />}
        {wide ? (
          <Safari url="sire-ready / fleet" className="drop-shadow-[0_30px_60px_rgba(16,35,58,0.12)]">
            <FleetConsole />
          </Safari>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-line">
            <FleetConsole />
          </div>
        )}
      </div>
    </section>
  )
}

/** The fleet plan, as it's sold today: seats for a crew, an invite link and a readiness report. */
function FleetOffer() {
  const { openApp } = useNav()
  const w = useWallet()
  const cur = w.currency
  return (
    <div className="glass flex flex-col gap-4 rounded-[26px] p-6 md:flex-row md:items-center md:justify-between">
      <span className="flex flex-col gap-1.5">
        <span className="font-mono text-[11.5px] tracking-[0.1em] text-mute uppercase">Fleet plan</span>
        <span className="display text-[26px] leading-tight font-bold">{fmtPrice(FLEET_PLAN.price[cur].monthly, cur)} a seat a month</span>
        <span className="text-[14px] leading-snug text-mute">From {FLEET_PLAN.min} seats. Every seat is a {PLANS.watch.name} plan ({PLANS.watch.credits} credits a month). Share one invite link with the crew, see a private board, and get a readiness report: practice scores by topic, drills and streaks. A year costs ten months. Nothing renews by itself.</span>
      </span>
      <button type="button" onClick={() => openApp({ screen: "crew" })} className="h-12 shrink-0 rounded-full bg-primary px-6 text-[15px] font-semibold text-on-primary">Set up your crew</button>
    </div>
  )
}

/* ---------------- Who pays ---------------- */
export function Model() {
  const plans = [
    { who: "Officers", price: "₹399", unit: "per brief (to test)", points: ["Brief for your oil major, port and rank", "Mock interview with feedback", "2 free briefs for every approved debrief"], icon: <I.Clipboard size={20} /> },
    { who: "Ship managers", price: "[Your price]", unit: "per vessel, per month", points: ["Briefs pushed to every crew before inspection", "Readiness and mock-interview scores", "Inspector and port trends across fleets"], icon: <I.Gauge size={20} />, featured: true },
    { who: "Channel partner", price: "Revenue share", unit: "on sales through the channel link", points: ["Seeds the database with the archive", "Posts a brief link under each debrief", "“Powered by” credit in the app"], icon: <I.Chat size={20} /> },
  ]
  return (
    <section id="model" className="gutter scroll-mt-20 bg-surface-2/50 py-20">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-10">
        <SectionHead eyebrow="Who pays" title="Officers bring the data. Ship managers bring the revenue.">
          Officers pay a little and contribute debriefs. Ship managers pay per vessel for the pooled view nobody else has.
        </SectionHead>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p, i) => (
            <BlurFade key={p.who} delay={i * 0.1} className="relative h-full overflow-hidden rounded-3xl">
              <MagicCard gradientColor="rgba(11,107,203,0.06)" gradientFrom="#0b6bcb" gradientTo="#f26b1d" className="h-full rounded-3xl">
                <div className="flex h-full flex-col gap-4 p-6">
                  <span className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[15px] font-bold"><span className="text-signal-ink">{p.icon}</span>{p.who}</span>
                    {p.featured && <span className="rounded-full bg-primary px-2.5 py-1 font-mono text-[10.5px] font-semibold text-on-primary">MAIN REVENUE</span>}
                  </span>
                  <span className="flex flex-col">
                    <span className="display text-[30px] leading-tight font-bold">{p.price}</span>
                    <span className="text-[13px] text-mute">{p.unit}</span>
                  </span>
                  <ul className="flex flex-col gap-2 border-t border-line pt-4">
                    {p.points.map((x) => <li key={x} className="flex gap-2 text-[14px] leading-snug"><I.Check size={17} className="mt-0.5 shrink-0 text-sea" />{x}</li>)}
                  </ul>
                </div>
              </MagicCard>
              {p.featured && <BorderBeam size={140} duration={8} colorFrom="#0b6bcb" colorTo="#f26b1d" borderWidth={1.5} />}
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------------- Waitlist ---------------- */
export function Waitlist() {
  const [done, setDone] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setDone(true)
    burst(btn.current)
  }
  return (
    <section id="waitlist" className="gutter relative scroll-mt-20 overflow-hidden py-24">
      <Ripple mainCircleSize={260} numCircles={7} className="[--foreground:var(--line)]" />
      <div className="relative mx-auto flex max-w-[640px] flex-col items-center gap-6 text-center">
        <h2 className="display text-[clamp(1.9rem,4vw,3rem)] leading-[1.05] font-bold">Get your next inspection brief first</h2>
        <p className="max-w-[48ch] text-[17px] leading-relaxed text-mute">Join the waitlist. Officers who share a debrief get their first two briefs free.</p>
        <AnimatePresence mode="wait">
          {done ? (
            <motion.p key="ok" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-line bg-surface px-5 py-4 text-[15px]" role="status">
              You're on the list. <span className="text-mute">(Prototype: nothing was sent or saved.)</span>
            </motion.p>
          ) : (
            <motion.form key="form" exit={{ opacity: 0, y: -8 }} onSubmit={submit} className="flex w-full flex-col gap-2.5 rounded-2xl border border-line bg-surface p-2.5 sm:flex-row">
              <label htmlFor="wl-email" className="sr-only">Email</label>
              <input id="wl-email" type="email" required placeholder="you@example.com" className="h-12 min-w-0 flex-1 rounded-xl bg-bg px-4 text-[15px]" />
              <label htmlFor="wl-rank" className="sr-only">Rank</label>
              <select id="wl-rank" defaultValue="2/O" className="h-12 rounded-xl bg-bg px-3 text-[15px]">
                {RANKS.map((r) => <option key={r} value={r}>{RANK_NAMES[r] || r}</option>)}
              </select>
              <ShimmerButton ref={btn} type="submit" background="#c4410c" shimmerColor="#ffffff" borderRadius="12px" className="h-12 px-6 text-[15px] font-semibold">
                Join the waitlist
              </ShimmerButton>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="gutter border-t border-line py-10">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-4 text-[13px] leading-relaxed text-mute">
        <span className="flex flex-wrap items-center gap-3 font-semibold text-ink"><Logo size={30} /><span className="text-signal-ink">Aim for nil.</span><span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10.5px] font-normal text-mute">prototype</span></span>
        <p className="max-w-[90ch]">
          Debrief data: 19 posts in the “SIRE 2.0” WhatsApp channel, April–October 2026, paraphrased with ship, crew and inspector names removed. Inspection data: SIRE 2.0, CDI, PSC and pre-vetting reports and observation lists from 2025–2026, with ship, crew, inspector and company names removed and wording paraphrased. The fleet console above is a demo with sample figures; the fleet plan's real report is in the app. Model answers, flashcards and the “what they want to see” lists were written for this prototype and should be checked by a master mariner before launch. {HOSTED ? "Signed out, your rank, practice credits, ratings, saved questions and streak stay in this browser only. Signed in, they follow your account, and your credits are kept on the server." : "Your rank, credits, ratings, saved questions and streak stay in this browser only."}
        </p>
        <p className="max-w-[90ch]">
          Industry figures:{" "}
          <a className="underline underline-offset-2" href="https://maritimetrainer.com/blog/sire-20-analysis-facing-the-37-human-factor-challenge" target="_blank" rel="noreferrer">Maritime Trainer on the INTERTANKO 2025 benchmark</a>
          {" · "}
          <a className="underline underline-offset-2" href="https://marineinspection.app/article/sire-2-0-negative-observations-how-to-reduce-them-guide" target="_blank" rel="noreferrer">marineinspection.app, citing Kaiko Systems</a>
          . Vendor figures show association, not cause. Not affiliated with OCIMF. UI components from Magic UI (MIT).
        </p>
        {HOSTED && (
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <span>© 2026 Sea N Shore IT Solutions LLP</span>
            <a className="font-semibold text-ink underline underline-offset-2" href="/privacy">Privacy</a>
            <a className="font-semibold text-ink underline underline-offset-2" href="/terms">Terms</a>
            <a className="font-semibold text-ink underline underline-offset-2" href="/refunds">Refunds</a>
            <a className="font-semibold text-ink underline underline-offset-2" href="/about">About</a>
            <a className="font-semibold text-ink underline underline-offset-2" href="/sire/">SIRE 2.0 topics</a>
          </p>
        )}
      </div>
    </footer>
  )
}
