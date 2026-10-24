// Shared pieces for the live features: the live industry feed (feed.js), daily reminders (push.js), the
// inspection pulse (pulse.js) and weekly leagues (league.js). Tables are created on first use, like the others.
import { reply } from "./guard.js"

const SCHEMA = [
  // the industry feed: one row per article/report, with the AI's takeaway once it has been read
  "CREATE TABLE IF NOT EXISTS feed_items (id TEXT PRIMARY KEY, source TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL, excerpt TEXT, published_at INTEGER NOT NULL, fetched_at INTEGER NOT NULL, status TEXT NOT NULL, kind TEXT, relevance INTEGER, ai TEXT)",
  "CREATE INDEX IF NOT EXISTS feed_status_pub ON feed_items (status, published_at)",
  "CREATE TABLE IF NOT EXISTS feed_sources (id TEXT PRIMARY KEY, last_run INTEGER, last_ok INTEGER, last_error TEXT, items INTEGER)",
  // daily reminders: a browser's push address, the hour it wants reminding (its own time zone) and the last day sent
  "CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, hour INTEGER NOT NULL, tz INTEGER NOT NULL, created_at INTEGER NOT NULL, last_day TEXT, fails INTEGER NOT NULL DEFAULT 0)",
  "CREATE INDEX IF NOT EXISTS push_subs_user ON push_subs (user_id)",
  // keys the Worker makes for itself (the reminder signing key)
  "CREATE TABLE IF NOT EXISTS app_keys (k TEXT PRIMARY KEY, v TEXT NOT NULL)",
  // shared debriefs: the text as sent (private), and the de-identified version others see
  "CREATE TABLE IF NOT EXISTS debriefs (id TEXT PRIMARY KEY, user_id TEXT, created_at INTEGER NOT NULL, status TEXT NOT NULL, ship TEXT, role TEXT, raw TEXT, pub TEXT, topics TEXT)",
  "CREATE INDEX IF NOT EXISTS debriefs_status ON debriefs (status, created_at)",
  "CREATE INDEX IF NOT EXISTS debriefs_user ON debriefs (user_id)",
]
let ready = null
export function ensureLiveSchema(db) {
  ready ??= db.batch(SCHEMA.map((q) => db.prepare(q))).catch((e) => {
    ready = null
    throw e
  })
  return ready
}
export const resetLiveSchemaFlag = () => (ready = null)

export const DAY = 86400000
export const enc = new TextEncoder()
export const b64url = (bytes) => {
  let s = ""
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
export const fromB64url = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4)), (c) => c.charCodeAt(0))
export async function sha256hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
}
export const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } })
export { reply }

/** The topics NilObs teaches (app/src/data.ts), so the AI tags things in the app's own words. */
export const TOPICS = [
  "ECDIS", "Radar", "UKC", "Passage planning", "GMDSS", "Alarm & power-fail tests", "Equipment tests vs PMS", "Documents & SMS", "Rest hours & drills",
  "Defect reporting", "Watchkeeping", "Steering", "LSA & FFA", "Engine room", "Cargo", "PIQ accuracy", "Permits & RA", "Emergency equipment",
  "Gas testing & enclosed space", "PPE & personal safety", "Mooring & access", "Pollution prevention", "Security & cyber", "Training & certificates", "Hull & condition",
]
export const cleanTopics = (list) => (Array.isArray(list) ? list.filter((t) => TOPICS.includes(t)).slice(0, 3) : [])

/**
 * Ask Claude (the quick model, our own key) for JSON. Returns the parsed value, or null if anything goes wrong:
 * the live features always have a sensible fallback, so a hiccup here never breaks a page.
 */
export async function claudeJson(env, { system, prompt, maxTokens = 1500 }, fetchImpl = fetch) {
  if (!env.ANTHROPIC_API_KEY) return null
  try {
    const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: env.NILOBS_MODEL_QUICK || "claude-haiku-5-5", max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] }),
    })
    if (!res.ok) {
      console.error("live ai", res.status)
      return null
    }
    const out = await res.json()
    const text = (out?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("")
    const start = text.search(/[[{]/)
    const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"))
    if (start < 0 || end < start) return null
    return JSON.parse(text.slice(start, end + 1))
  } catch (e) {
    console.error("live ai", e?.message || e)
    return null
  }
}

/** Plain text from a bit of HTML or XML: tags out, entities decoded, spaces tidied. */
export function plain(s, max = 400) {
  const t = String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;|&mdash;/g, "-")
    .replace(/&hellip;/g, "...")
    .replace(/<[^>]+>/g, " ") // tags that were themselves encoded (&lt;b&gt;)
    .replace(/\s+/g, " ")
    .trim()
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : t
}

/** Which league / audience a role belongs to (app/src/roles.ts groups). */
export function sideOfRank(rank, roles) {
  const r = roles.get(rank)
  if (!rank || !r) return "other"
  if (r.group === "deck" || r.group === "cadet" && /Deck/.test(r.name)) return "deck"
  if (r.group === "engine" || r.group === "cadet") return "engine"
  if (r.group === "rating" || r.group === "catering") return "ratings"
  if (r.group === "shore") return "shore"
  return "other"
}
