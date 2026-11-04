// "What to show" for each question in the bank: two to four points written for that one question (not one list per
// topic), and the SIRE 2.0 question numbers it touches. Written by NilObs from the debriefs, with corrections from
// our vetting experts (for example: the fixed gas detection system is usually the first to alarm when cargo leaks
// into ballast tanks or void spaces; an ODME failure goes in the Oil Record Book, the office, flag and class are
// told, a dispensation is sought if needed, and the ORB records the repair). Checked in app/tests/notes.test.mjs.
import raw from "@/gen/bank-notes.json"
import { LIBRARY, type LibQ } from "@/library"

export type Note = { w: string[]; r: string[] }
const NOTES = raw as Record<string, Note>
const BY_N = new Map(LIBRARY.map((q) => [q.n, q]))

/** The points for one bank question (by its id, e.g. "4-9") and its related SIRE 2.0 questions; null if none. */
export function noteFor(id: string): { show: string[]; related: LibQ[] } | null {
  const n = NOTES[id]
  if (!n || !n.w.length) return null
  return { show: n.w, related: n.r.map((x) => BY_N.get(x)).filter((q): q is LibQ => !!q) }
}
