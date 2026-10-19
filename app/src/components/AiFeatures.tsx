// AI features: AI inspector (graded answers, follow-ups, optional voice), Ask NilObs (answers grounded
// in the fleet records, with sources), explain-and-close-out for an observation, and a day-by-day prep plan.
// Every AI action is paid in credits up front and refunded in full if the call fails.
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"

import * as I from "@/components/icons"
import { cn } from "@/lib/utils"
import { Chip, Scroll, TopBar } from "@/components/ui"
import { IconTile, TopicBadge } from "@/components/topicIcons"
import { LogoMark } from "@/components/Brand"
import { COSTS, CostTag, CreditPill, useWallet } from "@/credits"
import { pop, useProgress } from "@/progress"
import { CARDS, CHAPTER_NAMES, OBS, TYPE_NAME, cardsFor, type CardI, type Obs } from "@/fleet"
import { RANK_NAMES, type Brief, type Topic } from "@/data"
import { STORIES, storyById } from "@/stories"
import {
  HIDE_CODES, HOSTED, aiErrorCopy, askRules, citedIds, contextBlock, inline, mdBlocks, retrieve, useSample,
  type AiErr, type SampleMsg,
} from "@/ai"
import { speak, stopSpeaking, useDictation, useStudioVoice } from "@/voice"
import { SignInForAi, useAiGate, useAuth } from "@/auth"
import type { AppScreen } from "@/nav"

/* ---------------- small persistence helper ---------------- */
function readLS<T>(key: string, init: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : init
  } catch {
    return init
  }
}
function writeLS(key: string, v: unknown) {
  try {
    if (v == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* storage unavailable */
  }
}

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

export function AiOff({ children, title }: { children?: ReactNode; title?: string }) {
  const gate = useAiGate()
  // on the NilObs site the AI is for signed-in users: show Google's button instead
  if (HOSTED && gate === "closed") return <SignInForAi title={title} />
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

/** Renders the small markdown Claude writes. Citations become numbered pills; unknown ids are dropped. */
export function Md({ text, onCite, valid, order }: { text: string; onCite?: (id: string) => void; valid?: Set<string>; order?: string[] }) {
  const blocks = mdBlocks(text)
  const label = (id: string) => {
    const n = order ? order.indexOf(id) : -1
    return n >= 0 ? String(n + 1) : id
  }
  const render = (t: string) =>
    inline(t).map((p, i) =>
      p.t === "b" ? (
        <b key={i} className="font-semibold text-ink">{p.v}</b>
      ) : p.t === "cite" && valid && !valid.has(p.v) ? null : p.t === "cite" ? (
        <button key={i} type="button" onClick={() => onCite?.(p.v)} aria-label={`Source ${label(p.v)}`} className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-soft px-1.5 align-[1px] font-mono text-[10.5px] font-semibold text-primary hover:bg-primary hover:text-on-primary">
          {label(p.v)}
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

function SourceCard({ id, n, onOpenStory }: { id: string; n?: number; onOpenStory?: (sid: number) => void }) {
  const kind = id[0], k = Number(id.slice(1))
  const num = n != null ? <span className="mr-1.5 inline-flex size-5 items-center justify-center rounded-full bg-primary-soft font-mono text-[10.5px] font-bold text-primary">{n}</span> : null
  if (kind === "O") {
    const o = OBS[k]
    if (!o) return null
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-2.5 text-[12.5px] leading-snug">
        <span className="flex items-center font-mono text-[10.5px] font-semibold text-mute">{num}Observation · {o.i} {o.s === "pv" ? "pre-vetting" : o.s} · ch {o.c} {CHAPTER_NAMES[o.c] || ""}{o.q ? ` · Q ${o.q}` : ""}{o.y ? ` · ${TYPE_NAME[o.y]}` : ""}</span>
        <span>{o.t}</span>
        {o.f && <span className="text-sea">Fix: {o.f}</span>}
      </div>
    )
  }
  if (kind === "C") {
    const c = CARDS[k]
    if (!c) return null
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-2.5 text-[12.5px] leading-snug">
        <span className="flex items-center font-mono text-[10.5px] font-semibold text-mute">{num}Asked in inspections · {c.r}</span>
        <span className="font-semibold">{c.q}</span>
        <span className="text-mute">{c.a}</span>
      </div>
    )
  }
  const s = STORIES.find((x) => x.d.id === k)
  if (!s) return null
  return (
    <button type="button" onClick={() => onOpenStory?.(k)} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-2.5 text-left text-[12.5px] leading-snug hover:border-primary/50">
      <span className="flex items-center font-mono text-[10.5px] font-semibold text-mute">{num}Inspection · {s.place} · {s.date}</span>
      <span className="font-semibold">{s.headline}</span>
      <span className="text-primary">Open the story →</span>
    </button>
  )
}

/** Mic button that dictates into a text box (free; uses the browser's speech recognition). */
function MicButton({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const d = useDictation(onChange)
  if (!d.supported) return null
  return (
    <span className="relative flex shrink-0">
      <button
        type="button"
        aria-label={d.on ? "Stop dictating" : "Answer by voice"}
        aria-pressed={d.on}
        onClick={() => (d.on ? d.stop() : d.start(value))}
        className={cn("relative flex size-12 items-center justify-center rounded-xl border transition-colors", d.on ? "border-signal bg-signal text-white" : "border-line bg-surface text-ink hover:border-mute")}
      >
        {d.on && <motion.span className="absolute inset-0 rounded-xl border-2 border-signal" animate={{ scale: [1, 1.18], opacity: [0.8, 0] }} transition={{ repeat: Infinity, duration: 1.1 }} />}
        {d.on ? <I.Stop size={18} /> : <I.Mic size={19} />}
      </button>
      {d.err && !d.on && (
        <span role="alert" className="absolute right-0 bottom-full z-10 mb-2 w-60 rounded-xl bg-ink px-3 py-2 text-[12px] leading-snug text-white shadow-lg">{d.err}</span>
      )}
    </span>
  )
}

/* =====================================================================
   Ask NilObs
   ===================================================================== */
type Mode = "quick" | "deep" | "expert"
const MODES: { id: Mode; label: string; cost: number; tier: "quick" | "default" | "complex"; sub: string }[] = [
  { id: "quick", label: "Quick", cost: COSTS.askQuick, tier: "quick", sub: "Fast, short answers" },
  { id: "deep", label: "Deep", cost: COSTS.askDeep, tier: "default", sub: "Fuller answers with more sources" },
  { id: "expert", label: "Expert", cost: COSTS.askExpert, tier: "complex", sub: "Deepest reasoning. Command plan" },
]
type Msg = { id: number; role: "user" | "assistant"; text: string; status?: "thinking" | "streaming" | "done" | "error"; error?: string; ids?: string[]; read?: number; mode?: Mode; q?: string; heard?: boolean }
const ASK_KEY = "sr.ask"
/** Saved chats are checked on load: bad entries are dropped, and a question whose answer never arrived gets a retry. */
function loadChat(): { msgs: Msg[]; mode: Mode } {
  const raw = readLS<{ msgs?: unknown; mode?: unknown }>(ASK_KEY, {})
  const mode: Mode = raw.mode === "quick" || raw.mode === "expert" ? raw.mode : "deep"
  const list = (Array.isArray(raw.msgs) ? raw.msgs : []).filter(
    (m): m is Msg => !!m && typeof m === "object" && ((m as Msg).role === "user" || (m as Msg).role === "assistant") && typeof (m as Msg).text === "string" && typeof (m as Msg).id === "number"
  )
  const out: Msg[] = []
  list.forEach((m, i) => {
    if (m.role === "assistant" && (m.status === "thinking" || m.status === "streaming")) return
    out.push({ ...m, ids: Array.isArray(m.ids) ? m.ids.filter((x) => typeof x === "string") : [] })
    const next = list[i + 1]
    if (m.role === "user" && (!next || next.role !== "assistant" || next.status === "thinking" || next.status === "streaming"))
      out.push({ id: m.id + 0.5, role: "assistant", text: "", status: "error", q: m.text, error: "The page closed before this answer arrived. Your credits come back automatically within a couple of minutes." })
  })
  return { msgs: out, mode }
}

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

export function AskScreen({ rank, ship, seed, seedAuto = true, clearSeed, openStory, go }: { rank: string; ship: string; seed?: string | null; seedAuto?: boolean; clearSeed?: () => void; openStory: (id: number) => void; go: (s: AppScreen) => void }) {
  const sample = useSample()
  const wallet = useWallet()
  const prog = useProgress()
  const studio = useStudioVoice()
  const saved = useMemo(loadChat, [])
  const [msgs, setMsgs] = useState<Msg[]>(saved.msgs)
  const [mode, setMode] = useState<Mode>(saved.mode)
  const busySince = useRef(0)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [speaking, setSpeaking] = useState<number | null>(null)
  const ctl = useRef<AbortController | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const seq = useRef(Math.max(0, ...msgs.map((m) => m.id)) + 1)
  const m = MODES.find((x) => x.id === mode)!
  const expertLocked = mode === "expert" && !wallet.perks.expert
  useEffect(() => {
    // braces matter: newer Chrome returns a Promise from scrollIntoView, which React would treat as a cleanup
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [msgs])
  useEffect(() => () => {
    ctl.current?.abort()
    stopSpeaking()
  }, [])
  useEffect(() => {
    writeLS(ASK_KEY, { msgs: msgs.filter((x) => x.status !== "thinking" && x.status !== "streaming").slice(-30), mode })
  }, [msgs, mode])

  const ask = async (q: string) => {
    q = q.trim()
    if (!q || busy || !sample) return
    if (expertLocked) {
      wallet.openPlans({ reason: "Expert answers come with the Command plan.", select: "command" })
      return
    }
    const receipt = wallet.charge({ kind: mode === "quick" ? "askQuick" : mode === "expert" ? "askExpert" : "askDeep" })
    if (!receipt) return
    busySince.current = Date.now()
    const ctx = retrieve(q, rank, mode === "quick" ? { obs: 5, cards: 4, stories: 2 } : { obs: 8, cards: 7, stories: 3 })
    const ids = [...ctx.obs.map((x) => x.id), ...ctx.cards.map((x) => x.id), ...ctx.stories.map((x) => x.id)]
    const history = msgs.filter((x) => x.status !== "error" && x.text).slice(-6)
    const turns: SampleMsg[] = [
      { role: "user", content: askRules(rank, ship) + (mode === "quick" ? "\n- This is a quick answer: under 120 words." : mode === "expert" ? "\n- Expert answer: think it through like a vetting superintendent; cover what to show, what to say, the traps and how to close any gap. Up to 400 words." : "") },
      ...history.map((x) => ({ role: x.role, content: x.text }) as SampleMsg),
      { role: "user", content: `Question: ${q}\n\nCONTEXT (real de-identified inspection records; cite by id):\n${contextBlock(ctx)}` },
    ]
    const uid = seq.current++, aid = seq.current++
    setMsgs((x) => [...x, { id: uid, role: "user", text: q }, { id: aid, role: "assistant", text: "", status: "thinking", ids, read: ids.length, mode, q }])
    setText("")
    setBusy(true)
    const c = new AbortController()
    ctl.current = c
    let got = ""
    try {
      const { text: out } = await sample(turns, {
        cache: false,
        modelTier: m.tier,
        ticket: receipt,
        signal: c.signal,
        onText: ({ text: t }) => {
          got = t
          setMsgs((x) => x.map((y) => (y.id === aid ? { ...y, text: t, status: "streaming" } : y)))
        },
      })
      wallet.settle(receipt)
      setMsgs((x) => x.map((y) => (y.id === aid ? { ...y, text: out, status: "done" } : y)))
      prog.aiXp("ask")
    } catch (err) {
      const e = err as AiErr
      // a failed answer costs nothing; a stopped one is only charged if some of it arrived
      const partial = !!(e.text ?? got).trim()
      if (e.code === "cancelled" && partial) wallet.settle(receipt)
      else wallet.refund(receipt)
      if (e.code === "cancelled" && !partial) {
        // stopped before anything arrived: take the question back out and put it in the box
        setMsgs((x) => x.filter((y) => y.id !== aid && y.id !== uid))
        setText(q)
      } else setMsgs((x) => x.map((y) => (y.id === aid ? { ...y, text: e.text ?? got, status: e.code === "cancelled" ? "done" : "error", error: e.code === "cancelled" ? undefined : e.code === "payment" ? aiErrorCopy(e) : `${aiErrorCopy(e)} Your ${m.cost} credit${m.cost > 1 ? "s were" : " was"} refunded.` } : y)))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (!seed || !sample) return
    // a question typed on Today (where the price is shown) is sent; one typed elsewhere waits for a tap on Send
    if (seedAuto) ask(seed)
    else setText(seed)
    clearSeed?.()
  }, [seed, sample]) // eslint-disable-line react-hooks/exhaustive-deps
  const stop = () => {
    // a quick second tap on Send lands on Stop: ignore it
    if (Date.now() - busySince.current < 900) return
    ctl.current?.abort()
  }

  const listen = async (msg: Msg) => {
    if (speaking === msg.id) {
      stopSpeaking()
      setSpeaking(null)
      return
    }
    let receipt: string | null = null
    // the first listen in the studio voice costs a credit; replays of the same answer are free
    if (studio && !msg.heard) {
      receipt = wallet.charge({ kind: "listen" })
      if (!receipt) return
    }
    setSpeaking(msg.id)
    const plain = msg.text.replace(/\[(?:O|C|S)\d+\]/g, "")
    const how = await speak(plain, { studio: !!studio, ticket: receipt })
    if (receipt && how !== "studio") wallet.refund(receipt)
    if (how === "studio") setMsgs((x) => x.map((y) => (y.id === msg.id ? { ...y, heard: true } : y)))
    setSpeaking((s) => (s === msg.id ? null : s))
  }

  const clear = () => {
    ctl.current?.abort()
    stopSpeaking()
    setMsgs([])
    setOpen({})
  }

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
            <span className="text-[12px] text-white/60">Quick answers cost {COSTS.askQuick} credit, deep answers {COSTS.askDeep}. If an answer fails, the credits come straight back.</span>
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
        {msgs.map((x) =>
          x.role === "user" ? (
            <motion.div key={x.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-[86%] self-end rounded-[20px] rounded-br-[6px] bg-primary px-4 py-3 text-[14.5px] leading-snug text-on-primary">{x.text}</motion.div>
          ) : (
            <motion.div key={x.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2.5">
              {(() => {
                const ok = new Set(x.ids || [])
                const order = citedIds(x.text).filter((id) => ok.has(id))
                return (
                  <>
                    <div className="glass flex flex-col gap-3 rounded-[22px] rounded-bl-[6px] p-4">
                      <span className="flex items-center gap-2 text-[12px] font-semibold text-mute">
                        <LogoMark size={22} /> NilObs <AiChip />
                        {x.mode && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold">{MODES.find((y) => y.id === x.mode)?.label}</span>}
                        {x.status === "done" && x.text && (
                          <button type="button" onClick={() => listen(x)} aria-pressed={speaking === x.id} className="ml-auto flex h-7 items-center gap-1 rounded-full border border-line px-2 text-[11.5px] font-semibold text-ink hover:border-mute">
                            {speaking === x.id ? <><I.Stop size={12} /> Stop</> : <><I.Volume size={13} /> Listen{studio && !x.heard ? <span className="font-mono text-mute"> · {COSTS.listen}</span> : null}</>}
                          </button>
                        )}
                      </span>
                      {x.status === "thinking" && (
                        <div className="flex flex-col gap-2">
                          <Thinking label={`Read ${x.read ?? 0} matching records. Writing your ${x.mode === "quick" ? "quick" : x.mode === "expert" ? "expert" : ""} answer`.replace("  ", " ")} />
                          <button type="button" onClick={stop} className="self-start text-[12.5px] font-semibold text-mute underline underline-offset-2">Stop</button>
                        </div>
                      )}
                      {x.text && <Md text={x.text} valid={ok} order={order} onCite={(id) => (id[0] === "S" ? openStory(Number(id.slice(1))) : setOpen((o) => ({ ...o, [`${x.id}:${id}`]: !o[`${x.id}:${id}`] })))} />}
                      {x.status === "streaming" && <button type="button" onClick={stop} className="self-start text-[12.5px] font-semibold text-mute underline underline-offset-2">Stop</button>}
                      {x.error && (
                        <div className="flex flex-col gap-2">
                          <p className="flex items-start gap-2 text-[13px] font-medium text-signal-ink"><I.Alert size={15} className="mt-0.5 shrink-0" />{x.error}</p>
                          {x.q && <button type="button" disabled={busy} onClick={() => ask(x.q!)} className="flex h-9 items-center gap-1.5 self-start rounded-full border border-line px-3 text-[12.5px] font-semibold hover:border-mute"><I.Refresh size={14} /> Try again</button>}
                        </div>
                      )}
                    </div>
                    {x.status === "done" && order.length > 0 && (
                      <div className="flex flex-col gap-1.5 pl-2">
                        <span className="text-[11.5px] font-semibold text-mute">Sources: tap a number to read it</span>
                        {order.filter((id) => open[`${x.id}:${id}`] || id[0] === "S").map((id) => <SourceCard key={id} id={id} n={order.indexOf(id) + 1} onOpenStory={openStory} />)}
                      </div>
                    )}
                  </>
                )
              })()}
            </motion.div>
          )
        )}
        <div ref={end} />
      </div>
      <form
        className="glass flex shrink-0 flex-col gap-2 rounded-none border-x-0 border-b-0 px-3.5 pt-2.5 pb-3"
        onSubmit={(e) => {
          e.preventDefault()
          ask(text)
        }}
      >
        <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Answer depth">
          {MODES.map((x) => {
            const locked = x.id === "expert" && !wallet.perks.expert
            return (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={mode === x.id}
                title={x.sub}
                onClick={() => (locked ? wallet.openPlans({ reason: "Expert answers come with the Command plan.", select: "command" }) : setMode(x.id))}
                className={cn("flex h-8 items-center gap-1 rounded-full border px-2.5 text-[12px] font-semibold", mode === x.id ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-mute hover:text-ink")}
              >
                {locked && <I.Lock size={11} />}
                {x.label}
                <span className="font-mono text-[11px] font-normal opacity-80">· {x.cost}</span>
              </button>
            )
          })}
          <span className="ml-auto hidden text-[11.5px] text-mute sm:inline">{m.sub}</span>
          {msgs.length > 0 && <button type="button" onClick={clear} className="ml-auto h-8 shrink-0 rounded-full px-2 text-[12px] font-semibold whitespace-nowrap text-mute hover:text-ink sm:ml-2">New chat</button>}
        </div>
        <div className="flex items-end gap-2">
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
            placeholder={sample === null ? (HOSTED ? "Sign in with Google to ask" : "Sign in to Claude (top right) to ask") : "Ask about the inspection…"}
            className="max-h-32 min-h-12 flex-1 resize-none rounded-xl border border-line bg-white/80 px-3 py-3 text-[14.5px] leading-snug outline-none focus:border-primary disabled:opacity-60"
          />
          {sample && !busy && <MicButton value={text} onChange={setText} />}
          {busy ? (
            <button type="button" aria-label="Stop" onClick={stop} className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface"><span className="size-3.5 rounded-[3px] bg-ink" /></button>
          ) : (
            <button type="submit" aria-label="Send" disabled={!sample || !text.trim()} className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#7b5cff] to-[#1660d6] text-white disabled:opacity-40"><I.Send size={19} /></button>
          )}
        </div>
      </form>
      <button type="button" onClick={() => go("today")} className="sr-only">Back to Today</button>
    </>
  )
}

/** Compact entry point for Today. */
export function AskCard({ rank, onAsk }: { rank: string; onAsk: (q?: string) => void }) {
  const [q, setQ] = useState("")
  const mode = useMemo(() => MODES.find((x) => x.id === loadChat().mode) ?? MODES[1], [])
  return (
    <section className="glass flex flex-col gap-3 rounded-[22px] p-4">
      <span className="flex items-center gap-2 text-[15px] font-bold"><LogoMark size={28} /> Ask NilObs <AiChip /><span className="ml-auto font-mono text-[11px] font-normal text-mute">{mode.label} · {mode.cost} credit{mode.cost > 1 ? "s" : ""}</span></span>
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
type Turn = { q: string; answer: string; grade?: Grade; follow?: boolean; card: number; xp?: number }
type Phase = "setup" | "ask" | "grading" | "graded" | "done"
interface Session {
  id: string
  rank: string
  phase: Phase
  qs: number[]
  idx: number
  turns: Turn[]
  voice: boolean
  receipt: string | null
  debrief: string
  recorded: boolean
}
const INT_KEY = "sr.interview"
const QUESTIONS = 5
/** Grading calls still running, by session id. They outlive the screen, so leaving mid-grade loses nothing. */
const inflight = new Map<string, Promise<void>>()
/** A saved session, checked: anything malformed starts a fresh one. */
function loadSession(rank: string): Session {
  const s = readLS<Session | null>(INT_KEY, null)
  const ok =
    s && typeof s === "object" && typeof s.id === "string" && Array.isArray(s.turns) && Array.isArray(s.qs) &&
    s.qs.every((i) => typeof i === "number" && !!CARDS[i]) && s.turns.every((t) => t && typeof t.q === "string" && typeof t.answer === "string" && !!CARDS[t.card])
  if (!ok) return newSession(rank)
  return s
}

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

/** Five questions for the rank; a topic focus takes up to five from that topic and fills the rest. */
function pickQuestions(rank: string, topic: Topic | null) {
  const pool = cardsFor("trending", rank)
  const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5)
  const focus = topic ? shuffle(pool.filter((c) => c.p === topic)).slice(0, QUESTIONS) : []
  const rest = shuffle(pool.filter((c) => !focus.includes(c))).slice(0, QUESTIONS - focus.length)
  return [...focus, ...rest].map((c) => c.i)
}

const newSession = (rank: string): Session => ({ id: Math.random().toString(36).slice(2, 10), rank, phase: "setup", qs: [], idx: 0, turns: [], voice: false, receipt: null, debrief: "", recorded: false })

export function AiInspector({ rank, ship, fallback }: { rank: string; ship: string; fallback: ReactNode }) {
  const sample = useSample()
  const wallet = useWallet()
  const prog = useProgress()
  const studio = useStudioVoice()
  const topics = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of cardsFor("trending", rank)) counts.set(c.p, (counts.get(c.p) || 0) + 1)
    return [...counts].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t as Topic)
  }, [rank])
  const [topic, setTopic] = useState<Topic | null>(null)
  const [voicePick, setVoicePick] = useState(false)
  const [ses, setSes] = useState<Session>(() => {
    const s = loadSession(rank)
    // a grade still running from before (we left the screen): keep waiting for it; after a reload it's gone, so ask again
    if (s.phase === "grading" && !inflight.has(s.id)) return { ...s, phase: "ask", turns: s.turns.map((t, i) => (i === s.turns.length - 1 ? { ...t, answer: "" } : t)) }
    return s
  })
  const [text, setText] = useState(() => {
    const s = loadSession(rank)
    const last = s.turns[s.turns.length - 1]
    return s.phase === "grading" && !inflight.has(s.id) && last ? last.answer : ""
  })
  const [debriefErr, setDebriefErr] = useState("")
  const sesRef = useRef(ses)
  sesRef.current = ses
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    const p = inflight.get(ses.id)
    if (ses.phase === "grading" && p) p.then(() => mounted.current && setSes(loadSession(ses.rank)))
    return () => {
      mounted.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [err, setErr] = useState("")
  const [showModel, setShowModel] = useState(false)
  const [debriefBusy, setDebriefBusy] = useState(false)
  const [talking, setTalking] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const spokenRef = useRef("")
  const { phase, turns, idx, qs } = ses
  const srank = ses.phase === "setup" ? rank : ses.rank // an interview in progress keeps the rank it started with
  const current = turns[turns.length - 1]
  const cardOf = (i: number) => CARDS[i]
  const update = (f: (s: Session) => Session) => setSes((s) => f(s))
  /** Apply a change to session `sid`, whether or not this screen is still open. */
  const write = (sid: string, f: (s: Session) => Session) => {
    if (mounted.current) setSes((s) => (s.id === sid ? f(s) : s))
    else {
      const stored = readLS<Session | null>(INT_KEY, null)
      if (stored && stored.id === sid) writeLS(INT_KEY, f(stored))
    }
  }
  const liveId = () => (mounted.current ? sesRef.current.id : readLS<Session | null>(INT_KEY, null)?.id)

  useEffect(() => {
    writeLS(INT_KEY, ses.phase === "setup" ? null : ses)
  }, [ses])
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [turns.length, phase])
  useEffect(() => () => stopSpeaking(), [])

  // In a voice interview the inspector reads each new question aloud in the studio voice;
  // "Read aloud" in a typed interview uses the device's own voice
  const say = async (q: string) => {
    setTalking(true)
    await speak(q, { studio: !!studio && sesRef.current.voice, ticket: sesRef.current.receipt })
    if (mounted.current) setTalking(false)
  }
  useEffect(() => {
    if (!ses.voice || phase !== "ask" || !current || current.answer) return
    const key = `${turns.length}:${current.q}`
    if (spokenRef.current === key) return
    spokenRef.current = key
    say(current.q)
  }, [ses.voice, phase, turns.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (sample === undefined) return <Scroll className="pt-6"><Thinking label="Getting the AI inspector ready" /></Scroll>
  if (sample === null)
    return (
      <>
        <div className="px-5 pb-3"><AiOff title="Sign in with Google and the AI inspector grades your answers">Sign in to Claude at the top right, then reload, and the AI inspector will grade your answers. Until then, here's the practice version with set answers.</AiOff></div>
        {fallback}
      </>
    )

  const voiceCost = wallet.perks.voiceIncluded ? COSTS.interview : COSTS.voiceInterview
  const cost = voicePick && studio ? voiceCost : COSTS.interview
  const start = () => {
    const receipt = wallet.charge({ kind: voicePick && studio ? "voiceInterview" : "interview" }, { note: RANK_NAMES[rank] || rank })
    if (!receipt) return
    const pick = pickQuestions(rank, topic)
    const first = cardOf(pick[0])
    spokenRef.current = ""
    setErr("")
    setText("")
    setDebriefErr("")
    setSes({ ...newSession(rank), phase: "ask", qs: pick, idx: 0, turns: [{ q: first.q, answer: "", card: pick[0] }], voice: voicePick, receipt })
  }
  const gradedCount = turns.filter((t) => t.grade).length
  // a refund is only possible before anything has been graded or sent for grading
  const canRefund = gradedCount === 0 && phase === "ask" && !inflight.has(ses.id)
  const cancelRefund = () => {
    if (!canRefund && phase !== "setup") return
    stopSpeaking()
    wallet.refund(ses.receipt)
    setSes(newSession(rank))
    setErr("")
  }
  const submit = async (ans: string) => {
    if (!current || !ans.trim() || phase === "grading") return
    stopSpeaking()
    setErr("")
    const sid = ses.id
    update((s) => ({ ...s, phase: "grading", turns: s.turns.map((x, i) => (i === s.turns.length - 1 ? { ...x, answer: ans.trim() } : x)) }))
    setText("")
    let done!: () => void
    inflight.set(sid, new Promise<void>((r) => (done = r)))
    try {
      const prev = current.follow ? turns[turns.length - 2]?.q : undefined
      const card = cardOf(current.card)
      const g = await sample.json<Grade>(gradePrompt(srank, ship, current.q, card, ans, prev), { modelTier: "quick", ticket: sesRef.current.receipt })
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
      // the grade belongs to this session only; if it was cancelled or replaced meanwhile, nothing is awarded
      if (liveId() === sid) {
        const xp = prog.gradeXp(grade.score, card.p)
        write(sid, (s) => ({ ...s, phase: "graded", turns: s.turns.map((x, i) => (i === s.turns.length - 1 ? { ...x, grade, xp } : x)) }))
        if (mounted.current) {
          setShowModel(false)
          if (grade.score >= 8) pop(scrollRef.current)
        }
      }
    } catch (e) {
      write(sid, (s) => ({ ...s, phase: "ask", turns: s.turns.map((x, i) => (i === s.turns.length - 1 ? { ...x, answer: "" } : x)) }))
      if (mounted.current) {
        setErr(`${aiErrorCopy(e as AiErr)} Your answer is still in the box; send it again.`)
        setText(ans)
      }
      if (HIDE_CODES.includes((e as AiErr).code || "") && mounted.current) cancelRefund()
    } finally {
      inflight.delete(sid)
      done()
    }
  }
  const finish = () => {
    const graded = turns.filter((t) => t.grade)
    if (!ses.recorded && graded.length) {
      const avg = Math.round((graded.reduce((n, t) => n + t.grade!.score, 0) / graded.length) * 10) / 10
      prog.recordInterview({ rank: srank, avg, n: graded.length, voice: ses.voice, items: graded.map((t) => [cardOf(t.card).p, t.grade!.score]) })
    }
    stopSpeaking()
    update((s) => ({ ...s, phase: "done", recorded: true }))
  }
  const next = (follow: boolean) => {
    if (follow && current?.grade?.followUp) {
      update((s) => ({ ...s, phase: "ask", turns: [...s.turns, { q: current.grade!.followUp, answer: "", follow: true, card: current.card }] }))
      return
    }
    const n = idx + 1
    if (n >= qs.length) return finish()
    update((s) => ({ ...s, phase: "ask", idx: n, turns: [...s.turns, { q: cardOf(qs[n]).q, answer: "", card: qs[n] }] }))
  }
  const runDebrief = async () => {
    setDebriefBusy(true)
    setDebriefErr("")
    update((s) => ({ ...s, debrief: "" }))
    const lines = turns.filter((t) => t.grade).map((t) => `Q: ${t.q}\nScore ${t.grade!.score}/10. Missed: ${t.grade!.missing.join("; ") || "nothing major"}`).join("\n\n")
    try {
      await sample(`You are a SIRE 2.0 vetting superintendent debriefing a ${RANK_NAMES[srank] || srank} after a mock inspection interview. Here are their results:\n\n${lines}\n\nWrite: one line on how they came across, then "**Fix these before the inspection**" with exactly 3 "- " bullets (specific, practical), then one encouraging line. Under 140 words. No invented regulation numbers.`, {
        modelTier: "quick",
        ticket: ses.receipt,
        onText: ({ text: t }) => update((s) => ({ ...s, debrief: t })),
      })
    } catch (e) {
      update((s) => ({ ...s, debrief: "" }))
      setDebriefErr(aiErrorCopy(e as AiErr))
    } finally {
      setDebriefBusy(false)
    }
  }

  if (phase === "setup") {
    const hist = prog.interviews.filter((r) => r.rank === rank).slice(0, 3)
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
          <span className="text-[14px] leading-relaxed text-white/75">{QUESTIONS} real questions for a {RANK_NAMES[rank] || rank}. Answer the way you would on board. You get a score, what you missed on the fact, the procedure and the record, a model answer, and the follow-up an inspector would ask next. Follow-ups and the debrief are included.</span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Interview style">
            {([[false, "Type or dictate", "Read the questions", COSTS.interview], [true, "Voice interview", studio ? (wallet.perks.voiceIncluded ? "The inspector speaks · no extra cost" : "The inspector speaks") : "Read aloud by your device", studio ? voiceCost : COSTS.interview]] as const).map(([v, l, sub, c]) => (
              <button key={String(v)} type="button" role="radio" aria-checked={voicePick === v} onClick={() => setVoicePick(v)} className={cn("flex flex-col gap-0.5 rounded-2xl border px-3 py-2.5 text-left", voicePick === v ? "border-[#ffcf5a] bg-white/[0.12]" : "border-white/15 bg-white/[0.04] hover:bg-white/[0.08]")}>
                <span className="flex items-center gap-1.5 text-[13.5px] font-bold text-white">{v ? <I.Volume size={14} /> : <I.FileText size={14} />}{l}</span>
                <span className="text-[11.5px] text-white/60">{sub} · {c} credits</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={start} className="sheen flex h-12 items-center justify-between rounded-2xl bg-gradient-to-r from-[#ffcf5a] to-[#ff7a2f] px-4 text-[15px] font-bold text-[#2a1200]">
            Start the {voicePick ? "voice " : ""}interview <CostTag cost={cost} />
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
        {hist.length > 0 && (
          <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3.5">
            <span className="text-[14px] font-bold">Your last interviews</span>
            {hist.map((r) => {
              const weak = [...r.items].sort((a, b) => a[1] - b[1])[0]
              return (
                <div key={r.at} className="flex items-center gap-3 text-[13px]">
                  <span className={cn("tnum flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-bold", r.avg >= 8 ? "bg-sea-soft text-sea" : r.avg >= 5 ? "bg-amber-soft text-amber-ink" : "bg-signal-soft text-signal-ink")}>{r.avg}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold">{new Date(r.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {r.n} answers{r.voice ? " · voice" : ""}</span>
                    {weak && <span className="truncate text-[12px] text-mute">Weakest: {weak[0]} ({weak[1]}/10)</span>}
                  </span>
                </div>
              )
            })}
          </section>
        )}
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-line p-4">
          <span className="text-[14px] font-bold">Answer like you're ready</span>
          <span className="text-[13px] leading-snug text-mute">State the fact. Say where the SMS covers it. Name the record that proves it's done.</span>
        </div>
      </Scroll>
    )
  }

  if (phase === "done") {
    const graded = turns.filter((t) => t.grade)
    const avg = graded.length ? Math.round((graded.reduce((n, t) => n + t.grade!.score, 0) / graded.length) * 10) / 10 : 0
    const xp = graded.reduce((n, t) => n + (t.xp || 0), 0)
    return (
      <Scroll className="gap-4 pt-2">
        <section className="glass flex items-center gap-4 rounded-[22px] p-4">
          <ScoreRing score={Math.round(avg)} />
          <span className="flex flex-col gap-0.5">
            <span className="display text-[22px] leading-tight font-bold">Interview done: {avg}/10</span>
            <span className="text-[13px] text-mute">{graded.length} answers graded, including follow-ups · +{xp} XP</span>
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
          <span className="flex items-center gap-2 text-[15px] font-bold">Your debrief <AiChip /><span className="ml-auto text-[11.5px] font-normal text-mute">Included</span></span>
          {ses.debrief ? <Md text={ses.debrief} /> : debriefBusy ? <Thinking label="Writing your debrief" /> : (
            <>
              {debriefErr && <p className="text-[12.5px] font-medium text-signal-ink">{debriefErr}</p>}
              <button type="button" onClick={runDebrief} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7b5cff] to-[#1660d6] text-[14px] font-semibold text-white"><I.Sparkle size={16} /> {debriefErr ? "Try again" : "Get my 3 fixes"}</button>
            </>
          )}
        </section>
        <button type="button" onClick={() => setSes(newSession(rank))} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-on-primary"><I.Refresh size={16} /> New interview</button>
      </Scroll>
    )
  }

  return (
    <>
      <div className="px-5 pb-2">
        <div className="flex items-center justify-between text-[12px] text-mute">
          <span className="flex items-center gap-1.5">{RANK_NAMES[srank] || srank} · AI inspector <AiChip />{ses.voice && <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold"><I.Volume size={11} /> Voice</span>}</span>
          <span className="tnum font-mono font-semibold text-ink">{idx + 1}/{qs.length}</span>
        </div>
        <div className="mt-2 flex gap-1">{qs.map((_, j) => <span key={j} className={cn("h-1.5 flex-1 rounded-full", j < idx ? "bg-primary" : j === idx ? "bg-[#7b5cff]" : "bg-surface-2")} />)}</div>
      </div>
      <div ref={scrollRef} className="no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto px-4 pt-2 pb-3 [&>*]:shrink-0">
        {turns.slice(-4).map((t, i, arr) => {
          const last = i === arr.length - 1
          const card = cardOf(t.card)
          return (
            <Fragment key={turns.length - arr.length + i}>
              <div className="flex items-end gap-2">
                <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2a3f63] to-[#0e2a50] font-mono text-[10px] font-bold text-white">
                  INS
                  {last && talking && <motion.span className="absolute inset-0 rounded-full border-2 border-[#7b5cff]" animate={{ scale: [1, 1.25], opacity: [0.9, 0] }} transition={{ repeat: Infinity, duration: 1 }} />}
                </span>
                <div className="glass flex max-w-[86%] flex-col gap-1.5 rounded-[18px] rounded-bl-[6px] px-3.5 py-3">
                  {t.follow && <span className="text-[11px] font-semibold text-[#7b5cff]">Follow-up</span>}
                  <span className="text-[15px] leading-snug">{t.q}</span>
                  <span className="flex items-center gap-2 text-[11px] text-mute">
                    {!t.follow && card && <><TopicBadge topic={card.p} size={18} />{card.p}</>}
                    {last && (
                      <button type="button" onClick={() => (talking ? (stopSpeaking(), setTalking(false)) : say(t.q))} className="ml-auto flex items-center gap-1 font-semibold text-primary">
                        {talking ? <><I.Stop size={11} /> Stop</> : <><I.Volume size={12} /> {ses.voice ? "Replay" : "Read aloud"}</>}
                      </button>
                    )}
                  </span>
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
                      {t.xp != null && <span className="text-[12px] text-mute">+{t.xp} XP</span>}
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
                  {last && t.grade.model && (
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
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); submit(text) }}>
            <label htmlFor="ai-answer" className="sr-only">Your answer</label>
            <textarea id="ai-answer" rows={2} value={text} disabled={phase === "grading"} onChange={(e) => setText(e.target.value)} placeholder={ses.voice ? "Tap the mic and answer out loud, or type…" : "Answer as you'd say it to the inspector…"} className="min-h-12 flex-1 resize-none rounded-xl border border-line bg-white/80 px-3 py-2 text-[14px] leading-snug outline-none focus:border-primary" />
            {phase !== "grading" && <MicButton value={text} onChange={setText} />}
            <button type="submit" aria-label="Send answer" disabled={phase === "grading" || !text.trim()} className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#7b5cff] to-[#1660d6] text-white disabled:opacity-40"><I.Send size={19} /></button>
          </form>
        )}
        {phase === "ask" && (
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => submit("I'm not sure.")} className="text-[12px] font-medium text-mute underline underline-offset-2">I don't know, teach me</button>
            {canRefund ? (
              <button type="button" onClick={cancelRefund} className="text-[12px] font-medium text-mute underline underline-offset-2">Cancel and refund</button>
            ) : (
              <button type="button" onClick={finish} className="text-[12px] font-medium text-mute underline underline-offset-2">End interview</button>
            )}
          </div>
        )}
      </div>
    </>
  )
}

/* =====================================================================
   Explain an observation and draft a close-out
   ===================================================================== */
const EXPLAIN_KEY = "sr.explain"
const explainKey = (o: Obs) => `${o.c}|${o.t.slice(0, 80)}`
function savedExplain(o: Obs): string {
  const all = readLS<Record<string, string>>(EXPLAIN_KEY, {})
  return all[explainKey(o)] || ""
}
function saveExplain(o: Obs, text: string) {
  const all = readLS<Record<string, string>>(EXPLAIN_KEY, {})
  const keys = Object.keys(all)
  if (keys.length > 60) delete all[keys[0]]
  all[explainKey(o)] = text
  writeLS(EXPLAIN_KEY, all)
}

export function ExplainObs({ o, compact }: { o: Obs; compact?: boolean }) {
  const sample = useSample()
  const wallet = useWallet()
  const prog = useProgress()
  const gate = useAiGate()
  const auth = useAuth()
  const [out, setOut] = useState(() => savedExplain(o))
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(() => (savedExplain(o) ? "done" : "idle"))
  const [err, setErr] = useState("")
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const ctl = useRef<AbortController | null>(null)
  useEffect(() => () => ctl.current?.abort(), [])
  if (!sample) {
    if (gate !== "closed") return null
    return (
      <button type="button" onClick={() => auth.prompt("Sign in with Google to see why it was raised")} className={cn("flex items-center gap-1.5 self-start rounded-full border border-[#d9cffd] bg-[#f4f0ff]/80 font-semibold text-[#5a3bd1] hover:bg-[#ece5ff]", compact ? "h-8 px-2.5 text-[12px]" : "h-9 px-3 text-[12.5px]")}>
        <I.Sparkle size={14} /> Why, and how to close it
        <span className="font-mono font-normal text-[#5a3bd1]/70">· sign in</span>
      </button>
    )
  }
  const run = async () => {
    if (state === "busy") return
    const receipt = wallet.charge({ kind: "explain" })
    if (!receipt) return
    setState("busy")
    setExpanded(true)
    setOut("")
    setErr("")
    const c = new AbortController()
    ctl.current = c
    let got = ""
    try {
      const { text } = await sample(`You are a vetting superintendent helping a tanker crew. An inspector raised this SIRE 2.0 observation: "${o.t}" (chapter ${o.c} ${CHAPTER_NAMES[o.c] || ""}${o.y ? `, ${TYPE_NAME[o.y]} observation` : ""}). The fleet's note on avoiding it: "${o.f}".

Write these sections, each heading in bold on its own line:
**Why it was raised** (1-2 sentences)
**Likely root cause** (1-2 "- " bullets)
**Fix on board today** (2-3 "- " bullets)
**Stop it coming back** (2 "- " bullets: procedure, training or PMS)
**Close-out response** (3-4 formal sentences the operator could submit, starting "The vessel")
No invented regulation numbers or OCIMF wording; say "check your SMS" where it depends on the company. Under 230 words.`, {
        modelTier: "quick",
        signal: c.signal,
        cache: false,
        ticket: receipt,
        onText: ({ text: t }) => {
          got = t
          setOut(t)
        },
      })
      wallet.settle(receipt)
      setOut(text)
      saveExplain(o, text)
      setState("done")
      prog.aiXp("explain")
    } catch (e) {
      const er = e as AiErr
      if (er.code === "cancelled" && got.trim()) wallet.settle(receipt)
      else wallet.refund(receipt)
      if (er.text) setOut(er.text)
      setErr(er.code === "cancelled" ? "" : er.code === "payment" ? aiErrorCopy(er) : `${aiErrorCopy(er)} Your credit was refunded.`)
      setState(er.code === "cancelled" && got.trim() ? "done" : "error")
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
        <span className="font-mono font-normal text-[#5a3bd1]/70">· {COSTS.explain} credit</span>
      </button>
    )
  if (state === "done" && !expanded && compact)
    return (
      <button type="button" onClick={() => setExpanded(true)} className="flex h-8 items-center gap-1.5 self-start rounded-full border border-[#d9cffd] bg-[#f4f0ff]/80 px-2.5 text-[12px] font-semibold text-[#5a3bd1]">
        <I.Check size={13} /> Saved close-out · open
      </button>
    )
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-[#d9cffd] bg-[#f7f4ff]/85 p-3.5">
      <span className="flex items-center gap-2 text-[12.5px] font-semibold text-[#5a3bd1]"><AiChip /> Superintendent's view{state === "done" && <span className="ml-auto text-[11px] font-normal text-[#5a3bd1]/70">Saved on this device</span>}</span>
      {out ? <Md text={out} /> : state === "busy" && <Thinking label="Working out the root cause and close-out" />}
      {err && <p className="text-[12.5px] font-medium text-signal-ink">{err}</p>}
      {state === "busy" && <button type="button" onClick={() => ctl.current?.abort()} className="self-start text-[12px] font-semibold text-mute underline underline-offset-2">Stop</button>}
      {state === "error" && <button type="button" onClick={run} className="flex h-9 items-center gap-1.5 self-start rounded-full border border-[#d9cffd] bg-white/70 px-3 text-[12.5px] font-semibold text-[#5a3bd1]"><I.Refresh size={14} /> Try again · {COSTS.explain} credit</button>}
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
export function BriefPlan({ brief, date, evidence, daysLeft, plan, setPlan }: { brief: Brief; date: string; evidence: string[]; daysLeft: number; plan: string; setPlan: (t: string) => void }) {
  const sample = useSample()
  const wallet = useWallet()
  const gate = useAiGate()
  const [live, setLive] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [needPay, setNeedPay] = useState(false)
  const ctl = useRef<AbortController | null>(null)
  useEffect(() => () => ctl.current?.abort(), [])
  if (sample === null && gate === "closed")
    return plan ? (
      <section className="glass flex flex-col gap-3 rounded-[22px] p-4">
        <span className="flex items-center gap-2 text-[15px] font-bold">Your day-by-day plan <AiChip /></span>
        <Md text={plan} />
      </section>
    ) : (
      <SignInForAi title="Sign in with Google to make your day-by-day plan">The first plan is included with the brief. Signing in also keeps the brief on every device.</SignInForAi>
    )
  if (sample === null) return null
  const days = Math.max(1, Math.min(7, daysLeft || 3))
  const out = busy ? live : plan
  const run = async (redo = false) => {
    if (!sample || busy) return
    let receipt: string | null = null
    if (redo) {
      receipt = wallet.charge({ kind: "planRedo" })
      if (!receipt) return
    }
    setBusy(true)
    setErr("")
    setLive("")
    const c = new AbortController()
    ctl.current = c
    const negs = brief.negatives.slice(0, 5).map((n) => n.text).join("; ")
    try {
      const { text } = await sample(`You are a SIRE 2.0 vetting superintendent. Make a ${days}-day preparation plan for the ${RANK_NAMES[brief.rank] || brief.rank} of a tanker facing a ${brief.major} inspection${brief.port ? ` at ${brief.port}` : ""} on ${date}.
Likely focus topics: ${brief.focus.map((f) => f.topic).join(", ")}.
Records to have ready: ${evidence.join("; ")}.
Questions asked of this rank in recent inspections: ${brief.questions.slice(0, 8).map((q) => q.q).join(" | ")}.
Recent negative observations: ${negs}.

For each day write "**Day N**" on its own line, then 3 "- " bullets (about 20 minutes of work each, specific: what to check, what to rehearse, what to have ready). The last day is the evening before. Finish with one line starting "**On the day:**". No invented regulation numbers. Under 260 words.`, {
        signal: c.signal,
        cache: false,
        modelTier: wallet.perks.expert ? "complex" : "default",
        // the first plan is paid for by the brief; a new one by its own charge
        ticket: receipt ?? brief.ticket ?? null,
        onText: ({ text: t }) => setLive(t),
      })
      wallet.settle(receipt)
      setPlan(text)
    } catch (e) {
      const er = e as AiErr
      if (receipt) wallet.refund(receipt)
      if (er.code === "payment" && !receipt) {
        setNeedPay(true)
        setErr(`This brief's included plan was already used, or the brief was made before you signed in.`)
      }
      else if (er.code !== "cancelled") setErr(`${aiErrorCopy(er)}${receipt && er.code !== "payment" ? " Your credits were refunded." : ""}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="glass flex flex-col gap-3 rounded-[22px] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[15px] font-bold">Your day-by-day plan <AiChip /></span>
        {plan && !busy && <button type="button" onClick={() => run(true)} className="flex items-center gap-1 text-[12.5px] font-semibold text-primary">Make a new one <CostTag cost={COSTS.planRedo} className="text-primary/80" /></button>}
      </div>
      {out ? <Md text={out} /> : busy ? <Thinking label={`Planning your ${days} days`} /> : (
        <>
          <p className="text-[13.5px] leading-snug text-mute">Turn this brief into a {days}-day plan, 20 minutes a day, built around your oil major, rank and the records above. The first plan is included with the brief.</p>
          <button type="button" disabled={sample === undefined} onClick={() => run(needPay)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7b5cff] to-[#1660d6] text-[14px] font-semibold text-white disabled:opacity-50"><I.Sparkle size={16} /> Make my plan{needPay && <CostTag cost={COSTS.planRedo} className="text-white/85" />}</button>
        </>
      )}
      {busy && <button type="button" onClick={() => ctl.current?.abort()} className="self-start text-[12px] font-semibold text-mute underline underline-offset-2">Stop</button>}
      {err && <p className="text-[12.5px] font-medium text-signal-ink">{err}</p>}
    </section>
  )
}

export { storyById, HOSTED }
