// The live industry feed. Every few hours (worker/index.js → scheduled) the Worker reads a handful of public
// sources (official accident reports and guidance, plus maritime news feeds), keeps what's new, and asks Claude
// which items matter to a tanker crew facing a SIRE 2.0 inspection. For those it writes a short takeaway in its
// own words and one thing to check on board, tagged by role and topic. Readers always get the source's link.
//
//   GET /api/feed?limit=30&before=<ms>   the latest items worth reading (public: the home page shows a few)
//
// Nothing is copied from an article beyond its headline and link; the excerpt is only used to brief the AI.
import { DAY, TOPICS, claudeJson, cleanTopics, ensureLiveSchema, json, plain, sha256hex } from "./live.js"

export const SOURCES = [
  { id: "maib", name: "UK MAIB", kind: "govuk", official: true, url: "https://www.gov.uk/api/search.json?filter_content_store_document_type=maib_report&order=-public_timestamp&count=15" },
  { id: "mca", name: "UK MCA", kind: "govuk", official: true, url: "https://www.gov.uk/api/search.json?filter_organisations=maritime-and-coastguard-agency&filter_format=guidance&filter_format=statutory_guidance&order=-public_timestamp&count=15" },
  { id: "safety4sea", name: "SAFETY4SEA", kind: "rss", url: "https://safety4sea.com/feed/" },
  { id: "splash", name: "Splash247", kind: "rss", url: "https://splash247.com/feed/" },
  { id: "gcaptain", name: "gCaptain", kind: "rss", url: "https://gcaptain.com/feed/" },
  { id: "marineinsight", name: "Marine Insight", kind: "rss", url: "https://www.marineinsight.com/feed/" },
]
const SOURCE = new Map(SOURCES.map((s) => [s.id, s]))
export const KINDS = ["detention", "alert", "accident", "rule", "sire", "industry"]
const KEEP_DAYS = 14 // older items aren't news any more
const AI_PER_RUN = 16
const AI_BATCH = 8
const RELEVANT = 55

/* ---------------- reading sources ---------------- */
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))
  return m ? m[1] : ""
}
/** Items from an RSS 2.0 or Atom feed: title, link, date and a short excerpt. */
export function parseFeed(xml) {
  const out = []
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || []
  for (const b of blocks) {
    const title = plain(tag(b, "title"), 300)
    let link = plain(tag(b, "link"), 1000)
    if (!link) {
      const alt = b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || b.match(/<link[^>]*href=["']([^"']+)["']/i)
      link = alt ? alt[1] : ""
    }
    const date = plain(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"), 100)
    const excerpt = plain(tag(b, "description") || tag(b, "summary") || tag(b, "content:encoded") || tag(b, "content"), 500)
    const at = Date.parse(date)
    if (title && /^https?:\/\//.test(link)) out.push({ title, url: link.replace(/&amp;/g, "&"), excerpt, at: Number.isFinite(at) ? at : 0 })
  }
  return out
}
/** Items from GOV.UK's search API (MAIB reports, MCA guidance). */
export function parseGovUk(data) {
  const rows = Array.isArray(data?.results) ? data.results : []
  return rows
    .map((r) => ({ title: plain(r.title, 300), url: r.link ? (String(r.link).startsWith("http") ? r.link : `https://www.gov.uk${r.link}`) : "", excerpt: plain(r.description, 500), at: Date.parse(r.public_timestamp) || 0 }))
    .filter((r) => r.title && r.url)
}

async function readSource(src, fetchImpl) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 12000)
  try {
    const res = await fetchImpl(src.url, { headers: { "user-agent": "NilObs/1.0 (+https://nilobs.com)", accept: src.kind === "govuk" ? "application/json" : "application/rss+xml, application/atom+xml, application/xml, text/xml" }, signal: ctl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const items = src.kind === "govuk" ? parseGovUk(await res.json()) : parseFeed(await res.text())
    if (!items.length) throw new Error("no items found")
    return items
  } finally {
    clearTimeout(timer)
  }
}

/* ---------------- the AI's reading ---------------- */
const SYSTEM = `You brief tanker officers, engineers, ratings and shore superintendents on news that matters for SIRE 2.0 inspections, port state control and safe operations.
For each item you get a headline, source and short excerpt. Judge it only from that. Write in your own plain words: never copy sentences from the excerpt, never name people, never invent facts that aren't in the item.
Answer with JSON only: an array with one object per item, in the same order:
{"n": item number, "relevance": 0-100 (how useful to a tanker crew or their superintendent preparing for vetting or a PSC inspection; corporate news, appointments, markets, finance, newbuild orders and fishing-only stories are below 30),
 "kind": "detention" | "alert" | "accident" | "rule" | "sire" | "industry",
 "takeaway": "what happened and why it matters to a tanker crew, max 220 characters",
 "check": "one concrete thing to check or do on board this week because of it, max 160 characters",
 "roles": subset of ["deck","engine","ratings","shore"] it matters to most,
 "topics": up to 3 of ${JSON.stringify(TOPICS)}}`

const ROLES = ["deck", "engine", "ratings", "shore"]
async function brief(env, rows, fetchImpl) {
  const prompt = rows.map((r, i) => `Item ${i + 1}\nSource: ${SOURCE.get(r.source)?.name || r.source}\nHeadline: ${r.title}\nExcerpt: ${r.excerpt || "(none)"}`).join("\n\n")
  const out = await claudeJson(env, { system: SYSTEM, prompt, maxTokens: 2400 }, fetchImpl)
  return Array.isArray(out) ? out : null
}
const clip = (s, n) => plain(s, n)

/* ---------------- the job ---------------- */
/** Read every source, store what's new, have the AI read up to AI_PER_RUN new items, tidy old ones. */
export async function runFeed(env, now = Date.now(), fetchImpl = fetch) {
  await ensureLiveSchema(env.DB)
  const db = env.DB
  const report = { sources: {}, added: 0, read: 0, live: 0 }
  const health = []
  // Few queries per run (Cloudflare limits them): new items go in as multi-row inserts, updates as one batch
  for (const src of SOURCES) {
    try {
      const items = await readSource(src, fetchImpl)
      const rows = []
      for (const it of items) {
        const at = it.at || now
        if (at < now - KEEP_DAYS * DAY || at > now + DAY) continue
        rows.push([(await sha256hex(it.url)).slice(0, 24), src.id, it.url, it.title, it.excerpt || "", at, now])
      }
      let added = 0
      for (let i = 0; i < rows.length; i += 12) {
        const chunk = rows.slice(i, i + 12) // D1 allows 100 bound values per query
        const r = await db.prepare(`INSERT OR IGNORE INTO feed_items (id, source, url, title, excerpt, published_at, fetched_at, status) VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, 'new')").join(", ")}`)
          .bind(...chunk.flat()).run()
        added += Number(r?.meta?.changes) || 0
      }
      report.sources[src.id] = { ok: true, found: items.length, added }
      report.added += added
      health.push([src.id, now, now, null, items.length])
    } catch (e) {
      const msg = String(e?.name === "AbortError" ? "timed out" : e?.message || e).slice(0, 200)
      report.sources[src.id] = { ok: false, error: msg }
      health.push([src.id, now, null, msg, 0])
    }
  }
  if (health.length)
    await db.prepare(`INSERT INTO feed_sources (id, last_run, last_ok, last_error, items) VALUES ${health.map(() => "(?, ?, ?, ?, ?)").join(", ")} ON CONFLICT (id) DO UPDATE SET last_run = excluded.last_run, last_ok = COALESCE(excluded.last_ok, feed_sources.last_ok), last_error = excluded.last_error, items = CASE WHEN excluded.last_ok IS NULL THEN feed_sources.items ELSE excluded.items END`)
      .bind(...health.flat()).run()
  // the AI reads the newest unread items first
  const unread = (await db.prepare(`SELECT id, source, title, excerpt FROM feed_items WHERE status = 'new' ORDER BY published_at DESC LIMIT ${AI_PER_RUN}`).all()).results || []
  const updates = []
  for (let i = 0; i < unread.length; i += AI_BATCH) {
    const rows = unread.slice(i, i + AI_BATCH)
    const out = await brief(env, rows, fetchImpl)
    if (!out) break // the AI is unavailable: try again next run
    for (let j = 0; j < rows.length; j++) {
      const a = out.find((x) => Number(x?.n) === j + 1) || out[j]
      if (!a) continue
      const relevance = Math.max(0, Math.min(100, Math.round(Number(a.relevance) || 0)))
      const kind = KINDS.includes(a.kind) ? a.kind : "industry"
      const ai = { takeaway: clip(a.takeaway, 240), check: clip(a.check, 180), roles: (Array.isArray(a.roles) ? a.roles : []).filter((r) => ROLES.includes(r)), topics: cleanTopics(a.topics) }
      const status = relevance >= RELEVANT && ai.takeaway ? "live" : "skip"
      updates.push(db.prepare("UPDATE feed_items SET status = ?, kind = ?, relevance = ?, ai = ? WHERE id = ?").bind(status, kind, relevance, JSON.stringify(ai), rows[j].id))
      report.read++
      if (status === "live") report.live++
    }
  }
  updates.push(db.prepare("DELETE FROM feed_items WHERE published_at < ?").bind(now - 60 * DAY))
  await db.batch(updates)
  return report
}

/* ---------------- reading the feed ---------------- */
export function feedItem(r) {
  let ai = {}
  try {
    ai = JSON.parse(r.ai || "{}")
  } catch {
    /* an unreadable row shows its headline only */
  }
  const src = SOURCE.get(r.source)
  return {
    id: r.id,
    source: r.source,
    sourceName: src?.name || r.source,
    official: !!src?.official,
    url: r.url,
    title: r.title,
    publishedAt: r.published_at,
    kind: r.kind || "industry",
    takeaway: ai.takeaway || "",
    check: ai.check || "",
    roles: ai.roles || [],
    topics: ai.topics || [],
  }
}
export async function latestFeed(db, { limit = 30, before = 0 } = {}) {
  await ensureLiveSchema(db)
  const n = Math.max(1, Math.min(60, Number(limit) || 30))
  const rows = before
    ? (await db.prepare(`SELECT * FROM feed_items WHERE status = 'live' AND published_at < ? ORDER BY published_at DESC LIMIT ${n}`).bind(Number(before)).all()).results
    : (await db.prepare(`SELECT * FROM feed_items WHERE status = 'live' ORDER BY published_at DESC LIMIT ${n}`).all()).results
  return (rows || []).map(feedItem)
}

export async function handleFeed(request, env) {
  if (request.method !== "GET") return json(405, { error: "Use GET" })
  if (!env.DB) return json(200, { items: [], updatedAt: 0 })
  const url = new URL(request.url)
  const items = await latestFeed(env.DB, { limit: url.searchParams.get("limit"), before: url.searchParams.get("before") })
  const last = await env.DB.prepare("SELECT MAX(last_ok) AS t FROM feed_sources").first().catch(() => null)
  // a short shared cache: everyone sees the same feed, and it changes every few hours
  return json(200, { items, updatedAt: Number(last?.t) || 0 }, { "cache-control": "public, max-age=120" })
}
