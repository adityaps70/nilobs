// Fleet data added from the uploaded archive: inspection reports, observation lists,
// rank-wise question notes and checklists. All de-identified and paraphrased (see scratch/zdata/RULES.txt).
import type { Debrief, Topic } from "@/data"
import rep from "@/gen/reports.json"
import obsRaw from "@/gen/obs.json"
import cardsRaw from "@/gen/cards.json"
import kitRaw from "@/gen/kit.json"

export type ObsType = "Human" | "Process" | "Hardware"
export interface Finding {
  text: string
  q?: string | null
  chapter?: number | null
  type?: ObsType | null
  rank?: string | null
  topic?: Topic
}
export interface ReportStory {
  id: number
  inspType: string
  port: string
  country: string
  coords?: [number, number] | null
  date: string
  major?: string | null
  shipType?: string | null
  durationH?: number | null
  sequence?: string[] | null
  timeSplit?: [string, number][] | null
  style?: string | null
  result: "nil" | "negatives" | "unknown"
  negatives: Finding[]
  positives: Finding[]
  questions: { q: string; topic: Topic; who?: string | null }[]
  gaps: string[]
  condition: string[]
  crew: string[]
  headline: string
  dek: string
  takeaways: string[]
  sources: string[]
}

const R = rep as unknown as { stories: ReportStory[]; extras: Record<string, ReportStory> }
export const REPORTS = R.stories
export const EXTRAS: Record<number, ReportStory> = Object.fromEntries(Object.entries(R.extras).map(([k, v]) => [Number(k), v]))

export const REPORT_DEBRIEFS: Debrief[] = REPORTS.map((r) => ({
  id: r.id,
  port: r.port,
  country: r.country,
  coords: r.coords ?? undefined,
  date: r.date,
  major: r.major ?? undefined,
  areas: [],
  questions: r.questions.map((q) => ({ q: q.q, topic: q.topic, who: q.who ?? undefined })),
  negatives: r.negatives.map((n) => n.text),
  positives: r.positives.length,
  full: true,
  shipType: r.shipType ?? undefined,
  result: r.result === "nil" ? "nil" : r.result === "negatives" ? "negatives" : undefined,
  negTopics: [...new Set(r.negatives.map((n) => n.topic).filter(Boolean))] as Topic[],
  style: r.style ?? undefined,
  timeSplit: r.timeSplit ?? undefined,
  src: "report",
  report: r,
}))

/* ---------------- Observations ---------------- */
export interface Obs {
  t: string // what was found (paraphrased)
  f: string // how to avoid it
  c: number // SIRE 2.0 chapter
  y: "H" | "P" | "W" | "" // Human, Process, Hardware
  k: string // performance factor / reason
  r: string // rank when stated
  p: Topic
  s: "2026" | "2025" | "pv"
  i: string // SIRE 2.0, CDI, Pre-vetting
  q: string
}
export const OBS = obsRaw as Obs[]
export const TYPE_NAME: Record<string, ObsType> = { H: "Human", P: "Process", W: "Hardware" }
export const TYPE_KEYS = ["H", "P", "W"] as const
// Categorical slots 1-3 (validated: CVD ΔE 9.2, normal 27.6). Labels are always shown next to them.
export const TYPE_COLOR: Record<string, string> = { H: "#2a78d6", P: "#eb6834", W: "#1baf7a" }
export const TYPE_HINT: Record<string, string> = {
  H: "A person didn't know, didn't do, or couldn't show it",
  P: "The procedure was missing, unclear or not followed in practice",
  W: "Equipment, records or condition fell short",
}

export const CHAPTER_NAMES: Record<number, string> = {
  1: "General information",
  2: "Certification & documentation",
  3: "Crew management",
  4: "Navigation & communications",
  5: "Safety management",
  6: "Pollution prevention",
  7: "Maritime security",
  8: "Cargo & ballast systems",
  9: "Mooring & anchoring",
  10: "Machinery spaces",
  11: "General appearance & condition",
  12: "Ice operations",
}

export function countBy<T>(list: T[], key: (x: T) => string | number) {
  const m = new Map<string | number, number>()
  for (const x of list) {
    const k = key(x)
    if (k === "" || k === 0) continue
    m.set(k, (m.get(k) || 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

// Public benchmark for context (INTERTANKO SIRE 2.0 benchmarking statistics, Jan-Jun 2025, 3,692 reports)
export const BENCH = { reports: 3692, avgNeg: 3.62, avgPos: 0.47, period: "Jan–Jun 2025" }

/* ---------------- Flashcards ---------------- */
export type DeckId = "trending" | "ecdis" | "ratings" | "cdi" | "china"
export interface Card {
  d: DeckId
  r: string
  p: Topic
  q: string
  a: string
  t: string
  l: number
}
export const CARDS = (cardsRaw as Card[]).map((c, i) => ({ ...c, i }))
export type CardI = (typeof CARDS)[number]

export interface Deck {
  id: DeckId
  name: string
  sub: string
  cost: number // one-time unlock in credits, 0 = free
  color: string
}
export const DECKS: Deck[] = [
  { id: "trending", name: "Trending SIRE 2.0 questions", sub: "Rank-wise questions and the answers inspectors expect", cost: 0, color: "blue" },
  { id: "ratings", name: "Rating interviews", sub: "What inspectors ask ABs, OSs, pumpmen and fitters", cost: 0, color: "teal" },
  { id: "ecdis", name: "ECDIS: inspectors' favourites", sub: "Settings, symbols, updates and failures", cost: 30, color: "violet" },
  { id: "cdi", name: "CDI inspection prep", sub: "Chemical tanker inspections, documents and recent findings", cost: 30, color: "amber" },
  { id: "china", name: "China coast: MSA safety 100", sub: "Fishing fleets, watchkeeping and VHF off China", cost: 30, color: "rose" },
]
export const deckById = (id: DeckId) => DECKS.find((d) => d.id === id)!

const RANK_TO_CARD: Record<string, string[]> = {
  Master: ["Master", "All"],
  "C/O": ["C/O", "CCR", "All"],
  "2/O": ["2/O", "CCR", "All"],
  "3/O": ["3/O", "CCR", "All"],
  "C/E": ["Engineers", "All"],
}
export function cardsFor(deck: DeckId, rank: string) {
  const all = CARDS.filter((c) => c.d === deck)
  if (deck !== "trending" && deck !== "cdi") return all
  const rs = RANK_TO_CARD[rank] || RANK_TO_CARD["2/O"]
  const mine = all.filter((c) => rs.includes(c.r))
  return mine.length >= 12 ? mine : all
}

/* ---------------- Ready kit (checklists) ---------------- */
interface KitRaw {
  cdiDocs: string[]
  cdiPersonal: string[]
  drills: { name: string; ref: string }[]
  familiarisation: string[]
  restHours: string[]
  cyber: string[]
  photos: string[]
}
const K = kitRaw as KitRaw
export interface KitList {
  id: string
  title: string
  sub: string
  items: { id: string; text: string; ref?: string }[]
}
const mk = (id: string, title: string, sub: string, xs: string[]): KitList => ({ id, title, sub, items: xs.map((t, i) => ({ id: `${id}.${i}`, text: t })) })
export const KIT: KitList[] = [
  { id: "drills", title: "SIRE 2.0 drill matrix", sub: "Drills inspectors expect to see in the records", items: K.drills.map((d, i) => ({ id: `drills.${i}`, text: d.name, ref: d.ref })) },
  mk("rest", "Rest-hour cross-checks", "Where inspectors compare rest hours with other records", K.restHours),
  mk("famil", "Familiarisation traps", "What gets picked up in familiarisation records", K.familiarisation),
  mk("cyber", "Cyber security evidence", "What to show when asked about cyber security", K.cyber),
  mk("photos", "Photo upload rules", "Photos that match the ship on the day", K.photos),
  mk("cdiDocs", "CDI: documents to have ready", "Lay these out before the CDI inspector boards", K.cdiDocs),
  mk("cdiPersonal", "CDI: check these yourself", "Items to check personally before a CDI inspection", K.cdiPersonal),
]
export const KIT_TOTAL = KIT.reduce((n, l) => n + l.items.length, 0)

export const FLEET_STATS = {
  reports: REPORTS.length + Object.keys(EXTRAS).length,
  obs: OBS.length,
  cards: CARDS.length,
  kit: KIT_TOTAL,
  positives: REPORTS.reduce((n, r) => n + r.positives.length, 0),
}
