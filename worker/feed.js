// The live industry feed. Every few hours (worker/index.js → scheduled) the Worker reads a handful of public
// sources (official accident reports and guidance, plus maritime news feeds), keeps what's new, and asks Claude
// which items matter to a tanker crew facing a SIRE 2.0 inspection. For those it writes a short takeaway in its
// own words and one thing to check on board, tagged by role and topic. Readers always get the source's link.
//
//   GET /api/feed?limit=30&before=<ms>   the latest items worth reading (public: the home page shows a few)
//
// Nothing is copied from an article beyond its headline and link; the excerpt is only used to brief the AI.
import { DAY, TOPICS, claudeJson, cleanTopics, ensureLiveSchema, json, plain, sha256hex } from "./live.js"

// `urls` are tried in order; `home` is a page whose <link rel="alternate"> points to its feed, for sites whose
// feed address isn't fixed. The address that worked is remembered (app_keys "feed_url:<id>").
export const SOURCES = [
  { id: "maib", name: "UK MAIB", kind: "govuk", official: true, urls: ["https://www.gov.uk/api/search.json?filter_content_store_document_type=maib_report&order=-public_timestamp&count=15"] },
  { id: "mca", name: "UK MCA", kind: "govuk", official: true, urls: ["https://www.gov.uk/api/search.json?filter_organisations=maritime-and-coastguard-agency&filter_format=guidance&filter_format=statutory_guidance&order=-public_timestamp&count=15"] },
  { id: "uscg", name: "US Coast Guard", kind: "rss", official: true, urls: [], home: "https://www.news.uscg.mil/maritime-commons/" },
  { id: "parismou", name: "Paris MoU", kind: "rss", official: true, urls: ["https://parismou.org/rss.xml"], home: "https://parismou.org/" },
  { id: "amsa", name: "AMSA (Australia)", kind: "rss", official: true, urls: ["https://www.amsa.gov.au/rss.xml"], home: "https://www.amsa.gov.au/news-community/news-and-media-releases" },
  { id: "ocimf", name: "OCIMF", kind: "rss", urls: [], home: "https://www.ocimf.org/news" },
  { id: "chirp", name: "CHIRP Maritime", kind: "rss", urls: ["https://chirp.co.uk/feed/"], home: "https://chirp.co.uk/maritime/" },
  { id: "britannia", name: "Britannia P&I", kind: "rss", urls: ["https://britanniapandi.com/feed/"], home: "https://britanniapandi.com/" },
  { id: "ukpandi", name: "UK P&I Club", kind: "rss", urls: [], home: "https://www.ukpandi.com/news-and-resources/" },
  { id: "gard", name: "Gard", kind: "rss", urls: [], home: "https://www.gard.no/insights/" },
  { id: "northstandard", name: "NorthStandard", kind: "rss", urls: [], home: "https://north-standard.com/insights-and-resources" },
  { id: "steamship", name: "Steamship Mutual", kind: "rss", urls: [], home: "https://www.steamshipmutual.com/" },
  { id: "safety4sea", name: "SAFETY4SEA", kind: "rss", urls: ["https://safety4sea.com/feed/"] },
  { id: "splash", name: "Splash247", kind: "rss", urls: ["https://splash247.com/feed/"] },
  { id: "gcaptain", name: "gCaptain", kind: "rss", urls: ["https://gcaptain.com/feed/"] },
  { id: "marineinsight", name: "Marine Insight", kind: "rss", urls: ["https://www.marineinsight.com/feed/"] },
  { id: "maritimeexecutive", name: "The Maritime Executive", kind: "rss", urls: ["https://maritime-executive.com/articles.rss"], home: "https://maritime-executive.com/" },
  { id: "hellenic", name: "Hellenic Shipping News", kind: "rss", urls: ["https://www.hellenicshippingnews.com/feed/"] },
]
const SOURCE = new Map(SOURCES.map((s) => [s.id, s]))
export const KINDS = ["detention", "alert", "accident", "rule", "sire", "industry"]
const KEEP_DAYS = 14 // older items aren't news any more
const AI_PER_RUN = 16
const AI_BATCH = 8
const RELEVANT = 55
export const PER_RUN = 4 // sources read per run (each run stays well inside Cloudflare's per-run limits)
export const REFRESH_MS = 165 * 60000 // a source that worked is read again after this
export const RETRY_MS = 12 * 3600000 // one that failed, after this

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

const UA = "NilObs/1.0 (+https://nilobs.com)"
async function get(url, accept, fetchImpl) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 12000)
  try {
    const res = await fetchImpl(url, { headers: { "user-agent": UA, accept }, signal: ctl.signal, redirect: "follow" })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res
  } finally {
    clearTimeout(timer)
  }
}
/** The feed addresses a web page advertises (<link rel="alternate" type="application/rss+xml" href="...">). */
export function discoverFeeds(html, base) {
  const out = []
  for (const m of String(html).matchAll(/<link\b[^>]*>/gi)) {
    const t = m[0]
    if (!/rel=["']?alternate/i.test(t) || !/type=["']?application\/(rss|atom)\+xml/i.test(t)) continue
    const h = t.match(/href=["']([^"']+)["']/i)
    if (!h) continue
    try {
      out.push(new URL(h[1].replace(/&amp;/g, "&"), base).toString())
    } catch {
      /* not a usable address */
    }
  }
  return out.filter((u, i) => /^https?:/.test(u) && !/comments|\/comment/i.test(u) && out.indexOf(u) === i)
}
async function readUrl(src, url, fetchImpl) {
  const res = await get(url, src.kind === "govuk" ? "application/json" : "application/rss+xml, application/atom+xml, application/xml, text/xml", fetchImpl)
  const items = src.kind === "govuk" ? parseGovUk(await res.json()) : parseFeed(await res.text())
  if (!items.length) throw new Error("no items found")
  return items
}
/** Read a source: the address that worked last time, then its listed ones, then whatever its home page points to. */
async function readSource(src, fetchImpl, known = "") {
  const tried = new Set()
  let last = null
  const attempt = async (url) => {
    if (!url || tried.has(url) || tried.size >= 4) return null
    tried.add(url)
    try {
      return { items: await readUrl(src, url, fetchImpl), url }
    } catch (e) {
      last = e
      return null
    }
  }
  for (const u of [known, ...(src.urls || [])]) {
    const r = await attempt(u)
    if (r) return r
  }
  if (src.home && tried.size < 4) {
    try {
      const page = await get(src.home, "text/html", fetchImpl)
      for (const u of discoverFeeds(await page.text(), page.url || src.home).slice(0, 2)) {
        const r = await attempt(u)
        if (r) return r
      }
      if (!last) last = new Error("no feed found on the page")
    } catch (e) {
      last = e
    }
  }
  throw last || new Error("no feed address")
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
  const report = await fetchSources(env, now, fetchImpl)
  Object.assign(report, await readNew(env, now, fetchImpl))
  return report
}

/** Sources due for a read: never read, or read longer ago than REFRESH_MS (RETRY_MS after a failure). Oldest first. */
export function dueSources(rows, now = Date.now()) {
  const by = new Map((rows || []).map((r) => [r.id, r]))
  return SOURCES.map((src) => ({ src, row: by.get(src.id) }))
    .filter(({ row }) => !row || !row.last_run || now - row.last_run > (row.last_error ? RETRY_MS : REFRESH_MS))
    .sort((a, b) => (a.row?.last_run || 0) - (b.row?.last_run || 0))
    .map(({ src }) => src)
}

/** Read the sources that are due (up to PER_RUN) and store what's new (no AI). */
export async function fetchSources(env, now = Date.now(), fetchImpl = fetch) {
  await ensureLiveSchema(env.DB)
  const db = env.DB
  const report = { sources: {}, added: 0 }
  const rows = (await db.prepare("SELECT * FROM feed_sources").all()).results || []
  const due = dueSources(rows, now).slice(0, PER_RUN)
  if (!due.length) return report
  const keys = (await db.prepare(`SELECT k, v FROM app_keys WHERE k IN (${due.map(() => "?").join(",")})`).bind(...due.map((s) => `feed_url:${s.id}`)).all()).results || []
  const known = new Map(keys.map((k) => [k.k.slice(9), k.v]))
  const health = []
  const writes = []
  // One batch at the end: new items as multi-row inserts, the health of each source, the addresses that worked
  for (const src of due) {
    try {
      const { items, url } = await readSource(src, fetchImpl, known.get(src.id) || "")
      const fresh = []
      for (const it of items) {
        const at = it.at || now
        if (at < now - KEEP_DAYS * DAY || at > now + DAY) continue
        fresh.push([(await sha256hex(it.url)).slice(0, 24), src.id, it.url, it.title, it.excerpt || "", at, now])
      }
      for (let i = 0; i < fresh.length; i += 12) {
        const chunk = fresh.slice(i, i + 12) // D1 allows 100 bound values per query
        writes.push(db.prepare(`INSERT OR IGNORE INTO feed_items (id, source, url, title, excerpt, published_at, fetched_at, status) VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, 'new')").join(", ")}`).bind(...chunk.flat()))
      }
      if (url !== known.get(src.id)) writes.push(db.prepare("INSERT INTO app_keys (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v").bind(`feed_url:${src.id}`, url))
      report.sources[src.id] = { ok: true, found: items.length, recent: fresh.length }
      health.push([src.id, now, now, null, items.length])
    } catch (e) {
      const msg = String(e?.name === "AbortError" ? "timed out" : e?.message || e).slice(0, 200)
      report.sources[src.id] = { ok: false, error: msg }
      health.push([src.id, now, null, msg, 0])
    }
  }
  if (health.length)
    writes.push(db.prepare(`INSERT INTO feed_sources (id, last_run, last_ok, last_error, items) VALUES ${health.map(() => "(?, ?, ?, ?, ?)").join(", ")} ON CONFLICT (id) DO UPDATE SET last_run = excluded.last_run, last_ok = COALESCE(excluded.last_ok, feed_sources.last_ok), last_error = excluded.last_error, items = CASE WHEN excluded.last_ok IS NULL THEN feed_sources.items ELSE excluded.items END`)
      .bind(...health.flat()))
  const before = Number((await db.prepare("SELECT COUNT(*) AS n FROM feed_items").first())?.n) || 0
  if (writes.length) await db.batch(writes)
  const after = Number((await db.prepare("SELECT COUNT(*) AS n FROM feed_items").first())?.n) || 0
  report.added = Math.max(0, after - before)
  return report
}

/**
 * The AI reads the newest unread items. Claude's API turns away some of the data centres scheduled jobs run in,
 * so this also runs in the background after an ordinary visit (readNewIfDue), which is served near the reader.
 */
export async function readNew(env, now = Date.now(), fetchImpl = fetch) {
  await ensureLiveSchema(env.DB)
  const db = env.DB
  const report = { read: 0, live: 0 }
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

/** Unread items waiting? Let one visit (at a time, every few minutes) have the AI read them in the background. */
export async function readNewIfDue(env, ctx, now = Date.now(), fetchImpl = fetch) {
  const waiting = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM feed_items WHERE status = 'new'").first())?.n) || 0
  if (!waiting || !env.ANTHROPIC_API_KEY || !ctx?.waitUntil) return waiting
  await env.DB.prepare("INSERT OR IGNORE INTO app_keys (k, v) VALUES ('feed_ai', '0')").run()
  const lock = await env.DB.prepare("UPDATE app_keys SET v = ? WHERE k = 'feed_ai' AND CAST(v AS INTEGER) < ?").bind(String(now), now - 3 * 60000).run()
  if (lock?.meta?.changes) ctx.waitUntil(readNew(env, now, fetchImpl).catch((e) => console.error("feed read", e?.message || e)))
  return waiting
}

export async function handleFeed(request, env, ctx) {
  if (request.method !== "GET") return json(405, { error: "Use GET" })
  if (!env.DB) return json(200, { items: [], updatedAt: 0, pending: 0 })
  const url = new URL(request.url)
  await ensureLiveSchema(env.DB)
  const pending = await readNewIfDue(env, ctx).catch(() => 0)
  const items = await latestFeed(env.DB, { limit: url.searchParams.get("limit"), before: url.searchParams.get("before") })
  const last = await env.DB.prepare("SELECT MAX(last_ok) AS t FROM feed_sources").first().catch(() => null)
  // a short cache: everyone sees the same feed, and it changes every few hours
  return json(200, { items, updatedAt: Number(last?.t) || 0, pending }, { "cache-control": "public, max-age=60" })
}
