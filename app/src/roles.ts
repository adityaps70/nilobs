// Who uses NilObs: every crew rank on a tanker, the company's shore staff, or any other role typed in.
// Not tied to one company: the topics and SIRE 2.0 sections below follow the usual division of duties on a
// tanker and in a ship manager's office. Each company's SMS may split things differently, and the app says so.
// Pure data and helpers, no React (tests: app/tests/roles.test.mjs).
import type { Topic } from "@/data"

export type RoleGroup = "deck" | "engine" | "cadet" | "rating" | "catering" | "shore" | "other"
export interface Role {
  id: string
  name: string
  group: RoleGroup
  /** Inspection topics this role usually answers for or looks after. */
  topics: Topic[]
  /** SIRE 2.0 question sections (e.g. "4.1") this role usually covers; "*" for all of them. */
  sections: string[]
  /** Which prepared flashcards fit: the card deck and its rank tags. Empty: no prepared cards, the AI writes them. */
  cards: { deck: "trending" | "ratings"; tags: string[] } | null
  /** The prepared mock-interview bank to use, if there is one for this role. */
  interview?: string
}

const ALL: Topic[] = [
  "Documents & SMS", "Defect reporting", "PIQ accuracy", "Training & certificates", "Rest hours & drills", "Permits & RA",
  "Pollution prevention", "Security & cyber", "Hull & condition", "Emergency equipment",
]

export const ROLES: Role[] = [
  // deck officers
  { id: "Master", name: "Master", group: "deck", interview: "Master", cards: { deck: "trending", tags: ["Master", "All"] },
    topics: ["Documents & SMS", "Defect reporting", "PIQ accuracy", "Watchkeeping", "Rest hours & drills", "UKC", "Passage planning", "Permits & RA", "Security & cyber", "Training & certificates"],
    sections: ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "3.1", "3.2", "3.3", "3.4", "3.5", "4.2", "4.3", "5.1", "5.7", "7.1", "7.2", "9.5", "12.1", "12.6"] },
  { id: "C/O", name: "Chief Officer", group: "deck", interview: "C/O", cards: { deck: "trending", tags: ["C/O", "CCR", "All"] },
    topics: ["Cargo", "Defect reporting", "PIQ accuracy", "LSA & FFA", "Rest hours & drills", "Watchkeeping", "Permits & RA", "Gas testing & enclosed space", "Emergency equipment", "PPE & personal safety", "Mooring & access", "Pollution prevention"],
    sections: ["2.3", "2.4", "3.5", "5.1", "5.5", "5.6", "5.7", "5.8", "5.9", "5.10", "5.11", "5.12", "6.1", "6.2", "6.3", "6.4", "6.6", "7.2", "7.4", "8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.99", "9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "12.4", "12.5"] },
  { id: "2/O", name: "Second Officer", group: "deck", interview: "2/O", cards: { deck: "trending", tags: ["2/O", "CCR", "All"] },
    topics: ["ECDIS", "Radar", "Passage planning", "UKC", "GMDSS", "Alarm & power-fail tests", "Equipment tests vs PMS", "Steering", "Watchkeeping"],
    sections: ["4.1", "4.2", "4.3", "4.4", "7.1", "7.3", "12.6"] },
  { id: "3/O", name: "Third Officer", group: "deck", interview: "3/O", cards: { deck: "trending", tags: ["3/O", "CCR", "All"] },
    topics: ["LSA & FFA", "GMDSS", "Rest hours & drills", "Watchkeeping", "Emergency equipment", "Gas testing & enclosed space"],
    sections: ["4.4", "5.1", "5.2", "5.3", "5.4", "5.12", "12.2"] },
  // engineers
  { id: "C/E", name: "Chief Engineer", group: "engine", interview: "C/E", cards: { deck: "trending", tags: ["Engineers", "All"] },
    topics: ["Engine room", "Steering", "Defect reporting", "Rest hours & drills", "Alarm & power-fail tests", "Emergency equipment", "Permits & RA", "PPE & personal safety", "Pollution prevention"],
    sections: ["2.4", "2.5", "3.5", "4.3", "5.2", "5.5", "6.1", "6.5", "10.1", "10.2", "10.3", "10.4", "10.5", "10.6", "10.7", "12.3"] },
  { id: "2/E", name: "Second Engineer", group: "engine", interview: "C/E", cards: { deck: "trending", tags: ["Engineers", "All"] },
    topics: ["Engine room", "Steering", "Emergency equipment", "Alarm & power-fail tests", "Permits & RA", "Pollution prevention", "Defect reporting"],
    sections: ["5.2", "5.5", "6.1", "6.5", "10.1", "10.2", "10.4", "10.5", "10.7"] },
  { id: "3/E", name: "Third Engineer", group: "engine", interview: "C/E", cards: { deck: "trending", tags: ["Engineers", "All"] },
    topics: ["Engine room", "Emergency equipment", "Pollution prevention", "PPE & personal safety"],
    sections: ["5.2", "6.5", "10.2", "10.4", "10.5", "10.7"] },
  { id: "4/E", name: "Fourth Engineer", group: "engine", interview: "C/E", cards: { deck: "trending", tags: ["Engineers", "All"] },
    topics: ["Engine room", "Emergency equipment", "PPE & personal safety", "LSA & FFA"],
    sections: ["5.2", "5.4", "10.2", "10.4", "10.7"] },
  { id: "ETO", name: "Electro-Technical Officer", group: "engine", interview: "C/E", cards: { deck: "trending", tags: ["Engineers", "All"] },
    topics: ["Alarm & power-fail tests", "Equipment tests vs PMS", "Emergency equipment", "Engine room", "Security & cyber"],
    sections: ["4.1", "5.2", "7.5", "10.2", "10.4"] },
  // cadets
  { id: "Deck cadet", name: "Deck Cadet", group: "cadet", interview: "3/O", cards: { deck: "trending", tags: ["3/O", "All"] },
    topics: ["LSA & FFA", "Watchkeeping", "Mooring & access", "PPE & personal safety", "Training & certificates"],
    sections: ["3.3", "5.1", "5.3", "5.4", "5.10", "5.12", "9.4"] },
  { id: "Engine cadet", name: "Engine Cadet", group: "cadet", interview: "C/E", cards: { deck: "trending", tags: ["Engineers", "All"] },
    topics: ["Engine room", "PPE & personal safety", "Pollution prevention", "Training & certificates"],
    sections: ["3.3", "5.3", "6.5", "10.2", "10.3"] },
  // ratings
  { id: "Bosun", name: "Bosun", group: "rating", cards: { deck: "ratings", tags: [] },
    topics: ["Mooring & access", "PPE & personal safety", "Permits & RA", "LSA & FFA", "Pollution prevention"],
    sections: ["5.4", "5.9", "5.10", "5.12", "6.4", "9.1", "9.3", "9.4"] },
  { id: "Pumpman", name: "Pumpman", group: "rating", cards: { deck: "ratings", tags: [] },
    topics: ["Cargo", "Gas testing & enclosed space", "Permits & RA", "PPE & personal safety", "Pollution prevention"],
    sections: ["5.5", "5.6", "6.2", "6.4", "8.1", "8.2", "8.3", "8.99"] },
  { id: "AB", name: "Able Seaman", group: "rating", cards: { deck: "ratings", tags: [] },
    topics: ["Watchkeeping", "Mooring & access", "Security & cyber", "PPE & personal safety", "LSA & FFA"],
    sections: ["4.2", "5.1", "5.10", "5.12", "6.4", "7.2", "9.3", "9.4"] },
  { id: "OS", name: "Ordinary Seaman", group: "rating", cards: { deck: "ratings", tags: [] },
    topics: ["Mooring & access", "PPE & personal safety", "LSA & FFA", "Rest hours & drills"],
    sections: ["5.1", "5.10", "5.12", "6.4", "9.4"] },
  { id: "Fitter", name: "Fitter", group: "rating", cards: { deck: "ratings", tags: [] },
    topics: ["Engine room", "Permits & RA", "PPE & personal safety", "Emergency equipment"],
    sections: ["5.5", "5.9", "5.12", "10.3", "10.7"] },
  { id: "Oiler", name: "Oiler / Motorman", group: "rating", cards: { deck: "ratings", tags: [] },
    topics: ["Engine room", "Pollution prevention", "PPE & personal safety", "Rest hours & drills"],
    sections: ["5.1", "5.12", "6.5", "10.2", "10.3"] },
  { id: "Wiper", name: "Wiper", group: "rating", cards: { deck: "ratings", tags: [] },
    topics: ["Engine room", "Pollution prevention", "PPE & personal safety"],
    sections: ["5.1", "5.12", "6.5", "10.3"] },
  // catering
  { id: "Cook", name: "Cook", group: "catering", cards: null,
    topics: ["PPE & personal safety", "Rest hours & drills", "Emergency equipment", "Training & certificates"],
    sections: ["3.5", "5.1", "5.8", "5.12"] },
  { id: "Steward", name: "Steward / Messman", group: "catering", cards: null,
    topics: ["PPE & personal safety", "Rest hours & drills", "LSA & FFA", "Training & certificates"],
    sections: ["3.5", "5.1", "5.8", "5.12"] },
  // the company's shore staff
  { id: "Marine superintendent", name: "Marine Superintendent", group: "shore", cards: null,
    topics: ["Documents & SMS", "PIQ accuracy", "Defect reporting", "Training & certificates", "Watchkeeping", "Passage planning", "Mooring & access", "Cargo", "Security & cyber"],
    sections: ["2.2", "2.7", "3.1", "3.2", "3.3", "3.4", "3.5", "4.2", "4.3", "5.1", "5.7", "7.1", "7.2", "7.4", "9.1", "9.3", "9.4", "9.5", "12.1"] },
  { id: "Technical superintendent", name: "Technical Superintendent", group: "shore", cards: null,
    topics: ["Engine room", "Hull & condition", "Defect reporting", "Equipment tests vs PMS", "Emergency equipment", "Pollution prevention", "Steering"],
    sections: ["2.3", "2.4", "2.5", "2.6", "5.2", "6.5", "6.6", "10.1", "10.2", "10.3", "10.4", "10.5", "10.6", "10.7", "12.3"] },
  { id: "Port captain", name: "Port Captain", group: "shore", cards: null,
    topics: ["Cargo", "Mooring & access", "Passage planning", "UKC", "Permits & RA", "Pollution prevention"],
    sections: ["4.2", "6.2", "6.3", "8.1", "8.2", "8.3", "8.99", "9.3", "9.5", "9.6"] },
  { id: "Vetting manager", name: "Vetting Manager / Superintendent", group: "shore", cards: null,
    topics: ["PIQ accuracy", "Documents & SMS", "Defect reporting", "Training & certificates", "Hull & condition", "Cargo", "ECDIS", "Engine room"],
    sections: ["*"] },
  { id: "HSEQ manager", name: "HSEQ Manager", group: "shore", cards: null,
    topics: ["Documents & SMS", "Permits & RA", "PPE & personal safety", "Pollution prevention", "Rest hours & drills", "Gas testing & enclosed space", "Training & certificates"],
    sections: ["2.5", "2.6", "2.7", "3.4", "5.1", "5.5", "5.6", "5.7", "5.8", "5.12", "6.1", "6.2", "6.4", "6.5"] },
  { id: "DPA", name: "Designated Person Ashore", group: "shore", cards: null,
    topics: ["Documents & SMS", "Defect reporting", "Rest hours & drills", "Training & certificates", "Permits & RA"],
    sections: ["2.2", "2.5", "2.7", "3.4", "5.1", "5.7"] },
  { id: "Fleet manager", name: "Fleet Manager", group: "shore", cards: null,
    topics: ["Documents & SMS", "Defect reporting", "PIQ accuracy", "Hull & condition", "Training & certificates", "Engine room"],
    sections: ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "3.1", "3.2", "10.4"] },
  { id: "Crewing manager", name: "Crewing Manager", group: "shore", cards: null,
    topics: ["Training & certificates", "Rest hours & drills", "Documents & SMS"],
    sections: ["3.1", "3.2", "3.3", "3.4", "3.5"] },
  { id: "Training officer", name: "Training Officer", group: "shore", cards: null,
    topics: ["Training & certificates", "Rest hours & drills", "Emergency equipment", "LSA & FFA", "Gas testing & enclosed space"],
    sections: ["3.2", "3.3", "3.5", "5.1", "5.3", "5.4"] },
  // anything else, typed in by the user
  { id: "Other", name: "Other role", group: "other", cards: null, topics: ALL, sections: ["*"] },
]

export const ROLE_GROUPS: { id: RoleGroup; name: string }[] = [
  { id: "deck", name: "Deck officers" },
  { id: "engine", name: "Engineers" },
  { id: "cadet", name: "Cadets" },
  { id: "rating", name: "Ratings" },
  { id: "catering", name: "Catering" },
  { id: "shore", name: "Shore staff (company)" },
  { id: "other", name: "Something else" },
]

const BY_ID = new Map(ROLES.map((r) => [r.id, r]))
/** All role ids, in the order they're offered. */
export const RANKS = ROLES.map((r) => r.id)
export const isRole = (id: unknown): id is string => typeof id === "string" && BY_ID.has(id)
export const roleOf = (id: string): Role => BY_ID.get(id) || BY_ID.get("2/O")!

/** Display names by role id. "Other" shows the role the user typed (see setCustomRole). */
export const RANK_NAMES: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.id, r.name]))
/** Focus topics by role id. */
export const RANK_TOPICS: Record<string, Topic[]> = Object.fromEntries(ROLES.map((r) => [r.id, r.topics]))

/** The user's own words for "Other" ("Cargo surveyor", "Terminal rep"), used in labels and AI prompts. */
export function setCustomRole(name: string | undefined | null) {
  const n = String(name || "").replace(/\s+/g, " ").trim().slice(0, 40)
  RANK_NAMES.Other = n || "Other role"
}
export const cleanRoleName = (name: unknown) => String(name || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40)
/** The user's company, if they gave one (optional, only used to tailor AI answers). */
let company = ""
export function setCompany(name: string | undefined | null) {
  company = String(name || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60)
}
export const currentCompany = () => company
/** Who is using the app right now (set from the saved profile), for screens that don't get it passed in. */
let current = { rank: "2/O", ship: "Product" }
export function setCurrentProfile(rank: string | undefined, ship: string | undefined) {
  current = { rank: rank && BY_ID.has(rank) ? rank : "2/O", ship: ship || "Product" }
}
export const currentRole = () => current.rank
export const currentShip = () => current.ship

export const isShore = (id: string) => roleOf(id).group === "shore"
export const isCrew = (id: string) => !["shore", "other"].includes(roleOf(id).group)
/** Has hand-written interview questions and rank-tagged flashcards (the AI writes the rest for other roles). */
export const hasPreparedQuestions = (id: string) => {
  const r = roleOf(id)
  return !!r.cards && (r.cards.deck === "ratings" || r.cards.tags.some((t) => t !== "All"))
}

/** Does this role usually cover SIRE 2.0 question `n` ("4.1.3")? Section-level, by the usual division of duties. */
export function coversQuestion(id: string, n: string) {
  const s = roleOf(id).sections
  if (s.includes("*")) return true
  const sec = n.split(".").slice(0, 2).join(".")
  return s.includes(sec)
}

/** A one-line description of who the user is, for AI prompts: crew on board, or the company ashore. */
export function roleContext(id: string, ship: string, companyName: string = company) {
  const r = roleOf(id)
  const name = RANK_NAMES[id] || r.name
  const shipText = `${String(ship || "product").toLowerCase()} tanker`
  const co = companyName ? ` The user works for ${cleanRoleName(companyName)}; don't assume anything about that company's procedures beyond general industry practice.` : ""
  if (r.group === "shore") return `The user is a ${name} ashore at the company that manages a ${shipText}: they prepare the ship and crew for oil-major (SIRE 2.0, CDI) inspections, attend or follow inspections, and answer the observations.${co}`
  if (r.group === "other") return `The user describes their role as "${name}" and works with a ${shipText}. Tailor the help to that role; if it is unclear, give advice that suits both ship and office.${co}`
  return `The user is the ${name} on board a ${shipText} preparing for an oil-major (SIRE 2.0) inspection.${co}`
}
