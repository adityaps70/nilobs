// Photo check, the pure part: areas, the real examples sent with each photo, the prompt, and the
// clean-up of whatever comes back. No React here, so it can be unit-tested (app/tests/photo.test.mjs).
import { CHAPTER_NAMES, OBS, TYPE_NAME, type Obs } from "@/fleet"
import { isShore } from "@/roles"
import { RANK_NAMES, type Topic } from "@/data"

/* ---------------- areas ---------------- */
export type AreaId = "deck" | "mooring" | "cargo" | "bridge" | "engine" | "lsa" | "accom" | "record" | "any"
export interface Area { id: AreaId; label: string; sub: string; topics: Topic[]; record?: boolean }
export const AREAS: Area[] = [
  { id: "deck", label: "Main deck & access", sub: "Gangway, walkways, manifold, pipework", topics: ["Mooring & access", "Hull & condition", "PPE & personal safety", "Pollution prevention", "Security & cyber", "Cargo"] },
  { id: "mooring", label: "Mooring station", sub: "Winches, ropes, fairleads, forecastle", topics: ["Mooring & access", "Hull & condition", "PPE & personal safety"] },
  { id: "cargo", label: "Cargo control & pump room", sub: "CCR, gas detection, pumps, ballast", topics: ["Cargo", "Gas testing & enclosed space", "Pollution prevention", "Equipment tests vs PMS"] },
  { id: "bridge", label: "Bridge", sub: "ECDIS, radar, GMDSS, logs, alarms", topics: ["ECDIS", "Radar", "UKC", "Passage planning", "Watchkeeping", "GMDSS", "Alarm & power-fail tests", "Steering"] },
  { id: "engine", label: "Engine room & steering gear", sub: "Machinery, leaks, bilges, workshop", topics: ["Engine room", "Steering", "Pollution prevention", "Equipment tests vs PMS", "Defect reporting"] },
  { id: "lsa", label: "Lifesaving & firefighting", sub: "Lifeboats, extinguishers, hoses, SCBA", topics: ["LSA & FFA", "Emergency equipment"] },
  { id: "accom", label: "Accommodation & galley", sub: "Fire doors, galley, stores, hospital", topics: ["Emergency equipment", "PPE & personal safety", "Hull & condition", "Security & cyber"] },
  { id: "record", label: "A record or document", sub: "Permit, checklist, rest hours, log page", topics: ["Documents & SMS", "Permits & RA", "Rest hours & drills", "Training & certificates", "Gas testing & enclosed space", "Defect reporting", "Equipment tests vs PMS"], record: true },
  { id: "any", label: "Not sure", sub: "Let the inspector work it out", topics: [] },
]
export const areaById = (id: string) => AREAS.find((a) => a.id === id) ?? AREAS[AREAS.length - 1]

/** About a dozen real, de-identified observations from this area, spread across its topics. */
export function examplesFor(area: Area, n = 12): { id: string; o: Obs }[] {
  const want = (o: Obs) => (area.record ? o.y === "P" || o.y === "H" : o.y === "W")
  const pool = OBS.map((o, i) => ({ o, i }))
    .filter(({ o }) => !area.topics.length || area.topics.includes(o.p))
    .sort((a, b) => Number(want(b.o)) - Number(want(a.o)) || Number(b.o.s === "2026") - Number(a.o.s === "2026") || a.i - b.i)
  const byTopic = new Map<string, { o: Obs; i: number }[]>()
  for (const x of pool) byTopic.set(x.o.p, [...(byTopic.get(x.o.p) || []), x])
  const out: { o: Obs; i: number }[] = []
  while (out.length < n && [...byTopic.values()].some((l) => l.length))
    for (const l of byTopic.values()) {
      const x = l.shift()
      if (x) out.push(x)
      if (out.length >= n) break
    }
  return out.map((x) => ({ id: `O${x.i}`, o: x.o }))
}

/** Real findings that share at least two meaningful words with this one, preferring the area's own topics. */
const STOP = new Set("that this with from were there their than then into over under have been very could would should will about when what which where while also only some more most each other them they your just like".split(" "))
const words = (s: string) =>
  new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)).map((w) => (w.endsWith("s") && w.length > 4 ? w.slice(0, -1) : w)))
let obsWords: Set<string>[] | null = null
export function similarObs(text: string, area: Area, n = 2): { id: string; o: Obs }[] {
  const q = words(text)
  if (!q.size) return []
  obsWords ??= OBS.map((o) => words(o.t))
  return OBS.map((o, i) => ({ o, i, s: [...obsWords![i]].filter((w) => q.has(w)).length + (area.topics.includes(o.p) ? 0.5 : 0) }))
    .filter((x) => x.s >= 2)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, n)
    .map((x) => ({ id: `O${x.i}`, o: x.o }))
}

/* ---------------- result shape ---------------- */
export type Sev = "high" | "medium" | "low"
export type Box = [number, number, number, number]
export interface Finding { photo: number; title: string; severity: Sev; type: string; chapter: number | null; what: string; why: string; fix: string; box: Box | null; related: string[] }
export interface Result { relevant: boolean; area: string; summary: string; findings: Finding[]; good: string[]; checkNext: string[]; confidence: "high" | "medium" | "low" }

export const str = (v: unknown, max = 420) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")
const strs = (v: unknown, n = 3) => (Array.isArray(v) ? v.map((x) => str(x, 200)).filter(Boolean).slice(0, n) : [])
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const SEV_ORDER: Record<Sev, number> = { high: 0, medium: 1, low: 2 }
const isObsId = (id: string) => /^O\d+$/.test(id) && !!OBS[Number(id.slice(1))]

/** Turns whatever Claude sent back into a safe Result. Unknown fields are dropped; boxes are clamped. */
export function normalize(raw: unknown, photos: number, okId: (id: string) => boolean = isObsId): Result {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const findings: Finding[] = []
  for (const f of Array.isArray(r.findings) ? r.findings : []) {
    if (!f || typeof f !== "object") continue
    const x = f as Record<string, unknown>
    const title = str(x.title, 90)
    if (!title) continue
    let box: Box | null = null
    if (Array.isArray(x.box) && x.box.length === 4 && x.box.every((v) => typeof v === "number" && Number.isFinite(v))) {
      let b = x.box as number[]
      if (b.some((v) => v > 1.5)) b = b.map((v) => v / 100) // tolerate percentages
      const bx = clamp(b[0], 0, 1), by = clamp(b[1], 0, 1)
      const bw = clamp(b[2], 0, 1 - bx), bh = clamp(b[3], 0, 1 - by)
      if (bw > 0.02 && bh > 0.02 && bw * bh < 0.95) box = [bx, by, bw, bh]
    }
    const ch = Math.round(Number(x.chapter))
    findings.push({
      photo: clamp(Math.round(Number(x.photo) || 1), 1, Math.max(1, photos)),
      title,
      severity: (["high", "medium", "low"] as const).includes(x.severity as Sev) ? (x.severity as Sev) : "medium",
      type: ["Hardware", "Process", "Human"].includes(x.type as string) ? (x.type as string) : "",
      chapter: ch >= 1 && ch <= 12 ? ch : null,
      what: str(x.what),
      why: str(x.why),
      fix: str(x.fix),
      box,
      related: (Array.isArray(x.related) ? x.related : []).map(String).filter(okId).slice(0, 2),
    })
    if (findings.length >= 6) break
  }
  findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
  return {
    relevant: r.relevant !== false,
    area: str(r.area, 60),
    summary: str(r.summary, 500),
    findings,
    good: strs(r.good),
    checkNext: strs(r.check_next ?? r.checkNext),
    confidence: (["high", "medium", "low"] as const).includes(r.confidence as "high") ? (r.confidence as Result["confidence"]) : "medium",
  }
}

const chapterList = Object.entries(CHAPTER_NAMES).map(([k, v]) => `${k} ${v}`).join(", ")
export const photoPrompt = (area: Area, n: number, note: string, rank: string, ship: string, ex: { id: string; o: Obs }[]) => `Photo check. You are a senior OCIMF SIRE 2.0 inspector walking round a ${ship.toLowerCase()} tanker with ${isShore(rank) ? `the company's ${RANK_NAMES[rank] || rank}` : `its ${RANK_NAMES[rank] || rank}`}. The crew sent ${n === 1 ? "1 photo" : `${n} photos (numbered 1 to ${n} in the order given)`} of: ${area.id === "any" ? "somewhere on board (work out what it shows)" : `${area.label} (${area.sub})`}.${note ? `\nTheir note: "${note.slice(0, 300)}"` : ""}

Look at it the way you would on the day and say what you would raise as an observation or ask about, so the crew can fix it first.
Rules:
- Only flag what you can actually see. If something can't be judged from the photo (a date too small to read, whether a test was done), put it in check_next instead of guessing.
- Look at: condition and maintenance (corrosion, leaks, damage, missing or makeshift parts), housekeeping, labels, markings and instructions, obstructions and access, PPE and safe practice, equipment readiness. For a record: blanks, missing signatures, dates out of order, values outside limits, entries that don't match practice.
- No regulation numbers and no OCIMF question wording.
- Never write down a ship name, IMO number, company or person's name, or describe anyone's face. Refer to people as "a crew member".
- If the photo is not of a ship, shipboard equipment or a shipboard record, set relevant to false and leave findings empty.
- severity: "high" = you would very likely raise an observation; "medium" = it could be raised or would draw questions; "low" = housekeeping or a minor point.
- box: where it is in that photo, as [x, y, width, height], each a fraction from 0 to 1 of the image, x and y being the top-left corner. null if it isn't one spot.
- related: up to 2 ids from EXAMPLES that describe a similar real finding, else [].

EXAMPLES of real observations from inspections in this area (de-identified):
${ex.map(({ id, o }) => `[${id}] ch ${o.c}${o.y ? ` ${TYPE_NAME[o.y]}` : ""}: ${o.t}`).join("\n")}

Reply with only JSON in this shape:
{"relevant": true, "area": "what the photo shows, 2 to 5 words", "summary": "1-2 sentences: your overall view as the inspector", "findings": [{"photo": 1, "title": "short label, at most 8 words", "severity": "high", "type": "Hardware", "chapter": 9, "what": "what you can see", "why": "why it would be raised: the risk or the gap", "fix": "what to do before the inspection, 1-2 sentences", "box": [0.1, 0.2, 0.3, 0.25], "related": ["O12"]}], "good": ["up to 3 things that look right"], "check_next": ["up to 3 things you would also check that the photo can't show"], "confidence": "high"}
At most 6 findings, most serious first. type is Hardware, Process or Human. chapter is the SIRE 2.0 chapter: ${chapterList}. confidence is high, medium or low (low if the photo is dark, blurred or too far away).`

