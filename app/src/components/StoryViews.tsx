import { type ReactNode } from "react"
import { motion } from "motion/react"

import * as I from "@/components/icons"
import { cn } from "@/lib/utils"
import { RANK_NAMES } from "@/data"
import { groupByWho, type Story } from "@/stories"
import { CHAPTER_NAMES, TYPE_COLOR, type Finding, type ReportStory } from "@/fleet"
import { ChapterBadge, IconTile } from "@/components/topicIcons"

const WHO_NAMES: Record<string, string> = { ...RANK_NAMES, "2/E": "Second Engineer", "3/E": "Third Engineer", "4/E": "Fourth Engineer" }

export function ResultChip({ s, className }: { s: Story; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap",
        s.resultTone === "good" ? "bg-sea-soft text-sea" : s.resultTone === "bad" ? "bg-signal-soft text-signal-ink" : "bg-surface-2 text-mute",
        className
      )}
    >
      {s.resultTone === "good" ? <I.Check size={13} /> : s.resultTone === "bad" ? <I.Alert size={12} /> : null}
      {s.resultLabel}
    </span>
  )
}

export function StoryCard({ s, active, locked, onClick }: { s: Story; active?: boolean; locked?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full flex-col gap-2 rounded-2xl border p-4 text-left transition-colors",
        active ? "border-primary bg-surface shadow-[0_10px_30px_-18px_rgba(11,31,51,0.45)]" : "border-line bg-surface hover:border-mute"
      )}
    >
      <span className="flex items-center justify-between gap-2 font-mono text-[11px] text-mute">
        <span className="flex min-w-0 items-center gap-1.5">
        <span className={cn("shrink-0 rounded-full px-1.5 py-px font-sans text-[10px] font-semibold", s.d.src === "report" ? "bg-primary-soft text-primary" : "bg-amber-soft text-amber-ink")}>{s.d.src === "report" ? s.d.report?.inspType === "SIRE 2.0" ? "Report" : s.d.report?.inspType : "Debrief"}</span>
        <span className="truncate">
          {s.d.major ? `${s.d.major} · ` : ""}
          {s.place} · {s.date}
        </span>
        </span>
        {locked && <I.Lock size={13} className="shrink-0" />}
      </span>
      <span className="text-[15.5px] leading-snug font-bold">{s.headline}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <ResultChip s={s} />
        {s.d.questions.length > 0 && <span className="text-[12px] text-mute">{s.d.questions.length} questions</span>}
      </span>
    </button>
  )
}

function Block({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2.5 text-[15px] font-bold text-ink">
        <span className="gloss tile-blue flex size-8 items-center justify-center rounded-[10px]">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  )
}

/** A readable inspection story. `locked` shows a preview with an unlock call to action. */
export function StoryReader({ s, locked, unlockSlot, size = "lg" }: { s: Story; locked?: boolean; unlockSlot?: ReactNode; size?: "md" | "lg" }) {
  const groups = groupByWho(s.d)
  const r = s.d.report
  const isReport = s.d.src === "report"
  const previewQs = s.d.questions.length ? s.d.questions.slice(0, 3) : (r?.negatives.length ? r.negatives : r?.positives || []).slice(0, 3).map((f) => ({ q: f.text }))
  const restPreview = s.d.questions.length ? s.d.questions.slice(3, 7) : (r?.gaps || []).slice(0, 4).map((g) => ({ q: g }))
  const totalSplit = s.d.timeSplit?.reduce((a, [, h]) => a + h, 0) ?? 0
  const splitColors = ["bg-primary", "bg-signal", "bg-sea", "bg-mute"]
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11.5px] text-mute">
          {s.d.major && <span className="rounded-full bg-primary px-2.5 py-1 font-semibold text-on-primary">{s.d.major}</span>}
          <span className="rounded-full border border-line px-2.5 py-1">{s.place}</span>
          <span className="rounded-full border border-line px-2.5 py-1">{s.date}{s.d.date.startsWith("2026") ? " 2026" : ""}</span>
          {s.d.shipType && <span className="rounded-full border border-line px-2.5 py-1">{s.d.shipType}</span>}
          {isReport && r && <span className="rounded-full border border-line px-2.5 py-1">{r.inspType}</span>}
          {r?.durationH ? <span className="rounded-full border border-line px-2.5 py-1">{r.durationH} h on board</span> : null}
        </div>
        <h2 className={cn("display leading-[1.08] font-bold", size === "lg" ? "text-[clamp(1.6rem,3vw,2.2rem)]" : "text-[24px]")}>{s.headline}</h2>
        <p className={cn("leading-relaxed text-mute", size === "lg" ? "text-[17px]" : "text-[15px]")}>{s.dek}</p>
        <div className="flex flex-wrap items-center gap-2">
          <ResultChip s={s} />
          {s.d.questions.length > 0 && <span className="text-[13px] text-mute">{s.d.questions.length} questions recorded</span>}
          {isReport && r && (r.gaps.length + r.condition.length) > 0 && <span className="text-[13px] text-mute">{r.gaps.length + r.condition.length} superintendent notes</span>}
        </div>
      </header>

      {s.d.style && (
        <figure className="glass flex gap-3 rounded-2xl p-4">
          <I.Users size={18} className="mt-0.5 shrink-0 text-signal-ink" />
          <figcaption className="flex flex-col gap-0.5">
            <span className="text-[12.5px] font-semibold text-mute">The inspector</span>
            <span className="text-[15px] leading-relaxed">{s.d.style}</span>
          </figcaption>
        </figure>
      )}

      {locked ? (
        <div className="relative flex flex-col gap-3">
          <Block title={s.d.questions.length ? "What they asked" : r?.negatives.length ? "What they found" : "What went well"} icon={<I.Chat size={16} />}>
            <ul className="flex flex-col gap-2">
              {previewQs.map((q) => (
                <li key={q.q} className="flex gap-2.5 text-[15px] leading-snug">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-signal" />
                  {q.q}
                </li>
              ))}
            </ul>
          </Block>
          <div aria-hidden="true" className="pointer-events-none flex flex-col gap-2 opacity-60 blur-[5px] select-none">
            {restPreview.map((q) => (
              <span key={q.q} className="text-[15px] leading-snug">· {q.q}</span>
            ))}
            <span className="h-16 rounded-2xl bg-surface-2" />
          </div>
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-linear-to-t from-bg via-bg/95 to-transparent pt-16 pb-2">
            {unlockSlot}
          </div>
        </div>
      ) : (
        <>
          {(s.d.timeline || s.d.timeSplit) && (
            <Block title="How the day went" icon={<I.Clock size={16} />}>
              {s.d.timeSplit && (
                <div className="flex flex-col gap-2.5">
                  <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={s.d.timeSplit.map(([a, h]) => `${a} ${h} hours`).join(", ")}>
                    {s.d.timeSplit.map(([a, h], i) => (
                      <motion.span key={a} initial={{ width: 0 }} animate={{ width: `${(h / totalSplit) * 100}%` }} transition={{ delay: i * 0.1, duration: 0.6 }} className={cn("h-3 border-r-2 border-surface last:border-0", splitColors[i % splitColors.length])} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {s.d.timeSplit.map(([a, h], i) => (
                      <span key={a} className="flex items-center gap-1.5 text-[13px]">
                        <span className={cn("size-2.5 rounded-full", splitColors[i % splitColors.length])} />
                        {a} <span className="tnum font-mono text-mute">{h < 1 ? `${Math.round(h * 60)} min` : `${h} h`}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {s.d.timeline && (
                <ol className="relative flex flex-col gap-3 pl-6">
                  <span aria-hidden="true" className="absolute top-2 bottom-2 left-[7px] w-px bg-line" />
                  {s.d.timeline.map(([t, what]) => (
                    <li key={t + what} className="relative flex flex-col gap-0.5">
                      <span aria-hidden="true" className="absolute top-1 -left-6 size-[15px] rounded-full border-2 border-signal bg-bg" />
                      <span className="tnum font-mono text-[12px] font-semibold text-signal-ink">{t}</span>
                      <span className="text-[14.5px] leading-snug">{what}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Block>
          )}

          {r?.sequence?.length ? (
            <Block title="The inspector's route" icon={<I.Route size={16} />}>
              <ol className="flex flex-wrap items-center gap-1.5">
                {r.sequence.map((a, i) => (
                  <li key={a + i} className="flex items-center gap-1.5">
                    <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[13px] font-medium"><span className="tnum font-mono text-[11px] text-signal-ink">{i + 1}</span>{a}</span>
                    {i < r.sequence!.length - 1 && <I.ArrowRight size={14} className="text-mute" />}
                  </li>
                ))}
              </ol>
            </Block>
          ) : null}

          {isReport && r ? (
            <ReportBlocks r={r} />
          ) : s.d.negatives?.length ? (
            <Block title="Negative observations" icon={<I.Alert size={16} />}>
              <ul className="flex flex-col gap-2 rounded-2xl border border-signal/30 bg-signal-soft p-4">
                {s.d.negatives.map((n) => (
                  <li key={n} className="flex gap-2.5 text-[15px] leading-snug">
                    <I.Alert size={16} className="mt-0.5 shrink-0 text-signal-ink" />
                    {n}
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}

          {groups.length > 0 && (
            <Block title="What they asked" icon={<I.Chat size={16} />}>
              <div className="flex flex-col gap-5">
                {groups.map(([who, qs]) => (
                  <div key={who} className="flex flex-col gap-2">
                    <span className="flex items-center gap-2 text-[14px] font-bold">
                      {WHO_NAMES[who] || who}
                      <span className="tnum font-mono text-[11px] font-medium text-mute">{qs.length}</span>
                    </span>
                    <ul className="flex flex-col gap-2 border-l-2 border-line pl-4">
                      {qs.map((q) => (
                        <li key={q} className="text-[15px] leading-snug">{q}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Block>
          )}

          {s.d.note && !s.d.style && <p className="text-[14px] leading-relaxed text-mute">{s.d.note}</p>}

          {!isReport && r && (
            <section className="flex flex-col gap-5 rounded-[22px] border border-line bg-surface p-4">
              <span className="flex items-center gap-2.5 text-[15px] font-bold"><IconTile icon={I.FileCheck} color="indigo" size={32} />From the full inspection report</span>
              {r.style && <p className="text-[14px] leading-relaxed text-mute">{r.style}</p>}
              <ReportBlocks r={r} />
            </section>
          )}

          <Block title="Takeaways" icon={<I.Lightbulb size={16} />}>
            <ul className="flex flex-col gap-2.5 rounded-2xl bg-sea-soft p-4">
              {s.takeaways.map((t) => (
                <li key={t} className="flex gap-2.5 text-[15px] leading-snug text-ink">
                  <I.Check size={17} className="mt-0.5 shrink-0 text-sea" />
                  {t}
                </li>
              ))}
            </ul>
          </Block>
          <p className="text-[12px] leading-relaxed text-mute">
            {isReport
              ? `From ${r?.sources.join(" and ")}. Ship, crew, inspector and company names removed; wording paraphrased.`
              : "From a crew debrief in the SIRE 2.0 WhatsApp channel. Ship, crew and inspector names removed; questions paraphrased."}
          </p>
        </>
      )}
    </article>
  )
}

function FindingRow({ f, tone }: { f: Finding; tone: "bad" | "good" }) {
  return (
    <li className="flex flex-col gap-1.5 border-b border-line py-3 last:border-0">
      <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-mute">
        {f.chapter ? <ChapterBadge ch={String(f.chapter)} size={22} /> : null}
        {f.q ? <span className="font-mono">{f.q}</span> : f.chapter ? <span>Ch {f.chapter}</span> : null}
        {f.chapter ? <span className="hidden sm:inline">· {CHAPTER_NAMES[f.chapter]}</span> : null}
        {f.type && <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5"><span className="size-2 rounded-full" style={{ background: TYPE_COLOR[{ Human: "H", Process: "P", Hardware: "W" }[f.type]] }} />{f.type}</span>}
        {f.rank && <span className="rounded-full bg-surface-2 px-2 py-0.5">{f.rank}</span>}
      </span>
      <span className="flex gap-2.5 text-[14.5px] leading-snug">
        {tone === "bad" ? <I.Alert size={16} className="mt-0.5 shrink-0 text-signal-ink" /> : <I.Star size={16} className="mt-0.5 shrink-0 fill-[#ffcf5a] text-[#e08a00]" />}
        {f.text}
      </span>
    </li>
  )
}

function ReportBlocks({ r }: { r: ReportStory }) {
  return (
    <>
      {r.negatives.length > 0 && (
        <Block title={`Observations recorded (${r.negatives.length})`} icon={<I.Alert size={16} />}>
          <ul className="rounded-2xl border border-signal/25 bg-signal-soft px-4">{r.negatives.map((f) => <FindingRow key={f.text} f={f} tone="bad" />)}</ul>
        </Block>
      )}
      {r.positives.length > 0 && (
        <Block title={`Positive observations (${r.positives.length})`} icon={<I.Star size={16} />}>
          <ul className="rounded-2xl border border-sea/25 bg-sea-soft px-4">{r.positives.map((f) => <FindingRow key={f.text} f={f} tone="good" />)}</ul>
        </Block>
      )}
      {r.gaps.length > 0 && (
        <Block title="Procedure gaps spotted on board" icon={<I.FileText size={16} />}>
          <ul className="flex flex-col gap-2">{r.gaps.map((g) => <li key={g} className="flex gap-2.5 text-[14.5px] leading-snug"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-signal" />{g}</li>)}</ul>
        </Block>
      )}
      {r.condition.length > 0 && (
        <Block title="Condition notes" icon={<I.Wrench size={16} />}>
          <ul className="flex flex-col gap-2">{r.condition.map((g) => <li key={g} className="flex gap-2.5 text-[14.5px] leading-snug"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />{g}</li>)}</ul>
        </Block>
      )}
      {r.crew.length > 0 && (
        <Block title="How the crew did" icon={<I.Users size={16} />}>
          <ul className="flex flex-col gap-2">{r.crew.map((g) => <li key={g} className="flex gap-2.5 text-[14.5px] leading-snug"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-sea" />{g}</li>)}</ul>
        </Block>
      )}
    </>
  )
}
