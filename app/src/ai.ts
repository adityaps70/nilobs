// AI layer. The page asks Claude through the viewer's own Claude access (the `sample`
// capability), so no API key ever lives in the page. Retrieval over the fleet data is done
// here, in the page, and passed to Claude as context with citable ids.
import { useEffect, useState } from "react"
import { CARDS, CHAPTER_NAMES, OBS, TYPE_NAME, type CardI, type Obs } from "@/fleet"
import { RANK_NAMES, RANK_TOPICS } from "@/data"
import { STORIES, type Story } from "@/stories"
import { UNAUTHORIZED_EVENT, useAiGate } from "@/auth"
import { readyTicket } from "@/tickets"
import { roleContext, roleOf } from "@/roles"

/* ---------------- capability ---------------- */
export type SampleOpts = {
  onText?: (u: { text: string; delta: string }) => void
  signal?: AbortSignal
  modelTier?: "quick" | "default" | "complex"
  cache?: boolean | { gcTime?: number; refresh?: boolean }
  /** Photos for Claude to look at (Photo check). Only where imageLimits() says this view can send them. */
  images?: Blob[]
  /** On nilobs.com, signed in: the charge (from wallet.charge) that pays for this call. */
  ticket?: string | null
}
export type SampleMsg = { role: "user" | "assistant"; content: string }
export type ImageLimits = { maxCount: number; maxInputBytes: number; mediaTypes: string[] }
export interface SampleFn {
  (input: string | SampleMsg[], opts?: SampleOpts): Promise<{ text: string; truncated: boolean }>
  json: <T = unknown>(input: string | SampleMsg[], opts?: SampleOpts) => Promise<T>
  limits?: () => Promise<{ maxPromptBytes?: number; images?: ImageLimits }>
}

/** What this view allows for photos, or null when it can't send them. Never asks the viewer anything. */
export async function imageLimits(s: SampleFn | null | undefined): Promise<ImageLimits | null> {
  if (!s?.limits) return null
  try {
    const l = await s.limits()
    return l?.images && l.images.maxCount > 0 ? l.images : null
  } catch {
    return null
  }
}

/** Blob → base64 (no data: prefix), for the hosted server. */
async function blobBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer())
  let bin = ""
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(bin)
}
const SERVER_IMAGES: ImageLimits = { maxCount: 3, maxInputBytes: 1_400_000, mediaTypes: ["image/jpeg", "image/png", "image/webp"] }
type ClaudeGlobal = { use?: (n: string) => Promise<unknown> }

// Hosted builds (your own domain) call your server at this path; the Claude-artifact build leaves it empty.
declare const __AI_ENDPOINT__: string
export const AI_ENDPOINT: string = typeof __AI_ENDPOINT__ !== "undefined" ? __AI_ENDPOINT__ : ""
export const HOSTED = !!AI_ENDPOINT

let cached: Promise<SampleFn | null> | null = null
function getSample(): Promise<SampleFn | null> {
  if (cached) return cached
  if (HOSTED) {
    cached = Promise.resolve(httpSample(AI_ENDPOINT))
    return cached
  }
  const c = (typeof window !== "undefined" ? (window as unknown as { claude?: ClaudeGlobal }).claude : undefined)
  cached = c?.use ? c.use("sample").then((f) => (f ? withoutTicket(f as SampleFn) : null)).catch(() => null) : Promise.resolve(null)
  return cached
}
/** Claude's own `sample` (in the artifact) doesn't take our ticket: pass everything else through. */
function withoutTicket(f: SampleFn): SampleFn {
  const strip = (o?: SampleOpts) => {
    if (!o || !("ticket" in o)) return o
    const { ticket: _t, ...rest } = o
    return rest
  }
  const g = ((input: string | SampleMsg[], opts?: SampleOpts) => f(input, strip(opts))) as SampleFn
  g.json = (input, opts) => f.json(input, strip(opts))
  if (f.limits) g.limits = () => f.limits!()
  return g
}

/* ---------------- your own server (/api/ai) ---------------- */
const ERR_MARK = "\u001e" // the server sends this, then a JSON error, if the answer fails part-way
const answerCache = new Map<string, { at: number; text: string }>()

/** Same call shape as Claude's built-in `sample`, backed by POST {endpoint}. */
export function httpSample(endpoint: string): SampleFn {
  const call = async (input: string | SampleMsg[], opts: SampleOpts = {}, json = false) => {
    const messages: SampleMsg[] = typeof input === "string" ? [{ role: "user", content: input }] : input
    const tier = opts.modelTier || "default"
    const key = JSON.stringify([messages, tier, json])
    const images = opts.images?.length ? opts.images : null
    if (images && images.length > SERVER_IMAGES.maxCount) throw { code: "image_rejected", message: "Too many photos" }
    if (images?.some((b) => b.size > SERVER_IMAGES.maxInputBytes || !SERVER_IMAGES.mediaTypes.includes(b.type))) throw { code: "image_rejected", message: "Photo too large or wrong type" }
    // photos are never cached (the same words with a new photo must get a new answer), nor paid calls
    const ttl = images || opts.ticket || opts.cache === false ? 0 : typeof opts.cache === "object" ? opts.cache.gcTime ?? 300000 : 300000
    const hit = answerCache.get(key)
    if (ttl && hit && Date.now() - hit.at < ttl && !(typeof opts.cache === "object" && opts.cache.refresh)) {
      opts.onText?.({ text: hit.text, delta: hit.text })
      return { text: hit.text, truncated: false }
    }
    // a charge made a moment ago must reach the server before the call that uses it
    if (opts.ticket) await readyTicket(opts.ticket)
    let res: Response
    try {
      const payload: Record<string, unknown> = { messages, tier, json }
      if (opts.ticket) payload.ticket = opts.ticket
      if (images) payload.images = await Promise.all(images.map(async (b) => ({ media_type: b.type, data: await blobBase64(b) })))
      if (opts.signal?.aborted) throw new Error("aborted")
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: opts.signal,
      })
    } catch {
      if (opts.signal?.aborted) throw { code: "cancelled", message: "Stopped" }
      throw { code: "upstream_error", message: "Network error" }
    }
    if (!res.ok || !res.body) {
      if (res.status === 401) {
        // signed out or the session ended: tell the app so it shows the sign-in again
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
        throw { code: "session_expired", message: "Sign in again" }
      }
      if (res.status === 402) {
        let why = ""
        try {
          why = String((await res.json())?.error || "")
        } catch {
          /* no body */
        }
        throw { code: "payment", message: why || "This needs credits" }
      }
      const code = res.status === 429 ? "rate_limited" : res.status === 413 ? (images ? "image_rejected" : "prompt_too_large") : res.status === 400 ? (images ? "image_rejected" : "invalid_request") : "upstream_error"
      throw { code, message: `Server answered ${res.status}` }
    }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let text = ""
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = dec.decode(value, { stream: true })
        const cut = chunk.indexOf(ERR_MARK)
        if (cut >= 0) {
          const before = chunk.slice(0, cut)
          if (before) {
            text += before
            opts.onText?.({ text, delta: before })
          }
          let info: { code?: string } = {}
          try {
            info = JSON.parse(chunk.slice(cut + 1))
          } catch {
            /* keep the default */
          }
          throw { code: info.code || "upstream_error", message: "Answer interrupted", text: text || undefined }
        }
        if (chunk) {
          text += chunk
          opts.onText?.({ text, delta: chunk })
        }
      }
    } catch (e) {
      if (opts.signal?.aborted) throw { code: "cancelled", message: "Stopped", text: text || undefined }
      throw e
    }
    if (!text.trim()) throw { code: "empty_completion", message: "No text" }
    if (ttl) answerCache.set(key, { at: Date.now(), text })
    return { text, truncated: false }
  }
  const sample = ((input: string | SampleMsg[], opts?: SampleOpts) => call(input, opts)) as SampleFn
  sample.json = async <T,>(input: string | SampleMsg[], opts?: SampleOpts) => {
    const { text } = await call(input, opts, true)
    const tryParse = (s: string) => {
      try {
        return { ok: true, v: JSON.parse(s) as T }
      } catch {
        return { ok: false, v: undefined as T }
      }
    }
    let r = tryParse(text.trim())
    if (!r.ok) {
      const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (fence) r = tryParse(fence[1].trim())
    }
    if (!r.ok) {
      const a = text.search(/[[{]/), b = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"))
      if (a >= 0 && b > a) r = tryParse(text.slice(a, b + 1))
    }
    if (!r.ok) throw { code: "invalid_json", message: "Reply was not JSON", text }
    return r.v
  }
  sample.limits = async () => ({ maxPromptBytes: 120000, images: SERVER_IMAGES })
  return sample
}

/** undefined while checking, null when AI can't run in this view (or needs a sign-in first), else the sample function. */
export function useSample() {
  const gate = useAiGate()
  const [s, setS] = useState<SampleFn | null | undefined>(undefined)
  useEffect(() => {
    let on = true
    getSample().then((f) => on && setS(() => f))
    return () => {
      on = false
    }
  }, [])
  if (gate === "loading") return undefined
  if (gate === "closed") return null
  return s
}

export type AiErr = { code?: string; text?: string }
export const HIDE_CODES = ["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"]
export function aiErrorCopy(e: AiErr) {
  switch (e?.code) {
    case "cancelled":
      return ""
    case "not_granted":
    case "sampling_disabled":
    case "not_declared":
    case "capability_disabled":
    case "capability_removed":
      return "AI isn't switched on for this view. Allow Claude for this page to use it."
    case "rate_limited":
      return "Lots of AI requests just now. Give it a minute, then try again."
    case "session_expired":
      return HOSTED ? "Your sign-in ended. Sign in with Google again to use the AI." : "Sign in to Claude again to use the AI features."
    case "refused":
      return "Claude couldn't answer that one. Try asking it a different way."
    case "payment":
      return "That charge wasn't accepted, so nothing was taken. Check your credits and try again."
    case "invalid_json":
      return "The grade came back garbled. Try again."
    case "prompt_too_large":
      return "That was too long to send. Try a shorter answer."
    case "image_rejected":
      return "That photo couldn't be read. Try a different one (JPEG or PNG)."
    case "images_unavailable":
      return "Photos can't be sent from this view."
    default:
      return "The connection dropped. Try again."
  }
}

/* ---------------- retrieval ---------------- */
const STOP = new Set(
  "a an and are as at be by do does for from how i in is it me my of on or our so that the their them then there these this to was we what when where which who why will with you your about should can could would inspector inspectors inspection sire ask asked asks tell show".split(" ")
)
const SYN: Record<string, string[]> = {
  gas: ["detector", "meter", "gas"],
  meter: ["detector", "meter"],
  ecdis: ["ecdis", "enc", "chart"],
  mooring: ["mooring", "rope", "winch", "line", "mbl"],
  rest: ["rest", "hours", "fatigue"],
  enclosed: ["enclosed", "entry", "permit"],
  lifeboat: ["lifeboat", "davit", "lsa"],
  fire: ["fire", "ffa", "extinguish", "foam"],
  ukc: ["ukc", "keel", "squat"],
  pms: ["pms", "maintenance"],
  piq: ["piq", "hvpq", "photo"],
}
export function tokenize(q: string) {
  const words = q.toLowerCase().replace(/[^a-z0-9/ ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w))
  const out = new Set<string>()
  for (const w of words) {
    const base = w.endsWith("s") && w.length > 4 ? w.slice(0, -1) : w
    out.add(base)
    for (const s of SYN[base] || []) out.add(s)
  }
  return [...out]
}
const score = (hay: string, terms: string[]) => terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0)

export interface Context {
  obs: { id: string; o: Obs }[]
  cards: { id: string; c: CardI }[]
  stories: { id: string; s: Story }[]
}
export function retrieve(q: string, rank: string, n = { obs: 7, cards: 6, stories: 3 }): Context {
  const terms = tokenize(q)
  const rel = new Set(RANK_TOPICS[rank] || [])
  const tags = (roleOf(rank).cards?.tags || []).filter((t) => t !== "All")
  const obs = OBS.map((o, i) => ({ o, i, s: score((o.t + " " + o.f + " " + o.p + " " + (CHAPTER_NAMES[o.c] || "")).toLowerCase(), terms) + (rel.has(o.p) ? 0.3 : 0) }))
    .filter((x) => x.s >= 1)
    .sort((a, b) => b.s - a.s)
    .slice(0, n.obs)
    .map((x) => ({ id: `O${x.i}`, o: x.o }))
  const cards = CARDS.map((c) => ({ c, s: score((c.q + " " + c.a + " " + c.p).toLowerCase(), terms) + (tags.includes(c.r) ? 0.5 : 0) }))
    .filter((x) => x.s >= 1)
    .sort((a, b) => b.s - a.s)
    .slice(0, n.cards)
    .map((x) => ({ id: `C${x.c.i}`, c: x.c }))
  const stories = STORIES.map((st) => {
    const r = st.d.report
    const hay = [st.headline, st.dek, ...st.takeaways, ...(st.d.negatives || []), ...(r ? r.gaps : [])].join(" ").toLowerCase()
    return { st, s: score(hay, terms) }
  })
    .filter((x) => x.s >= 1)
    .sort((a, b) => b.s - a.s)
    .slice(0, n.stories)
    .map((x) => ({ id: `S${x.st.d.id}`, s: x.st }))
  return { obs, cards, stories }
}

export function contextBlock(ctx: Context) {
  const lines: string[] = []
  for (const { id, o } of ctx.obs) lines.push(`[${id}] Observation, ch ${o.c} ${CHAPTER_NAMES[o.c] || ""}${o.y ? `, ${TYPE_NAME[o.y]}` : ""} (${o.i}): ${o.t}${o.f ? ` | Fix: ${o.f}` : ""}`)
  for (const { id, c } of ctx.cards) lines.push(`[${id}] Q&A for ${c.r}: Q: ${c.q} | A: ${c.a}${c.t ? ` | Note: ${c.t}` : ""}`)
  for (const { id, s } of ctx.stories) {
    const r = s.d.report
    lines.push(`[${id}] Inspection at ${s.place}, ${s.date}: ${s.headline}. ${s.dek} Takeaways: ${s.takeaways.join("; ")}${r?.negatives.length ? ` Findings: ${r.negatives.map((x) => x.text).join("; ")}` : ""}`)
  }
  return lines.length ? lines.join("\n") : "(no matching records)"
}

export const askRules = (rank: string, ship: string) =>
  `You are NilObs, a SIRE 2.0 vetting coach for tanker crews and the companies that manage them. Think like a former tanker master who now works as a vetting superintendent. ${roleContext(rank, ship)}

How to answer:
- Be practical and fit the answer to this person's role: ${roleOf(rank).group === "shore" ? "how to prepare the ship and crew, what to check and ask for, how to support the inspection and how to answer observations" : "what the inspector will ask them, what to show, what to say, and the traps people fall into"}.
- Use the CONTEXT records from real, de-identified inspections when they are relevant, and cite them inline with the record's id in square brackets, exactly as it appears at the start of its CONTEXT line. Never cite an id that is not in the context.
- Keep it under about 220 words unless asked for a plan or checklist. Short paragraphs and "- " bullets. Use **bold** for the key terms.
- Never invent regulation numbers, OCIMF question wording or company procedures. If something depends on the rule or the company, say "check your SMS" or "check the current regulation".
- If the question has nothing to do with ships, inspections or this app, say in one line that you only help with inspection prep.`

/* ---------------- tiny markdown ---------------- */
export type Block = { kind: "p" | "li" | "h"; text: string }
export function mdBlocks(src: string): Block[] {
  const out: Block[] = []
  for (const raw of src.split(/\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (/^#{1,4}\s+/.test(line)) out.push({ kind: "h", text: line.replace(/^#{1,4}\s+/, "") })
    else if (/^([-*•]|\d+[.)])\s+/.test(line)) out.push({ kind: "li", text: line.replace(/^([-*•]|\d+[.)])\s+/, "") })
    else if (/^\*\*[^*]+\*\*:?$/.test(line)) out.push({ kind: "h", text: line.replace(/\*\*/g, "").replace(/:$/, "") })
    else out.push({ kind: "p", text: line })
  }
  return out
}
/** Split inline text into plain, bold and citation pieces. */
export function inline(text: string) {
  const parts: { t: "txt" | "b" | "cite"; v: string }[] = []
  const re = /(\*\*[^*]+\*\*|\[(?:O|C|S)\d+\])/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push({ t: "txt", v: text.slice(last, m.index) })
    const v = m[0]
    parts.push(v.startsWith("**") ? { t: "b", v: v.slice(2, -2) } : { t: "cite", v: v.slice(1, -1) })
    last = m.index! + v.length
  }
  if (last < text.length) parts.push({ t: "txt", v: text.slice(last) })
  return parts
}
export const citedIds = (text: string) => [...new Set([...text.matchAll(/\[((?:O|C|S)\d+)\]/g)].map((m) => m[1]))]
