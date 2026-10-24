// The NilObs certificate of completion: what it takes, worked out the same way in the app and on the server
// (worker/certs.js) from the account's synced progress. It records self-study in NilObs; it is not an official,
// STCW or OCIMF certificate, and says so.
// Pure data, no React.
import { ROLES } from "./roles.ts"

export const CERT = { cardsPerTopic: 5, drills: 7, interviewAvg: 6, interviewAnswers: 3 }
export const CERT_TITLE = "SIRE 2.0 Inspection Readiness: self-study course"

export interface CertCheck { id: "role" | "topics" | "drills" | "interview"; label: string; done: boolean; have: number; need: number }
type R = Record<string, unknown>
const obj = (x: unknown): R => (x && typeof x === "object" && !Array.isArray(x) ? (x as R) : {})
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0)

export function roleTopics(rank: string): string[] {
  return ROLES.find((r) => r.id === rank)?.topics.slice(0, 10) || []
}

/** The four things a certificate needs, from synced progress (sr.progress) and the profile (sr.profile). */
export function certChecks(progress: unknown, profile: unknown): CertCheck[] {
  const p = obj(progress)
  const prof = obj(profile)
  const rank = typeof prof.rank === "string" ? prof.rank : ""
  const topics = roleTopics(rank)
  const stats = obj(p.topic)
  const practised = topics.filter((t) => {
    const c = obj(stats[t]).c
    return Array.isArray(c) && num(c[1]) >= CERT.cardsPerTopic
  }).length
  const drills = Math.max(0, Math.round(num(obj(p.drill).done)))
  const interviews = Array.isArray(p.interviews) ? (p.interviews as unknown[]) : []
  const best = interviews.reduce<number>((m, x) => {
    const r = obj(x)
    return num(r.n) >= CERT.interviewAnswers ? Math.max(m, num(r.avg)) : m
  }, 0)
  return [
    { id: "role", label: "Pick your role", done: !!topics.length, have: topics.length ? 1 : 0, need: 1 },
    { id: "topics", label: `Practise at least ${CERT.cardsPerTopic} cards in every topic for your role`, done: !!topics.length && practised >= topics.length, have: practised, need: topics.length || 1 },
    { id: "drills", label: `Finish ${CERT.drills} daily drills`, done: drills >= CERT.drills, have: Math.min(drills, CERT.drills), need: CERT.drills },
    { id: "interview", label: `Score ${CERT.interviewAvg}/10 or more in an AI inspector session (${CERT.interviewAnswers}+ answers)`, done: best >= CERT.interviewAvg, have: Math.round(best * 10) / 10, need: CERT.interviewAvg },
  ]
}
export const certReady = (checks: CertCheck[]) => checks.every((c) => c.done)

/** A name for a certificate: letters, spaces, dots, hyphens and apostrophes, 2 to 60 characters. */
export function cleanCertName(s: unknown): string | null {
  const t = String(s ?? "").replace(/\s+/g, " ").trim()
  if (t.length < 2 || t.length > 60 || !/^[\p{L}\p{M} .'-]+$/u.test(t)) return null
  return t
}
