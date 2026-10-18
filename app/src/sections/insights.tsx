import { useEffect, useMemo, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"

import { AnimatedList } from "@/components/magicui/animated-list"
import { BlurFade } from "@/components/magicui/blur-fade"
import { MagicCard } from "@/components/magicui/magic-card"
import { NumberTicker } from "@/components/magicui/number-ticker"
import * as I from "@/components/icons"
import { cn } from "@/lib/utils"
import { DEBRIEFS, INDUSTRY, PORTS, RANK_TOPICS, STATS, areaCounts, fmtDate, majorCounts, placeLabel, topicCounts, type Topic } from "@/data"
import { GlobeCard, SectionHead } from "./top"

function Card({ className, title, aside, children }: { className?: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className={cn("min-w-0 rounded-3xl", className)}>
      <MagicCard gradientColor="rgba(11,107,203,0.06)" gradientFrom="#0b6bcb" gradientTo="#f26b1d" className="h-full rounded-3xl">
        <div className="flex h-full flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="text-[17px] font-bold">{title}</h3>
            {aside && <span className="font-mono text-[11.5px] text-mute">{aside}</span>}
          </div>
          {children}
        </div>
      </MagicCard>
    </div>
  )
}

function TopicExplorer() {
  const topics = useMemo(() => topicCounts().slice(0, 10), [])
  const [sel, setSel] = useState<Topic>(topics[0][0])
  const max = topics[0][1]
  const examples = DEBRIEFS.flatMap((d) => d.questions.filter((q) => q.topic === sel).map((q) => ({ q: q.q, src: `${d.port === "Port not stated" ? d.country || "Port n/s" : d.port} · ${fmtDate(d.date)}` }))).slice(0, 4)
  const owners = Object.entries(RANK_TOPICS).filter(([, ts]) => ts.includes(sel)).map(([r]) => r)
  return (
    <div className="grid gap-5 md:grid-cols-[1.15fr_1fr]">
      <ul className="flex flex-col gap-1" aria-label="Topics by number of debriefs">
        {topics.map(([t, n], i) => (
          <li key={t}>
            <button type="button" onClick={() => setSel(t)} aria-pressed={sel === t} className={cn("grid w-full grid-cols-[minmax(0,9.5rem)_1fr_1.5rem] items-center gap-3 rounded-lg px-2 py-1.5 text-left", sel === t ? "bg-surface-2" : "hover:bg-surface-2/60")}>
              <span className={cn("truncate text-[13.5px]", sel === t ? "font-bold" : "font-medium")}>{t}</span>
              <span className="h-2.5 rounded-full bg-surface-2">
                <motion.span
                  initial={{ width: 0 }}
                  animate={{ width: `${(n / max) * 100}%` }}
                  transition={{ delay: i * 0.05, duration: 0.7, ease: "easeOut" }}
                  className={cn("block h-2.5 rounded-full", sel === t ? "bg-signal" : "bg-primary/70")}
                />
              </span>
              <span className="tnum text-right font-mono text-[12px] font-semibold">{n}</span>
            </button>
          </li>
        ))}
      </ul>
      <AnimatePresence mode="wait">
        <motion.div key={sel} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }} className="flex flex-col gap-3 rounded-2xl bg-surface-2/70 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[15px] font-bold">{sel}</span>
            {owners.length > 0 && <span className="font-mono text-[11px] text-mute">usually {owners.join(", ")}</span>}
          </div>
          {examples.length ? (
            <ul className="flex flex-col gap-2.5">
              {examples.map((e) => (
                <li key={e.q} className="flex flex-col gap-0.5">
                  <span className="text-[14px] leading-snug">“{e.q}”</span>
                  <span className="font-mono text-[11px] text-mute">{e.src}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-mute">Only seen as a negative observation (Toamasina, BP, Sep).</p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function LiveFeed() {
  const items = useMemo(() => [...DEBRIEFS].filter((d) => d.questions.length || d.negatives).sort((a, b) => a.date.localeCompare(b.date)).slice(-7), [])
  const [round, setRound] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setRound((r) => r + 1), items.length * 1400 + 5000)
    return () => clearInterval(t)
  }, [items.length])
  return (
    <div className="relative h-[300px] overflow-hidden">
      <AnimatedList key={round} delay={1400} className="gap-2">
        {items.map((d) => (
          <div key={d.id} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3">
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", d.negatives ? "bg-signal-soft text-signal-ink" : "bg-sea-soft text-sea")}>
              {d.negatives ? <I.Alert size={17} /> : <I.Chat size={17} />}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[14px] font-semibold">{placeLabel(d)}</span>
              <span className="truncate text-[12.5px] text-mute">
                {d.major ? `${d.major} · ` : ""}{d.negatives ? `${d.negatives.length} negative${d.positives ? `, ${d.positives} positive` : ""}` : `${d.questions.length} questions · ${d.questions[0].topic}`}
              </span>
            </span>
            <span className="ml-auto shrink-0 font-mono text-[11px] text-mute">{fmtDate(d.date)}</span>
          </div>
        ))}
      </AnimatedList>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-surface to-transparent" />
    </div>
  )
}

export function Insights() {
  const topics = new Map(topicCounts())
  const areas = areaCounts()
  const majors = majorCounts()
  const total = DEBRIEFS.length
  const bridge = areas.find(([a]) => a === "Bridge")?.[1] ?? 0
  const toamasina = DEBRIEFS.find((d) => d.id === 18)!
  const takeaways = [
    { k: `${bridge} of ${total}`, t: "debriefs centred on the bridge. ECDIS came up in " + (topics.get("ECDIS") ?? 0) + " and radar in " + (topics.get("Radar") ?? 0) + "." },
    { k: "Paper vs. ship", t: "Inspectors compared PMS dates, PIQ photos and running hours with what they saw on board." },
    { k: "Everyone gets asked", t: "At Marsden Point the inspector questioned 13 crew, from the master to the cook and the wiper. Ratings were asked about stop work and the DPA." },
  ]
  return (
    <section id="insights" className="gutter scroll-mt-20 bg-surface-2/50 py-20">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-10">
        <SectionHead eyebrow="Insights" title={`What ${total} debriefs say about SIRE 2.0 inspections`}>
          Posted in the channel between April and October 2026. It's a small sample, so read these as signals. Every number on this page grows as officers share more.
        </SectionHead>

        <div className="grid gap-4 md:grid-cols-3">
          {takeaways.map((x, i) => (
            <BlurFade key={x.k} delay={i * 0.1} className="flex flex-col gap-2 border-t-2 border-ink pt-4">
              <span className="display text-[22px] font-bold">{x.k}</span>
              <span className="text-[15px] leading-relaxed text-mute">{x.t}</span>
            </BlurFade>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-6">
          <Card className="lg:col-span-4" title="What inspectors asked about" aside="debriefs mentioning each · tap a topic">
            <TopicExplorer />
          </Card>

          <Card className="lg:col-span-2" title="Latest debriefs" aside="replays the feed">
            <LiveFeed />
          </Card>

          <Card className="lg:col-span-3" title="Where the debriefs come from" aside={`${STATS.ports} ports · ${STATS.countries} countries`}>
            <GlobeCard />
            <div className="flex flex-wrap gap-1.5">
              {PORTS.map((d) => (
                <span key={d.id} className={cn("rounded-full border px-2.5 py-1 text-[12px]", d.negatives ? "border-signal/40 bg-signal-soft text-signal-ink" : "border-line text-mute")}>{d.port}</span>
              ))}
            </div>
          </Card>

          <Card className="lg:col-span-3" title="Where the time went" aside={`of ${total} debriefs`}>
            <ul className="flex flex-col gap-3">
              {areas.map(([a, n], i) => (
                <li key={a} className="flex flex-col gap-1.5">
                  <span className="flex justify-between text-[14px]"><span className="font-medium">{a}</span><span className="tnum font-mono text-[12px] font-semibold">{n}</span></span>
                  <span className="flex gap-1" aria-hidden="true">
                    {Array.from({ length: total }, (_, j) => (
                      <motion.span key={j} initial={{ opacity: 0.15 }} animate={{ opacity: j < n ? 1 : 0.15 }} transition={{ delay: i * 0.08 + j * 0.02 }} className={cn("h-3 flex-1 rounded-[3px]", j < n ? "bg-primary" : "bg-line")} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[13px] leading-snug text-mute">Master's-cabin reviews ran long: one Shell inspection spent three hours on SMS documents alone.</p>
          </Card>

          <Card className="lg:col-span-6" title="The wider picture" aside="industry benchmarks">
            <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3">
              {INDUSTRY.map((s) => (
                <div key={s.label} className="flex flex-col gap-1.5">
                  <span className="tnum display text-[34px] leading-none font-bold">
                    <NumberTicker value={s.value} decimalPlaces={s.decimals} className="text-ink" />
                    <span className="text-[20px] text-signal-ink">{s.unit}</span>
                  </span>
                  <span className="text-[13.5px] leading-snug">{s.label}</span>
                  <span className="font-mono text-[10.5px] text-mute">{s.source}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="lg:col-span-3" title="Who was inspecting" aside="debriefs per oil major / body">
            <div className="flex flex-wrap gap-2">
              {majors.map(([m, n]) => (
                <span key={m} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13.5px]", m === "Not stated" ? "border-dashed border-line text-mute" : "border-line bg-surface font-medium")}>
                  {m}
                  <span className="tnum rounded-full bg-surface-2 px-1.5 font-mono text-[11.5px] font-semibold">{n}</span>
                </span>
              ))}
            </div>
            <p className="text-[13px] leading-snug text-mute">Nearly half the posts don't name the oil major. The submission form will ask for it, so briefs can match on it.</p>
          </Card>

          <Card className="lg:col-span-3" title={`Negatives at ${toamasina.port}`} aside={`${toamasina.major} · ${fmtDate(toamasina.date)}`}>
            <ul className="flex flex-col gap-2.5">
              {toamasina.negatives!.map((n) => (
                <li key={n} className="flex gap-2.5 text-[14px] leading-snug"><I.Alert size={17} className="mt-0.5 shrink-0 text-signal-ink" />{n}</li>
              ))}
            </ul>
            <p className="rounded-xl bg-sea-soft px-3.5 py-2.5 text-[13.5px] leading-snug text-sea">
              All four are things a records check before arrival would have caught. That check is what the brief's checklist is for.
            </p>
          </Card>
        </div>
      </div>
    </section>
  )
}
