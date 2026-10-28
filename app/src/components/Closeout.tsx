// Close-out helper: paste an observation you actually received, and the AI drafts what a vetting superintendent
// would: the root cause (Human / Process / Hardware), the immediate correction, corrective and preventive actions,
// evidence to attach, owners and dates, and an operator's comment ready to submit. Paid with credits (refunded if no
// answer arrives); the last few are kept on the account so they're on every device.
import { useEffect, useRef, useState, type FormEvent } from "react"
import * as I from "@/components/icons"
import { cn } from "@/lib/utils"
import { Scroll, TopBar } from "@/components/ui"
import { COSTS, CreditPill, useWallet } from "@/credits"
import { useProgress } from "@/progress"
import { CHAPTER_NAMES } from "@/fleet"
import { currentRole, currentShip, roleContext } from "@/roles"
import { aiErrorCopy, useSample, type AiErr } from "@/ai"
import { AiChip, AiOff, Md, Thinking } from "@/components/AiFeatures"
import type { AppScreen } from "@/nav"

export const CLOSEOUT_KEY = "sr.closeouts"
const MAX_SAVED = 12
export interface SavedCloseout { id: string; at: number; obs: string; chapter: number; type: string; text: string }

const read = (): SavedCloseout[] => {
  try {
    const v = JSON.parse(localStorage.getItem(CLOSEOUT_KEY) || "[]")
    return Array.isArray(v) ? v.filter((x) => x && typeof x.text === "string" && typeof x.obs === "string").slice(0, MAX_SAVED) : []
  } catch {
    return []
  }
}
const write = (list: SavedCloseout[]) => {
  try {
    localStorage.setItem(CLOSEOUT_KEY, JSON.stringify(list.slice(0, MAX_SAVED)))
    // tell the account sync (auth.tsx) and other tabs that it changed
    window.dispatchEvent(new StorageEvent("storage", { key: CLOSEOUT_KEY }))
  } catch {
    /* kept for this visit only */
  }
}

/** Takes ship names, IMO numbers and email addresses out before anything is sent. */
export function scrubObservation(s: string) {
  return String(s || "")
    .replace(/\b(?:M\/?T|M\/?V|MV|MT|SS)\s+["“]?[A-Z][\w-]*(?:\s+[A-Z][\w-]*){0,2}["”]?/g, "the ship")
    .replace(/\bIMO\s*(?:No\.?|number)?\s*\d{7}\b/gi, "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ([,.;:])/g, "$1")
    .trim()
}

const TYPES = [
  { id: "", label: "Not sure" },
  { id: "Human", label: "Human" },
  { id: "Process", label: "Process" },
  { id: "Hardware", label: "Hardware" },
]

export const closeoutPrompt = (o: { obs: string; chapter: number; type: string; done: string; format: string; rank: string; ship: string }) => `You are an experienced tanker vetting superintendent helping close out a SIRE 2.0 observation. ${roleContext(o.rank, o.ship)}
The observation, as written in the report:
"""${o.obs}"""
${o.chapter ? `SIRE 2.0 chapter: ${o.chapter} ${CHAPTER_NAMES[o.chapter] || ""}.` : ""}${o.type ? ` Classified as a ${o.type} observation.` : ""}
${o.done ? `Already done on board: ${o.done}` : ""}
${o.format ? `Company format notes: ${o.format}` : ""}

Write these sections, each heading in bold on its own line, in plain professional English:
**What the inspector saw** (1-2 sentences restating the finding neutrally)
**Root cause** (classify as Human, Process or Hardware, then 2-3 "- " bullets on why it happened; think about procedures, training, supervision, PMS and resources, not just the individual)
**Immediate correction** (2-3 "- " bullets: what is fixed on board now)
**Corrective action** (2-3 "- " bullets: removes this cause on this ship)
**Preventive action** (2-3 "- " bullets: stops it on other ships or in future: procedure change, training, PMS, fleet circular)
**Evidence to attach** (3-5 "- " bullets: records, photos, signed checklists, training records)
**Owners and target dates** (2-4 "- " bullets: role responsible and a realistic number of days)
**Operator's comment** (4-6 formal sentences ready to submit, starting "The vessel" or "The company", covering cause, actions and verification)
Never invent regulation numbers, OCIMF question numbers or company procedure names; write "per the company SMS" where it depends on the company. No names of people, ships or companies. Under 380 words.`

export function CloseoutScreen({ go }: { go: (s: AppScreen) => void }) {
  const sample = useSample()
  const wallet = useWallet()
  const prog = useProgress()
  const [obs, setObs] = useState("")
  const [chapter, setChapter] = useState(0)
  const [type, setType] = useState("")
  const [done, setDone] = useState("")
  const [format, setFormat] = useState("")
  const [out, setOut] = useState("")
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle")
  const [err, setErr] = useState("")
  const [note, setNote] = useState("")
  const [saved, setSaved] = useState<SavedCloseout[]>(read)
  const [open, setOpen] = useState<SavedCloseout | null>(null)
  const ctl = useRef<AbortController | null>(null)
  useEffect(() => () => ctl.current?.abort(), [])
  useEffect(() => {
    const on = (e: StorageEvent) => (!e.key || e.key === CLOSEOUT_KEY) && setSaved(read())
    window.addEventListener("storage", on)
    return () => window.removeEventListener("storage", on)
  }, [])

  const clean = scrubObservation(obs)
  const ready = clean.length >= 20
  const run = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!sample || state === "busy" || !ready) return
    const receipt = wallet.charge({ kind: "closeout" })
    if (!receipt) return
    setState("busy")
    setOut("")
    setErr("")
    setNote("")
    setOpen(null)
    const c = new AbortController()
    ctl.current = c
    let got = ""
    try {
      const { text } = await sample(closeoutPrompt({ obs: clean.slice(0, 2500), chapter, type, done: scrubObservation(done).slice(0, 800), format: format.slice(0, 300), rank: currentRole(), ship: currentShip() }), {
        modelTier: "default",
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
      setState("done")
      prog.aiXp("explain")
      const item: SavedCloseout = { id: receipt, at: Date.now(), obs: clean.slice(0, 600), chapter, type, text }
      const next = [item, ...read().filter((x) => x.id !== item.id)]
      write(next)
      setSaved(next.slice(0, MAX_SAVED))
    } catch (x) {
      const er = x as AiErr
      if (er.code === "cancelled" && got.trim()) wallet.settle(receipt)
      else wallet.refund(receipt)
      if (er.text) setOut(er.text)
      setErr(er.code === "cancelled" ? "" : er.code === "payment" ? aiErrorCopy(er) : `${aiErrorCopy(er)} Your credits were refunded.`)
      setState(er.code === "cancelled" && got.trim() ? "done" : "error")
    }
  }
  const shown = open ? open.text : out
  const comment = (shown.split(/\*\*Operator'?s comment\*\*:?/i)[1] || "").trim()
  const copy = async (what: "comment" | "all") => {
    try {
      await navigator.clipboard.writeText(what === "comment" ? comment : shown.replace(/\*\*/g, ""))
      setNote(what === "comment" ? "Operator's comment copied." : "Copied.")
    } catch {
      setNote("Couldn't copy here. Select the text and copy it instead.")
    }
  }
  const word = () => {
    const item = open || { obs: clean, at: Date.now() }
    const html = `<html><head><meta charset="utf-8"><title>Observation close-out</title></head><body style="font-family:Calibri,Arial,sans-serif;font-size:11pt">
<h2>Observation close-out</h2><p><b>Observation:</b> ${esc(item.obs)}</p>
${shown.split("\n").map((l) => {
      const t = l.trim()
      if (!t) return ""
      if (/^\*\*.+\*\*:?$/.test(t)) return `<h3>${esc(t.replace(/\*\*/g, "").replace(/:$/, ""))}</h3>`
      if (/^[-*•]\s+/.test(t)) return `<ul><li>${esc(t.replace(/^[-*•]\s+/, "").replace(/\*\*/g, ""))}</li></ul>`
      return `<p>${esc(t.replace(/\*\*/g, ""))}</p>`
    }).join("\n")}
<p style="color:#666;font-size:9pt">Drafted with NilObs on ${new Date(item.at).toLocaleDateString()}. Check against your company SMS before submitting.</p></body></html>`
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([html], { type: "application/msword" }))
    a.download = "observation-close-out.doc"
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  const field = "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink outline-none focus:border-primary"

  return (
    <>
      <TopBar title="Close-out helper" onBack={() => go("today")} right={<CreditPill className="h-9" />} />
      <Scroll className="gap-3">
        <section className="flex flex-col gap-1.5 rounded-[22px] bg-hero p-4 text-hero-ink">
          <I.FileCheck size={24} />
          <h2 className="display text-[20px] leading-tight font-bold">Got an observation? Close it out properly.</h2>
          <p className="text-[13px] leading-snug text-hero-muted">Paste it as written in the report. You get the root cause, corrective and preventive actions, the evidence to attach and an operator's comment ready to submit, the way a vetting superintendent would write it.</p>
        </section>
        {sample === null ? (
          <AiOff title="Sign in to draft a close-out" />
        ) : (
          <form onSubmit={run} className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-mute">
              The observation, as written
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={5} maxLength={3000} placeholder="e.g. The gas detector used for enclosed space entry had no record of a bump test before use, and the span gas cylinder had expired." className={cn(field, "min-h-[120px] leading-snug")} />
            </label>
            <span className="text-[11.5px] text-mute">Ship names, IMO numbers and email addresses are taken out before it's sent. Leave out people's names.</span>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-mute">
                SIRE 2.0 chapter (optional)
                <select value={chapter} onChange={(e) => setChapter(Number(e.target.value))} className={cn(field, "h-11 py-0")}>
                  <option value={0}>Not sure</option>
                  {Object.entries(CHAPTER_NAMES).map(([n, name]) => <option key={n} value={n}>{n} · {name}</option>)}
                </select>
              </label>
              <span className="flex flex-col gap-1 text-[12.5px] font-semibold text-mute">
                Type (optional)
                <span className="flex flex-wrap gap-1.5" role="group" aria-label="Observation type">
                  {TYPES.map((t) => (
                    <button key={t.id} type="button" aria-pressed={type === t.id} onClick={() => setType(t.id)} className={cn("h-10 rounded-full border px-3 text-[13px] font-medium", type === t.id ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-ink")}>{t.label}</button>
                  ))}
                </span>
              </span>
            </div>
            <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-mute">
              Already done on board (optional)
              <input value={done} onChange={(e) => setDone(e.target.value)} maxLength={800} placeholder="e.g. New span gas ordered; detector bump-tested and logged" className={cn(field, "h-11 py-0")} />
            </label>
            <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-mute">
              Your company's format (optional)
              <input value={format} onChange={(e) => setFormat(e.target.value)} maxLength={300} placeholder="e.g. We call it a non-conformity; actions need a target date" className={cn(field, "h-11 py-0")} />
            </label>
            <button type="submit" disabled={!ready || state === "busy"} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-on-primary disabled:opacity-50">
              <I.Sparkle size={17} /> {state === "busy" ? "Drafting…" : `Draft the close-out · ${COSTS.closeout} credits`}
            </button>
            {!ready && obs.length > 0 && <span className="text-[12px] text-mute">Add a little more detail: what was found, where, and what record or equipment.</span>}
          </form>
        )}

        {(shown || state === "busy") && (
          <section className="flex flex-col gap-2.5 rounded-2xl border border-[#d9cffd] bg-[#f7f4ff]/85 p-3.5" aria-label="Close-out draft">
            <span className="flex items-center gap-2 text-[12.5px] font-semibold text-[#5a3bd1]"><AiChip /> Close-out draft{open && <span className="ml-auto text-[11px] font-normal text-[#5a3bd1]/70">Saved {new Date(open.at).toLocaleDateString()}</span>}</span>
            {open && <p className="text-[12.5px] text-mute"><b className="text-ink">Observation:</b> {open.obs}</p>}
            {shown ? <Md text={shown} /> : <Thinking label="Working out the root cause and actions" />}
            {state === "busy" && <button type="button" onClick={() => ctl.current?.abort()} className="self-start text-[12px] font-semibold text-mute underline underline-offset-2">Stop</button>}
            {(state === "done" || open) && shown && (
              <span className="flex flex-wrap gap-2">
                {comment && <button type="button" onClick={() => copy("comment")} className="flex h-9 items-center gap-1.5 rounded-full bg-[#5a3bd1] px-3 text-[12.5px] font-semibold text-white"><I.FileText size={14} /> Copy the operator's comment</button>}
                <button type="button" onClick={() => copy("all")} className="h-9 rounded-full border border-[#d9cffd] bg-white/70 px-3 text-[12.5px] font-semibold text-[#5a3bd1]">Copy all</button>
                <button type="button" onClick={word} className="flex h-9 items-center gap-1.5 rounded-full border border-[#d9cffd] bg-white/70 px-3 text-[12.5px] font-semibold text-[#5a3bd1]"><I.Download size={14} /> Word file</button>
              </span>
            )}
            {note && <p role="status" className="text-[12.5px] font-medium text-[#5a3bd1]">{note}</p>}
            <p className="text-[11.5px] text-mute">A draft to check against your company SMS and your superintendent's guidance before you submit it.</p>
          </section>
        )}
        {err && <p className="text-[12.5px] font-medium text-signal-ink">{err}</p>}

        {saved.length > 0 && (
          <section className="flex flex-col gap-2" aria-labelledby="closeouts-title">
            <h3 id="closeouts-title" className="text-[15px] font-bold">Your close-outs</h3>
            {saved.map((x) => (
              <button key={x.id} type="button" onClick={() => { setOpen(x); setOut(""); setState("idle"); setNote("") }} className={cn("flex flex-col gap-0.5 rounded-2xl border px-3 py-2.5 text-left", open?.id === x.id ? "border-primary bg-primary-soft/50" : "border-line bg-surface")}>
                <span className="line-clamp-2 text-[13.5px] font-semibold">{x.obs}</span>
                <span className="text-[12px] text-mute">{new Date(x.at).toLocaleDateString()}{x.chapter ? ` · Chapter ${x.chapter}` : ""}{x.type ? ` · ${x.type}` : ""}</span>
              </button>
            ))}
          </section>
        )}
      </Scroll>
    </>
  )
}

const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
