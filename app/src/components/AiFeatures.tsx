// AI features: AI inspector (graded answers with follow-ups), Ask NilObs (answers grounded in the
// fleet records, with sources), explain-and-close-out for an observation, and a day-by-day prep plan.
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"

import * as I from "@/components/icons"
import { cn } from "@/lib/utils"
import { Chip, Scroll, TopBar } from "@/components/ui"
import { IconTile, TopicBadge } from "@/components/topicIcons"
import { LogoMark } from "@/components/Brand"
import { COSTS, CostTag, CreditPill, useWallet } from "@/credits"
import { AI_COST, pop, useProgress } from "@/progress"
import { CARDS, CHAPTER_NAMES, OBS, TYPE_NAME, cardsFor, type CardI, type Obs } from "@/fleet"
import { RANK_NAMES, RANK_TOPICS, type Brief, type Topic } from "@/data"
import { STORIES, storyById } from "@/stories"
import {
  HIDE_CODES, aiErrorCopy, askRules, citedIds, contextBlock, inline, mdBlocks, retrieve, useSample,
  type AiErr, type Context, type SampleMsg,
} from "@/ai"
import type { AppScreen } from "@/nav"

/* =====================================================================
   Shared bits
   ===================================================================== */
export function AiChip({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#7b5cff] to-[#2a78d6] px-2 py-0.5 text-[10.5px] font-bold tracking-wide text-white", className)}>
      <I.Sparkle size={11} /> AI
    </span>
  )
}

function Thinking({ label = "Thinking" }: { label?: string }) {
  return (
    <span className="flex items-center gap-2 text-[13.5px] font-medium text-mute" role="status">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="size-1.5 rounded-full bg-primary" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ repeat: Infinity, duration: 1.1, delay: i * 0.18 }} />
        ))}
      </span>
      {label}…
    </span>
  )
}

export function AiOff({ children }: { children?: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-dashed border-line bg-surface p-4 text-[13.5px] leading-snug">
      <IconTile icon={I.Sparkle} color="violet" size={34} />
      <span className="flex flex-col gap-1">
        <b className="font-semibold">Sign in to Claude to switch on AI</b>
        <span className="text-mute">{children ?? "Use the Sign in button at the top right of this page, then reload. The AI runs on your own Claude account, and Claude asks you once to allow it."}</span>
      </span>
    </div>
  )
}

/** Renders the small markdown Claude writes, with [O12]/[C3]/[S105] citations as pills. */
export function Md({ text, onCite, valid }: { text: string; onCite?: (id: string) => void; valid?: Set<string> }) {
  const blocks = mdBlocks(text)
  const render = (t: string) =>
    inline(t).map((p, i) =>
      p.t === "b" ? (
        <b key={i} className="font-semibold text-ink">{p.v}</b>
      ) : p.t === "cite" && valid && !valid.has(p.v) ? null : p.t === "cite" ? (
        <button key={i} type="button" onClick={() => onCite?.(p.v)} className="mx-0.5 inline-flex h-5 items-center rounded-full bg-primary-soft px-1.5 align-[1px] font-mono text-[10.5px] font-semibold text-primary hover:bg-primary hover:text-on-primary">
          {p.v}
        </button>
      ) : (
        <Fragment key={i}>{p.v}</Fragment>
      )
    )
  const out: ReactNode[] = []
  let list: ReactNode[] = []
  const flush = () => {
    if (list.length) out.push(<ul key={`ul${out.length}`} className="flex flex-col gap-1.5 pl-1">{list}</ul>)
    list = []
  }
  blocks.forEach((b, i) => {
    if (b.kind === "li") list.push(<li key={i} className="flex gap-2.5"><span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-primary" /><span>{render(b.text)}</span></li>)
    else {
      flush()
      out.push(b.kind === "h" ? <h4 key={i} className="pt-1 text-[14.5px] font-bold text-ink">{render(b.text)}</h4> : <p key={i}>{render(b.text)}</p>)
    }
  })
  flush()
  return <div className="flex flex-col gap-2 text-[14.5px] leading-relaxed">{out}</div>
}

function SourceCard({ id, onOpenStory }: { id: string; onOpenStory?: (sid: number) => void }) {
  const kind = id[0], n = Number(id.slice(1))
  if (kind === "O") {
    const o = OBS[n]
    if (!o) return null
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-2.5 text-[12.5px] leading-snug">
        <span className="font-mono text-[10.5px] font-semibold text-mute">{id} · Observation · ch {o.c} {CHAPTER_NAMES[o.c] || ""}{o.y ? ` · ${TYPE_NAME[o.y]}` : ""}</span>
        <span>{o.t}</span>
        {o.f && <span className="text-sea">Fix: {o.f}</span>}
      </div>
    )
  }
  if (kind === "C") {
    const c = CARDS[n]
    if (!c) return null
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-2.5 text-[12.5px] leading-snug">
        <span className="font-mono text-[10.5px] font-semibold text-mute">{id} · Trending question · {c.r}</span>
        <span className="font-semibold">{c.q}</span>
        <span className="text-mute">{c.a}</span>
      </div>
    )
  }
  const s = STORIES.find((x) => x.d.id === n)
  if (!s) return null
  return (
    <button type="button" onClick={() => onOpenStory?.(n)} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-2.5 text-left text-[12.5px] leading-snug hover:border-primary/50">
      <span className="font-mono text-[10.5px] font-semibold text-mute">{id} · Inspection · {s.place} · {s.date}</span>
      <span className="font-semibold">{s.headline}</span>
      <span className="text-primary">Open the story →</span>
    </button>
  )
}

/* =====================================================================
   Ask NilObs
   ===================================================================== */
const ctxIds = (c?: Context) => new Set([...(c?.obs || []).map((x) => x.id), ...(c?.cards || []).map((x) => x.id), ...(c?.stories || []).map((x) => x.id)])
type Msg = { id: number; role: "user" | "assistant"; text: string; status?: "thinking" | "streaming" | "done" | "error"; error?: string; ctx?: Context }

export function suggestionsFor(rank: string) {
  const r = RANK_NAMES[rank] || rank
  const byRank: Record<string, string[]> = {
    Master: ["What do inspectors check in the master's documents first?", "How do I prepare the crew for interviews?"],
    "C/O": ["What do inspectors check on gas detectors?", "Common mooring observations and how to avoid them"],
    "2/O": ["What will the inspector ask me about ECDIS?", "How do I explain our UKC policy?"],
    "3/O": ["What do inspectors check on lifeboats and LSA?", "How do I answer questions about drills?"],
    "C/E": ["Which engine room alarm tests do inspectors ask for?", "Common machinery space observations"],
  }
  return [...(byRank[rank] || byRank["2/O"]), `Make me a 5-day prep plan as ${r}`, "How do I close out an observation well?"]
}

export function AskScreen({ rank, ship, seed, clearSeed, openStory, go }: { rank: string; ship: string; seed?: string | null; clearSeed?: () => void; openStory: (id: number) => void; go: (s: AppScreen) => void }) {
  const sample = useSample()
  const prog = useProgress()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const ctl = useRef<AbortController | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const seq = useRef(1)
  useEffect(() => {
    // braces matter: newer Chrome returns a Promise from scrollIntoView, which React would treat as a cleanup
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [msgs])
  useEffect(() => () => ctl.current?.abort(), [])

  const ask = async (q: string) => {
    q = q.trim()
    if (!q || busy || !sample) return
    if (!prog.payAi("Ask NilObs")) return
    const ctx = retrieve(q, rank)
    const history = msgs.filter((m) => m.status !== "error" && m.text).slice(-6)
    const turns: SampleMsg[] = [
      { role: "user", content: askRules(rank, ship) },
      ...history.map((m) => ({ role: m.role, content: m.text }) as SampleMsg),
      { role: "user", content: `Question: ${q}\n\nCONTEXT (real de-identified inspection records; cite by id):\n${contextBlock(ctx)}` },
    ]
    const uid = seq.current++, aid = seq.current++
    setMsgs((m) => [...m, { id: uid, role: "user", text: q }, { id: aid, role: "assistant", text: "", status: "thinking", ctx }])
    setText("")
    setBusy(true)
    const c = new AbortController()
    ctl.current = c
    try {
      const { text: out } = await sample(turns, {
        cache: false,
        signal: c.signal,
        onText: ({ text: t }) => setMsgs((m) => m.map((x) => (x.id === aid ? { ...x, text: t, status: "streaming" } : x))),
      })
      setMsgs((m) => m.map((x) => (x.id === aid ? { ...x, text: out, status: "done" } : x)))
      prog.bonus(5)
    } catch (err) {
      const e = err as AiErr
      setMsgs((m) => m.map((x) => (x.id === aid ? { ...x, text: e.text ?? "", status: e.code === "cancelled" ? "done" : "error", error: aiErrorCopy(e) } : x)))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (seed && sample) {
      ask(seed)
      clearSeed?.()
    }
  }, [seed, sample]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <TopBar title="Ask NilObs" right={<CreditPill className="h-9" />} />
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4 [&>*]:shrink-0">
        {!msgs.length && (
          <section className="glass-deep flex flex-col gap-3 rounded-[24px] p-5">
            <div className="flex items-center gap-3">
              <LogoMark size={44} />
              <span className="flex flex-col">
                <span className="display text-[21px] leading-tight font-bold text-white">Ask anything about your inspection</span>
                <span className="text-[13px] text-white/70">Answers draw on {OBS.length} real observations, {CARDS.length} Q&As and {STORIES.length} inspections, with sources.</span>
              </span>
            </div>
            <span className="text-[12px] text-white/60">{prog.aiLeft > 0 ? `${prog.aiLeft} free AI question${prog.aiLeft > 1 ? "s" : ""} left today, then ${AI_COST} credits each.` : `${AI_COST} credits per question today. Free questions reset tomorrow.`}</span>
          </section>
        )}
        {sample === null && <AiOff />}
        {!msgs.length && sample !== null && (
          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-semibold text-mute">Try one</span>
            {suggestionsFor(rank).map((s) => (
              <button key={s} type="button" disabled={!sample || busy} onClick={() => ask(s)} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 text-left text-[14px] font-medium hover:border-primary/50 disabled:opacity-50">
                <I.Sparkle size={16} className="shrink-0 text-[#7b5cff]" />{s}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m) =>
          m.role === "user" ? (
            <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-[86%] self-end rounded-[20px] rounded-br-[6px] bg-primary px-4 py-3 text-[14.5px] leading-snug text-on-primary">{m.text}</motion.div>
          ) : (
            <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2.5">
              <div className="glass flex flex-col gap-3 rounded-[22px] rounded-bl-[6px] p-4">
                <span className="flex items-center gap-2 text-[12px] font-semibold text-mute"><LogoMark size={22} /> NilObs <AiChip /></span>
                {m.status === "thinking" && (
                  <div className="flex flex-col gap-2">
                    <Thinking label={`Read ${(m.ctx?.obs.length || 0) + (m.ctx?.cards.length || 0) + (m.ctx?.stories.length || 0)} matching records. Writing your answer`} />
                    <button type="button" onClick={() => ctl.current?.abort()} className="self-start text-[12.5px] font-semibold text-mute underline underline-offset-2">Stop</button>
                  </div>
                )}
                {m.text && <Md text={m.text} valid={ctxIds(m.ctx)} onCite={(id) => (id[0] === "S" ? openStory(Number(id.slice(1))) : setOpen((o) => ({ ...o, [`${m.id}:${id}`]: !o[`${m.id}:${id}`] })))} />}
                {m.status === "streaming" && <button type="button" onClick={() => ctl.current?.abort()} className="self-start text-[12.5px] font-semibold text-mute underline underline-offset-2">Stop</button>}
                {m.error && <p className="flex items-center gap-2 text-[13px] font-medium text-signal-ink"><I.Alert size={15} />{m.error}</p>}
              </div>
              {m.status === "done" && m.text && (() => {
                const ok = ctxIds(m.ctx)
                const ids = citedIds(m.text).filter((id) => ok.has(id))
                const opened = ids.filter((id) => open[`${m.id}:${id}`] || id[0] === "S")
                return ids.length ? (
                  <div className="flex flex-col gap-1.5 pl-2">
                    <span className="text-[11.5px] font-semibold text-mute">Sources in this answer: tap a tag to read it</span>
                    {opened.map((id) => <SourceCard key={id} id={id} onOpenStory={openStory} />)}
                  </div>
                ) : null
              })()}
            </motion.div>
          )
        )}
        <div ref={end} />
      </div>
      <form
        className="glass flex shrink-0 items-end gap-2 rounded-none border-x-0 border-b-0 px-3.5 pt-3 pb-3"
        onSubmit={(e) => {
          e.preventDefault()
          ask(text)
        }}
      >
        <label htmlFor="ask-box" className="sr-only">Ask NilObs</label>
        <textarea
          id="ask-box"
          rows={1}
          value={text}
          disabled={!sample}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              ask(text)
            }
          }}
          placeholder={sample === null ? "Sign in to Claude (top right) to ask" : "Ask about any part of the inspection…"}
          className="max-h-32 min-h-12 flex-1 resize-none rounded-xl border border-line bg-white/80 px-3 py-3 text-[14.5px] leading-snug outline-none focus:border-primary disabled:opacity-60"
        />
        {busy ? (
          <button type="button" aria-label="Stop" onClick={() => ctl.current?.abort()} className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface"><span className="size-3.5 rounded-[3px] bg-ink" /></button>
        ) : (
          <button type="submit" aria-label="Send" disabled={!sample || !text.trim()} className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#7b5cff] to-[#1660d6] text-white disabled:opacity-40"><I.Send size={19} /></button>
        )}
      </form>
      <button type="button" onClick={() => go("today")} className="sr-only">Back to Today</button>
    </>
  )
}

/** Compact entry point for Today. */
export function AskCard({ rank, onAsk }: { rank: string; onAsk: (q?: string) => void }) {
  const [q, setQ] = useState("")
  return (
    <section className="glass flex flex-col gap-3 rounded-[22px] p-4">
      <span className="flex items-center gap-2 text-[15px] font-bold"><LogoMark size={28} /> Ask NilObs <AiChip /></span>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); onAsk(q.trim() || undefined) }}>
        <label htmlFor="askcard-q" className="sr-only">Your question</label>
        <input id="askcard-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. What do inspectors check on gas meters?" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white/80 px-3 text-[14px] outline-none focus:border-primary" />
        <button type="submit" aria-label="Ask" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#7b5cff] to-[#1660d6] text-white"><I.Send size={17} /></button>
      </form>
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {suggestionsFor(rank).slice(0, 3).map((s) => (
          <button key={s} type="button" onClick={() => onAsk(s)} className="h-9 shrink-0 rounded-full border border-line bg-surface px-3 text-[12.5px] font-medium whitespace-nowrap hover:border-primary/50">{s}</button>
        ))}
      </div>
    </section>
  )
}

/* =====================================================================
   AI inspector
   ===================================================================== */
type Check = { ok: boolean; note: string }
type Grade = { score: number; verdict: string; fact: Check; procedure: Check; record: Check; missing: string[]; followUp: string; model: string }
type Turn = { q: string; answer: string; grade?: Grade; follow?: boolean; card: CardI }

const gradePrompt = (rank: string, ship: string, q: string, card: CardI, answer: string, follow?: string) => `You are an experienced OCIMF SIRE 2.0 vetting inspector interviewing the ${RANK_NAMES[rank] || rank} of a ${ship.toLowerCase()} tanker. Grade the officer's spoken answer the way a fair but thorough inspector would.

${follow ? `This is your follow-up to the earlier question "${follow}".\n` : ""}Your question: ${q}
Reference notes from experienced superintendents (what inspectors expect): ${card.a}${card.t ? ` Note: ${card.t}` : ""}
The officer answered: """${answer.slice(0, 1500)}"""

Score 0-10. Check three things: the FACT (correct knowledge), the PROCEDURE (do they know where the SMS or company procedure covers it) and the RECORD (do they mention what record or evidence they would show). Do not invent regulation numbers. If the answer is empty or "I don't know", score 0-2 and teach.

Reply with only JSON:
{"score": 7, "verdict": "Satisfactory" | "Needs work" | "Likely observation", "fact": {"ok": true, "note": "short"}, "procedure": {"ok": false, "note": "short"}, "record": {"ok": false, "note": "short"}, "missing": ["up to 3 short points they missed"], "followUp": "one probing follow-up question you would ask next, in the inspector's voice", "model": "a strong answer in first person, 2-4 sentences, as the officer would say it"}`

function ScoreRing({ score }: { score: number }) {
  const r = 26, c = 2 * Math.PI * r
  const col = score >= 8 ? "#0b7d64" : score >= 5 ? "#e08a00" : "#c4410c"
  return (
    <span className="relative inline-flex size-[64px] shrink-0 items-center justify-center" role="img" aria-label={`Score ${score} out of 10`}>
      <svg width="64" height="64" className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(19,52,96,0.1)" strokeWidth="6" />
        <motion.circle cx="32" cy="32" r={r} fill="none" stroke={col} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - score / 10) }} transition={{ duration: 0.8 }} />
      </svg>
      <span className="display absolute text-[20px] font-bold">{score}</span>
    </span>
  )
}

export function AiInspector({ rank, ship, fallback }: { rank: string; ship: string; fallback: ReactNode }) {
  const sample = useSample()
  const wallet = useWallet()
  const prog = useProgress()
  const topics = useMemo(() => [...new Set(cardsFor("trending", rank).map((c) => c.p))].slice(0, 8), [rank])
  const [topic, setTopic] = useState<Topic | null>(null)
  const [phase, setPhase] = useState<"setup" | "ask" | "grading" | "graded" | "done">("setup")
  const [qs, setQs] = useState<CardI[]>([])
  const [idx, setIdx] = useState(0)
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState("")
  const [err, setErr] = useState("")
  const [showModel, setShowModel] = useState(false)
  const [debrief, setDebrief] = useState("")
  const [debriefBusy, setDebriefBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [turns, phase])

  if (sample === undefined) return <Scroll className="pt-6"><Thinking label="Getting the AI inspector ready" /></Scroll>
  if (sample === null)
    return (
      <>
        <div className="px-5 pb-3"><AiOff>Sign in to Claude at the top right, then reload, and the AI inspector will grade your answers. Until then, here's the practice version with set answers.</AiOff></div>
        {fallback}
      </>
    )

  const current = turns[turns.length - 1]
  const start = () => {
    if (!wallet.spend(COSTS.interview, `AI inspector (${rank})`)) return
    const pool = cardsFor("trending", rank).filter((c) => !topic || c.p === topic)
    const pick = [...pool].sort(() => Math.random() - 0.5).slice(0, 5)
    setQs(pick)
    setIdx(0)
    setTurns([{ q: pick[0].q, answer: "", card: pick[0] }])
    setPhase("ask")
    setDebrief("")
  }
  const submit = async (ans: string) => {
    if (!current || !ans.trim()) return
    setErr("")
    setPhase("grading")
    setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, answer: ans.trim() } : x)))
    setText("")
    try {
      const prev = current.follow ? turns[turns.length - 2]?.q : undefined
      const g = await sample.json<Grade>(gradePrompt(rank, ship, current.q, current.card, ans, prev), { modelTier: "quick" })
      const grade: Grade = {
        score: Math.max(0, Math.min(10, Math.round(Number(g?.score) || 0))),
        verdict: String(g?.verdict || "Needs work"),
        fact: { ok: !!g?.fact?.ok, note: String(g?.fact?.note || "") },
        procedure: { ok: !!g?.procedure?.ok, note: String(g?.procedure?.note || "") },
        record: { ok: !!g?.record?.ok, note: String(g?.record?.note || "") },
        missing: Array.isArray(g?.missing) ? g.missing.slice(0, 3).map(String) : [],
        followUp: String(g?.followUp || ""),
        model: String(g?.model || ""),
      }
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, grade } : x)))
      setPhase("graded")
      setShowModel(false)
      prog.bonus(grade.score >= 8 ? 30 : 20)
      if (grade.score >= 8) pop(scrollRef.current)
    } catch (e) {
      setErr(aiErrorCopy(e as AiErr))
      setPhase("ask")
      setText(ans)
      if (HIDE_CODES.includes((e as AiErr).code || "")) setPhase("setup")
    }
  }
  const next = (follow: boolean) => {
    if (follow && current?.grade?.followUp) {
      setTurns((t) => [...t, { q: current.grade!.followUp, answer: "", follow: true, card: current.card }])
      setPhase("ask")
      return
    }
    const n = idx + 1
    if (n >= qs.length) {
      setPhase("done")
      return
    }
    setIdx(n)
    setTurns((t) => [...t, { q: qs[n].q, answer: "", card: qs[n] }])
    setPhase("ask")
  }
  const runDebrief = async () => {
    setDebriefBusy(true)
    setDebrief("")
    const lines = turns.filter((t) => t.grade).map((t) => `Q: ${t.q}\nScore ${t.grade!.score}/10. Missed: ${t.grade!.missing.join("; ") || "nothing major"}`).join("\n\n")
    try {
      await sample(`You are a SIRE 2.0 vetting superintendent debriefing a ${RANK_NAMES[rank] || rank} after a mock inspection interview. Here are their results:\n\n${lines}\n\nWrite: one line on how they came across, then "**Fix these before the inspection**" with exactly 3 "- " bullets (specific, practical), then one encouraging line. Under 140 words. No invented regulation numbers.`, {
        modelTier: "quick",
        onText: ({ text: t }) => setDebrief(t),
      })
    } catch (e) {
      setDebrief(aiErrorCopy(e as AiErr))
    } finally {
      setDebriefBusy(false)
    }
  }

  if (phase === "setup")
    return (
      <Scroll className="pt-1">
        <section className="glass-deep flex flex-col gap-4 rounded-[24px] p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="flex flex-col gap-1">
              <span className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.06em] text-white/60 uppercase">AI inspector <AiChip /></span>
              <span className="display text-[23px] leading-tight font-bold text-white">An inspector who grades every answer</span>
            </span>
            <IconTile icon={I.Mic} color="violet" size={50} />
          </div>
          <span className="text-[14px] leading-relaxed text-white/75">Five real questions for a {RANK_NAMES[rank] || rank}. Answer the way you would on board. You get a score, what you missed on the fact, the procedure and the record, a model answer, and the follow-up an inspector would ask next.</span>
          <button type="button" onClick={start} className="sheen flex h-12 items-center justify-between rounded-2xl bg-gradient-to-r from-[#ffcf5a] to-[#ff7a2f] px-4 text-[15px] font-bold text-[#2a1200]">
            Start the interview <CostTag cost={COSTS.interview} />
          </button>
        </section>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-mute">Focus on a topic (optional)</span>
          <div className="flex flex-wrap gap-1.5">
            <Chip size="sm" on={!topic} onClick={() => setTopic(null)}>Mix it up</Chip>
            {topics.map((t) => <Chip key={t} size="sm" on={topic === t} onClick={() => setTopic(t)}>{t}</Chip>)}
          </div>
        </div>
        {err && <p className="text-[13px] font-medium text-signal-ink">{err}</p>}
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-line p-4">
          <span className="text-[14px] font-bold">Answer like you're ready</span>
          <span className="text-[13px] leading-snug text-mute">State the fact. Say where the SMS covers it. Name the record that proves it's done.</span>
        </div>
      </Scroll>
    )

  if (phase === "done") {
    const graded = turns.filter((t) => t.grade)
    const avg = graded.length ? Math.round((graded.reduce((n, t) => n + t.grade!.score, 0) / graded.length) * 10) / 10 : 0
    return (
      <Scroll className="gap-4 pt-2">
        <section className="glass flex items-center gap-4 rounded-[22px] p-4">
          <ScoreRing score={Math.round(avg)} />
          <span className="flex flex-col gap-0.5">
            <span className="display text-[22px] leading-tight font-bold">Interview done: {avg}/10</span>
            <span className="text-[13px] text-mute">{graded.length} answers graded, including follow-ups</span>
          </span>
        </section>
        <div className="flex flex-col gap-1.5">
          {graded.map((t, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] leading-snug">
              <span className={cn("tnum flex size-8 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-bold", t.grade!.score >= 8 ? "bg-sea-soft text-sea" : t.grade!.score >= 5 ? "bg-amber-soft text-amber-ink" : "bg-signal-soft text-signal-ink")}>{t.grade!.score}</span>
              <span className="min-w-0 flex-1">{t.follow && <span className="mr-1 text-mute">Follow-up:</span>}{t.q}</span>
            </div>
          ))}
        </div>
        <section className="glass flex flex-col gap-3 rounded-[22px] p-4">
          <span className="flex items-center gap-2 text-[15px] font-bold">Your debrief <AiChip /></span>
          {debrief ? <Md text={debrief} /> : debriefBusy ? <Thinking label="Writing your debrief" /> : (
            <button type="button" onClick={runDebrief} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7b5cff] to-[#1660d6] text-[14px] font-semibold text-white"><I.Sparkle size={16} /> Get my 3 fixes</button>
          )}
        </section>
        <button type="button" onClick={() => setPhase("setup")} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-on-primary"><I.Refresh size={16} /> New interview</button>
      </Scroll>
    )
  }

  return (
    <>
      <div className="px-5 pb-2">
        <div className="flex items-center justify-between text-[12px] text-mute">
          <span className="flex items-center gap-1.5">{RANK_NAMES[rank] || rank} · AI inspector <AiChip /></span>
          <span className="tnum font-mono font-semibold text-ink">{idx + 1}/{qs.length}</span>
        </div>
        <div className="mt-2 flex gap-1">{qs.map((_, j) => <span key={j} className={cn("h-1.5 flex-1 rounded-full", j < idx ? "bg-primary" : j === idx ? "bg-[#7b5cff]" : "bg-surface-2")} />)}</div>
      </div>
      <div ref={scrollRef} className="no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto px-4 pt-2 pb-3 [&>*]:shrink-0">
        {turns.slice(-4).map((t, i, arr) => {
          const last = i === arr.length - 1
          return (
            <Fragment key={turns.length - arr.length + i}>
              <div className="flex items-end gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2a3f63] to-[#0e2a50] font-mono text-[10px] font-bold text-white">INS</span>
                <div className="glass flex max-w-[86%] flex-col gap-1.5 rounded-[18px] rounded-bl-[6px] px-3.5 py-3">
                  {t.follow && <span className="text-[11px] font-semibold text-[#7b5cff]">Follow-up</span>}
                  <span className="text-[15px] leading-snug">{t.q}</span>
                  {!t.follow && <span className="flex items-center gap-1.5 text-[11px] text-mute"><TopicBadge topic={t.card.p} size={18} />{t.card.p}</span>}
                </div>
              </div>
              {t.answer && <div className="max-w-[86%] self-end rounded-[18px] rounded-br-[6px] bg-primary px-3.5 py-3 text-[14px] leading-snug text-on-primary">{t.answer}</div>}
              {last && phase === "grading" && <div className="pl-11"><Thinking label="The inspector is weighing your answer" /></div>}
              {t.grade && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass flex flex-col gap-3 rounded-[20px] p-4">
                  <div className="flex items-center gap-3">
                    <ScoreRing score={t.grade.score} />
                    <span className="flex flex-col gap-1">
                      <span className={cn("self-start rounded-full px-2.5 py-0.5 text-[12px] font-bold", t.grade.score >= 8 ? "bg-sea-soft text-sea" : t.grade.score >= 5 ? "bg-amber-soft text-amber-ink" : "bg-signal-soft text-signal-ink")}>{t.grade.verdict}</span>
                      <span className="text-[12px] text-mute">+{t.grade.score >= 8 ? 30 : 20} XP</span>
                    </span>
                  </div>
                  {(["fact", "procedure", "record"] as const).map((k) => (
                    <div key={k} className="flex gap-2.5 text-[13px] leading-snug">
                      {t.grade![k].ok ? <I.Check size={17} className="mt-px shrink-0 text-sea" /> : <I.Alert size={16} className="mt-px shrink-0 text-signal-ink" />}
                      <span><b className="font-semibold capitalize">{k}.</b> {t.grade![k].note}</span>
                    </div>
                  ))}
                  {t.grade.missing.length > 0 && (
                    <div className="flex flex-col gap-1 rounded-xl bg-signal-soft px-3 py-2.5 text-[13px] leading-snug">
                      <b className="font-semibold text-signal-ink">You missed</b>
                      {t.grade.missing.map((m) => <span key={m}>· {m}</span>)}
                    </div>
                  )}
                  {last && (
                    <>
                      <button type="button" onClick={() => setShowModel((v) => !v)} className="self-start text-[13px] font-semibold text-primary">{showModel ? "Hide the model answer" : "Show a model answer"}</button>
                      <AnimatePresence>{showModel && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden rounded-xl bg-sea-soft px-3 py-2.5 text-[13.5px] leading-relaxed">“{t.grade.model}”</motion.p>}</AnimatePresence>
                    </>
                  )}
                </motion.div>
              )}
            </Fragment>
          )
        })}
        <div ref={endRef} />
      </div>
      <div className="glass flex shrink-0 flex-col gap-2 rounded-none border-x-0 border-b-0 px-3.5 pt-3 pb-3">
        {err && <p className="text-[12.5px] font-medium text-signal-ink">{err}</p>}
        {phase === "graded" ? (
          <div className="grid grid-cols-2 gap-2">
            {current?.grade?.followUp && !current.follow ? (
              <button type="button" onClick={() => next(true)} className="h-12 rounded-xl border border-line bg-surface text-[14px] font-semibold">Answer the follow-up</button>
            ) : <span />}
            <button type="button" onClick={() => next(false)} className={cn("flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-[14px] font-semibold text-on-primary", !(current?.grade?.followUp && !current.follow) && "col-span-2")}>
              {idx + 1 < qs.length ? "Next question" : "Finish"} <I.ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(text) }}>
            <label htmlFor="ai-answer" className="sr-only">Your answer</label>
            <textarea id="ai-answer" rows={2} value={text} disabled={phase === "grading"} onChange={(e) => setText(e.target.value)} placeholder="Answer as you'd say it to the inspector…" className="min-h-12 flex-1 resize-none rounded-xl border border-line bg-white/80 px-3 py-2 text-[14px] leading-snug outline-none focus:border-primary" />
            <div className="flex flex-col gap-1.5">
              <button type="submit" aria-label="Send answer" disabled={phase === "grading" || !text.trim()} className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#7b5cff] to-[#1660d6] text-white disabled:opacity-40"><I.Send size={19} /></button>
            </div>
          </form>
        )}
        {phase === "ask" && <button type="button" onClick={() => submit("I'm not sure.")} className="self-start text-[12px] font-medium text-mute underline underline-offset-2">I don't know, teach me</button>}
      </div>
    </>
  )
}

/* =====================================================================
   Explain an observation and draft a close-out
   ===================================================================== */
export function ExplainObs({ o, compact }: { o: Obs; compact?: boolean }) {
  const sample = useSample()
  const prog = useProgress()
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle")
  const [out, setOut] = useState("")
  const [err, setErr] = useState("")
  const [copied, setCopied] = useState(false)
  const ctl = useRef<AbortController | null>(null)
  useEffect(() => () => ctl.current?.abort(), [])
  if (!sample) return null
  const run = async () => {
    if (!prog.payAi("Explain an observation")) return
    setState("busy")
    setOut("")
    setErr("")
    const c = new AbortController()
    ctl.current = c
    try {
      await sample(`You are a vetting superintendent helping a tanker crew. An inspector raised this SIRE 2.0 observation: "${o.t}" (chapter ${o.c} ${CHAPTER_NAMES[o.c] || ""}${o.y ? `, ${TYPE_NAME[o.y]} observation` : ""}). The fleet's note on avoiding it: "${o.f}".

Write these sections, each heading in bold on its own line:
**Why it was raised** (1-2 sentences)
**Likely root cause** (1-2 "- " bullets)
**Fix on board today** (2-3 "- " bullets)
**Stop it coming back** (2 "- " bullets: procedure, training or PMS)
**Close-out response** (3-4 formal sentences the operator could submit, starting "The vessel")
No invented regulation numbers or OCIMF wording; say "check your SMS" where it depends on the company. Under 230 words.`, {
        modelTier: "quick",
        signal: c.signal,
        cache: { gcTime: 86400000 },
        onText: ({ text }) => setOut(text),
      })
      setState("done")
      prog.bonus(5)
    } catch (e) {
      const er = e as AiErr
      if (er.text) setOut(er.text)
      setErr(aiErrorCopy(er))
      setState(er.code === "cancelled" ? "done" : "error")
    }
  }
  const copyCloseOut = async () => {
    const m = out.split(/\*\*Close-out response\*\*:?/i)[1]?.trim() || out
    try {
      await navigator.clipboard.writeText(m)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }
  if (state === "idle")
    return (
      <button type="button" onClick={run} className={cn("flex items-center gap-1.5 self-start rounded-full border border-[#d9cffd] bg-[#f4f0ff]/80 font-semibold text-[#5a3bd1] hover:bg-[#ece5ff]", compact ? "h-8 px-2.5 text-[12px]" : "h-9 px-3 text-[12.5px]")}>
        <I.Sparkle size={14} /> Why, and how to close it
        <span className="font-normal text-[#5a3bd1]/70">{prog.aiLeft > 0 ? "· free" : `· ${AI_COST} credits`}</span>
      </button>
    )
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-[#d9cffd] bg-[#f7f4ff]/85 p-3.5">
      <span className="flex items-center gap-2 text-[12.5px] font-semibold text-[#5a3bd1]"><AiChip /> Superintendent's view</span>
      {out ? <Md text={out} /> : state === "busy" && <Thinking label="Working out the root cause and close-out" />}
      {err && <p className="text-[12.5px] font-medium text-signal-ink">{err}</p>}
      {state === "busy" && <button type="button" onClick={() => ctl.current?.abort()} className="self-start text-[12px] font-semibold text-mute underline underline-offset-2">Stop</button>}
      {state === "done" && /close-out/i.test(out) && (
        <button type="button" onClick={copyCloseOut} className="flex h-9 items-center gap-1.5 self-start rounded-full bg-[#5a3bd1] px-3 text-[12.5px] font-semibold text-white">
          {copied ? <><I.Check size={14} /> Copied</> : <><I.FileText size={14} /> Copy the close-out response</>}
        </button>
      )}
    </div>
  )
}

/* =====================================================================
   Day-by-day plan inside the brief
   ===================================================================== */
export function BriefPlan({ brief, date, evidence, daysLeft }: { brief: Brief; date: string; evidence: string[]; daysLeft: number }) {
  const sample = useSample()
  const [out, setOut] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const ctl = useRef<AbortController | null>(null)
  useEffect(() => () => ctl.current?.abort(), [])
  if (sample === null) return null
  const days = Math.max(1, Math.min(7, daysLeft || 3))
  const run = async (refresh = false) => {
    if (!sample) return
    setBusy(true)
    setErr("")
    const c = new AbortController()
    ctl.current = c
    const negs = brief.negatives.slice(0, 5).map((n) => n.text).join("; ")
    try {
      await sample(`You are a SIRE 2.0 vetting superintendent. Make a ${days}-day preparation plan for the ${RANK_NAMES[brief.rank] || brief.rank} of a tanker facing a ${brief.major} inspection${brief.port ? ` at ${brief.port}` : ""} on ${date}.
Likely focus topics: ${brief.focus.map((f) => f.topic).join(", ")}.
Records to have ready: ${evidence.join("; ")}.
Questions asked of this rank in recent inspections: ${brief.questions.slice(0, 8).map((q) => q.q).join(" | ")}.
Recent negative observations: ${negs}.

For each day write "**Day N**" on its own line, then 3 "- " bullets (about 20 minutes of work each, specific: what to check, what to rehearse, what to have ready). The last day is the evening before. Finish with one line starting "**On the day:**". No invented regulation numbers. Under 260 words.`, {
        signal: c.signal,
        cache: refresh ? { gcTime: 86400000, refresh: true } : { gcTime: 86400000 },
        onText: ({ text }) => setOut(text),
      })
    } catch (e) {
      const er = e as AiErr
      if (er.text) setOut(er.text)
      setErr(aiErrorCopy(er))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="glass flex flex-col gap-3 rounded-[22px] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[15px] font-bold">Your day-by-day plan <AiChip /></span>
        {out && !busy && <button type="button" onClick={() => run(true)} className="text-[12.5px] font-semibold text-primary">Make a new one</button>}
      </div>
      {out ? <Md text={out} /> : busy ? <Thinking label={`Planning your ${days} days`} /> : (
        <>
          <p className="text-[13.5px] leading-snug text-mute">Turn this brief into a {days}-day plan, 20 minutes a day, built around your oil major, rank and the records above. Included with the brief.</p>
          <button type="button" disabled={sample === undefined} onClick={() => run()} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7b5cff] to-[#1660d6] text-[14px] font-semibold text-white disabled:opacity-50"><I.Sparkle size={16} /> Make my plan</button>
        </>
      )}
      {busy && <button type="button" onClick={() => ctl.current?.abort()} className="self-start text-[12px] font-semibold text-mute underline underline-offset-2">Stop</button>}
      {err && <p className="text-[12.5px] font-medium text-signal-ink">{err}</p>}
    </section>
  )
}

export { storyById }
