// The owner's analytics: who signed up, who comes back, what they use and what they paid.
//
// Only for the Google accounts listed in the ADMIN_EMAILS secret (comma-separated, set in Cloudflare). Everyone else,
// signed in or not, gets the same plain "not found" as any page that doesn't exist, so the address gives nothing away.
// It reads the tables the app already keeps (users, user_state, wallets, payments, starts, and the live features'
// feed_sources, push_subs, debriefs). The one thing it changes is whether a shared debrief shows in the pulse.
// It never returns what people typed, asked or photographed (chats, answers, briefs and drafts stay out); for
// shared debriefs it shows only the de-identified version others see.
import { ensureSchema, getSession } from "./auth.js"
import { ensureWalletSchema } from "./wallet.js"
import { limited, originAllowed, reply } from "./guard.js"
import { ensureLiveSchema } from "./live.js"
import { SOURCES } from "./feed.js"
import { ROLES, ROLE_GROUPS } from "../app/src/roles.ts"
import ADMIN_PAGE from "./admin-page.js"

const DAY = 86400000
const MAX_ROWS = 20000
const LIST_MAX = 2000

export const adminEmails = (env) =>
  String(env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

/** The signed-in admin, or null (not signed in, not on the list, or no list at all). */
export async function adminUser(request, env) {
  const list = adminEmails(env)
  if (!list.length) return null
  const s = await getSession(request, env)
  const email = String(s?.user?.email || "").toLowerCase()
  return s && email && list.includes(email) ? s.user : null
}

const SECURE_HEADERS = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
}
const PAGE_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

/** /admin and /api/admin/*. Returns null for anything else. */
export async function handleAdmin(request, env) {
  const url = new URL(request.url)
  const isPage = url.pathname === "/admin" || url.pathname === "/admin/"
  const isApi = url.pathname.startsWith("/api/admin/")
  if (!isPage && !isApi) return null
  // exactly what any address that doesn't exist gets
  const notFound = () => (isApi ? reply(404, { error: "Not found" }) : env.ASSETS.fetch(request))
  const isHide = url.pathname === "/api/admin/pulse"
  if (!env.DB || (request.method !== "GET" && !(isHide && request.method === "POST"))) return notFound()
  if (request.method === "POST" && !originAllowed(request, env)) return notFound()
  if (await limited(request, env, { name: "admin", binding: null, perMinute: Number(env.NILOBS_ADMIN_PER_MINUTE || 30) })) return notFound()
  const admin = await adminUser(request, env)
  if (!admin) return notFound()
  if (isPage) return new Response(ADMIN_PAGE, { headers: { ...SECURE_HEADERS, "content-type": "text/html; charset=utf-8", "content-security-policy": PAGE_CSP } })
  if (url.pathname === "/api/admin/stats") {
    const stats = await computeStats(env.DB, Date.now())
    return new Response(JSON.stringify({ ...stats, admin: { email: admin.email, name: admin.name } }), { headers: { ...SECURE_HEADERS, "content-type": "application/json" } })
  }
  if (isHide) {
    // hide a shared debrief from the pulse, or show it again
    let body = {}
    try {
      body = await request.json()
    } catch {
      return reply(400, { error: "Body must be JSON" })
    }
    const to = body?.hidden ? "hidden" : "live"
    const r = await env.DB.prepare("UPDATE debriefs SET status = ? WHERE id = ? AND status IN ('live', 'hidden') AND pub IS NOT NULL").bind(to, String(body?.id || "")).run()
    return reply(r?.meta?.changes ? 200 : 404, { ok: !!r?.meta?.changes, status: to })
  }
  return notFound()
}

/* ---------------- the numbers ---------------- */
const parse = (s) => {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {})
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0)
export const utcDay = (t) => new Date(t).toISOString().slice(0, 10)
const lastDays = (now, n) => Array.from({ length: n }, (_, i) => utcDay(now - (n - 1 - i) * DAY))
const caps = (s) => (s.match(/[A-Z]/g) || []).length
const roleById = new Map(ROLES.map((r) => [r.id, r]))
const groupName = new Map(ROLE_GROUPS.map((g) => [g.id, g.name]))

/** Which feature a wallet entry paid for, from its label ("Ask NilObs (deep)" → "Ask NilObs"). */
export function featureOf(label) {
  const l = String(label || "").replace(/^Refund: /, "")
  if (/^Ask NilObs/.test(l)) return "Ask NilObs"
  if (/^AI inspector \(voice\)/.test(l)) return "AI inspector (voice)"
  if (/^AI inspector/.test(l)) return "AI inspector"
  if (/^Mock interview/.test(l)) return "Mock interview"
  if (/^Explain an observation/.test(l)) return "Explain an observation"
  if (/^Photo check/.test(l)) return "Photo check"
  if (/^Inspection brief/.test(l)) return "Inspection brief"
  if (/^A new prep plan/.test(l)) return "Prep plan"
  if (/^Role pack/.test(l)) return "Role pack"
  if (/^Listen to an answer/.test(l)) return "Listen (voice)"
  if (/^Unlocked an inspection story/.test(l)) return "Stories"
  if (/^Unlocked deck/.test(l)) return "Card decks"
  if (/^Streak freeze/.test(l)) return "Streak freeze"
  return "Other"
}
const AI_FEATURES = new Set(["Ask NilObs", "AI inspector", "AI inspector (voice)", "Explain an observation", "Photo check", "Inspection brief", "Prep plan", "Role pack", "Listen (voice)"])

function walletFacts(raw, now) {
  const w = obj(obj(raw).w)
  const buckets = Array.isArray(w.buckets) ? w.buckets : []
  const balance = buckets.reduce((s, b) => s + (num(b?.left) > 0 && (b.expires == null || num(b.expires) > now) ? num(b.left) : 0), 0)
  const plan = obj(w.plan)
  const planId = typeof plan.id === "string" ? plan.id : "free"
  const paidUntil = plan.cancelAt == null ? null : num(plan.cancelAt)
  const pass = w.pass && num(w.pass.until) > now
  const ledger = (Array.isArray(w.ledger) ? w.ledger : []).filter((e) => e && typeof e === "object")
  return { balance, planId: planId !== "free" && paidUntil != null && paidUntil < now ? "free" : planId, pass, ledger }
}

/** Everything the dashboard shows, from the tables as they are now. */
export async function computeStats(db, now = Date.now()) {
  await ensureSchema(db)
  await ensureWalletSchema(db)
  await ensureLiveSchema(db)
  const all = async (sql) => (await db.prepare(sql).all()).results || []
  const [users, states, wallets, payments, startsRow] = await Promise.all([
    all(`SELECT id, email, name, created_at, last_seen FROM users ORDER BY created_at DESC LIMIT ${MAX_ROWS}`),
    all(`SELECT user_id, data, updated_at FROM user_state LIMIT ${MAX_ROWS}`),
    all(`SELECT user_id, data, updated_at FROM wallets LIMIT ${MAX_ROWS}`),
    all(`SELECT id, user_id, provider, product, currency, amount, status, created_at, paid_at FROM payments ORDER BY created_at DESC LIMIT ${MAX_ROWS}`),
    db.prepare("SELECT COUNT(*) AS n FROM starts").first(),
  ])
  const stateOf = new Map(states.map((r) => [r.user_id, r]))
  const walletOf = new Map(wallets.map((r) => [r.user_id, r]))
  const userOf = new Map(users.map((u) => [u.id, u]))

  const days30 = lastDays(now, 30)
  const in30 = new Set(days30)
  const signups = Object.fromEntries(days30.map((d) => [d, 0]))
  const activeSets = Object.fromEntries(days30.map((d) => [d, new Set()]))
  const spentByDay = Object.fromEntries(days30.map((d) => [d, 0]))
  const features = new Map() // name → { uses, credits, uses30, credits30, users:Set }
  const roleCount = new Map()
  const groupCount = new Map()
  const shipCount = new Map()
  const companyCount = new Map()
  const planCount = new Map()
  let balanceTotal = 0
  let passes = 0
  let withRole = 0
  let usedAi = 0
  const list = []

  for (const u of users) {
    const st = stateOf.get(u.id)
    const data = obj(st ? parse(st.data) : null)
    const extras = obj(data.extras)
    const profile = obj(obj(extras["sr.profile"]).v)
    const progress = obj(data.progress)
    const wRow = walletOf.get(u.id)
    const wf = walletFacts(wRow ? parse(wRow.data) : null, now)

    // who they are
    const rank = typeof profile.rank === "string" ? profile.rank : ""
    const role = roleById.get(rank)
    const roleName = rank === "Other" ? String(profile.roleName || "").trim() || "Other" : role?.name || (rank ? rank : "")
    const group = role && rank !== "Other" ? groupName.get(role.group) || role.group : ""
    const side = !rank ? "" : rank === "Other" || !role ? "other" : role.group === "shore" ? "shore" : "board"
    if (rank) {
      withRole++
      roleCount.set(roleName, (roleCount.get(roleName) || 0) + 1)
      const g = side === "other" ? "Other" : side === "shore" ? "Ashore" : "On board"
      groupCount.set(g, (groupCount.get(g) || 0) + 1)
    }
    const ship = typeof profile.ship === "string" ? profile.ship : ""
    if (ship) shipCount.set(ship, (shipCount.get(ship) || 0) + 1)
    const company = typeof profile.company === "string" ? profile.company.trim() : ""
    if (company) {
      const k = company.toLowerCase()
      const c = companyCount.get(k) || { spellings: new Map(), n: 0 }
      c.n++
      c.spellings.set(company, (c.spellings.get(company) || 0) + 1)
      companyCount.set(k, c)
    }

    // when they were here
    const created = num(u.created_at)
    const cd = utcDay(created)
    if (cd in signups) signups[cd]++
    const progressDays = Object.entries(obj(progress.days)).filter(([, v]) => num(v) > 0).map(([d]) => d)
    for (const d of progressDays) if (in30.has(d)) activeSets[d].add(u.id)
    let lastActive = Math.max(num(u.last_seen), num(st?.updated_at), num(wRow?.updated_at), created)

    // what they spent credits on (refunds take the charge back)
    let spent = 0
    let aiUses = 0
    for (const e of wf.ledger) {
      const at = num(e.at)
      const delta = num(e.delta)
      if (e.kind !== "spend" && e.kind !== "refund") continue
      const f = featureOf(e.label)
      const row = features.get(f) || { uses: 0, credits: 0, uses30: 0, credits30: 0, users: new Set() }
      const sign = e.kind === "refund" ? -1 : 1
      const d = utcDay(at)
      row.uses += sign
      row.credits += -delta
      if (in30.has(d)) {
        row.uses30 += sign
        row.credits30 += -delta
        spentByDay[d] += -delta
      }
      if (sign > 0) row.users.add(u.id)
      features.set(f, row)
      spent += -delta
      if (AI_FEATURES.has(f)) aiUses += sign
      if (sign > 0 && in30.has(d)) activeSets[d].add(u.id)
      lastActive = Math.max(lastActive, at)
    }
    if (aiUses > 0) usedAi++
    planCount.set(wf.planId, (planCount.get(wf.planId) || 0) + 1)
    if (wf.pass) passes++
    balanceTotal += wf.balance

    const stats = obj(progress.stats)
    list.push({
      id: u.id,
      name: String(u.name || ""),
      email: String(u.email || ""),
      role: roleName,
      group,
      side,
      ship,
      company,
      created,
      lastActive,
      xp: num(progress.xp),
      streak: num(obj(progress.streak).n),
      bestStreak: num(obj(progress.streak).best),
      activeDays: progressDays.length,
      cards: num(stats.cards),
      spot: num(stats.spot),
      stories: num(stats.stories),
      interviews: num(stats.interviews),
      drillDay: String(obj(progress.drill).day || ""),
      drills: num(obj(progress.drill).done),
      plan: wf.planId,
      balance: wf.balance,
      spent,
      aiUses: Math.max(0, aiUses),
      paid: {},
      payments: 0,
    })
  }

  // payments
  const byUser = new Map(list.map((x) => [x.id, x]))
  const revenue = {}
  const revenue30 = {}
  const revenueByDay = Object.fromEntries(days30.map((d) => [d, {}]))
  const products = new Map()
  let paidCount = 0
  const payers = new Set()
  for (const p of payments) {
    if (p.status !== "paid") continue
    paidCount++
    payers.add(p.user_id)
    const major = num(p.amount) / 100
    revenue[p.currency] = (revenue[p.currency] || 0) + major
    const d = utcDay(num(p.paid_at) || num(p.created_at))
    if (in30.has(d)) {
      revenue30[p.currency] = (revenue30[p.currency] || 0) + major
      revenueByDay[d][p.currency] = (revenueByDay[d][p.currency] || 0) + major
    }
    const kind = String(p.product).split(":")[0].split("@")[0]
    const pr = products.get(kind) || { n: 0, revenue: {} }
    pr.n++
    pr.revenue[p.currency] = (pr.revenue[p.currency] || 0) + major
    products.set(kind, pr)
    const x = byUser.get(p.user_id)
    if (x) {
      x.paid[p.currency] = (x.paid[p.currency] || 0) + major
      x.payments++
    }
  }
  const recentPayments = payments.slice(0, 25).map((p) => ({
    at: num(p.paid_at) || num(p.created_at),
    who: userOf.get(p.user_id)?.email || "(deleted account)",
    product: String(p.product),
    currency: p.currency,
    amount: num(p.amount) / 100,
    status: p.status,
    provider: p.provider,
  }))

  const activeWithin = (ms) => list.filter((x) => x.lastActive >= now - ms).length
  const top = (m, n = 12) => [...m.entries()].map(([name, v]) => ({ name, n: v })).sort((a, b) => b.n - a.n).slice(0, n)
  list.sort((a, b) => b.lastActive - a.lastActive)
  return {
    generatedAt: now,
    truncated: users.length >= MAX_ROWS,
    totals: {
      users: users.length,
      new7: list.filter((x) => x.created >= now - 7 * DAY).length,
      new30: list.filter((x) => x.created >= now - 30 * DAY).length,
      active1: activeWithin(DAY),
      active7: activeWithin(7 * DAY),
      active30: activeWithin(30 * DAY),
      returning7: list.filter((x) => x.created < now - 7 * DAY && x.lastActive >= now - 7 * DAY).length,
      deleted: num(startsRow?.n),
      creditsHeld: balanceTotal,
      creditsSpent30: Object.values(spentByDay).reduce((s, v) => s + v, 0),
      paidCount,
      payers: payers.size,
      passes,
      revenue,
      revenue30,
    },
    funnel: [
      { step: "Signed up", n: users.length },
      { step: "Picked a role", n: withRole },
      { step: "Used the AI", n: usedAi },
      { step: "Paid", n: [...payers].filter((id) => userOf.has(id)).length },
    ],
    series: days30.map((d) => ({ day: d, signups: signups[d], active: activeSets[d].size, credits: spentByDay[d], revenue: revenueByDay[d] })),
    features: [...features.entries()]
      .map(([name, r]) => ({ name, ai: AI_FEATURES.has(name), uses: Math.max(0, r.uses), credits: Math.max(0, r.credits), uses30: Math.max(0, r.uses30), credits30: Math.max(0, r.credits30), users: r.users.size }))
      .filter((f) => f.uses > 0 || f.credits > 0)
      .sort((a, b) => b.credits - a.credits),
    roles: top(roleCount, 15),
    groups: top(groupCount),
    ships: top(shipCount),
    // shown in the spelling most people used (capitals win a tie)
    companies: [...companyCount.values()].sort((a, b) => b.n - a.n).slice(0, 12).map((c) => ({ name: [...c.spellings.entries()].sort((a, b) => b[1] - a[1] || caps(b[0]) - caps(a[0]))[0][0], n: c.n })),
    plans: top(planCount),
    products: [...products.entries()].map(([name, v]) => ({ name, n: v.n, revenue: v.revenue })).sort((a, b) => b.n - a.n),
    recentPayments,
    users: list.slice(0, LIST_MAX),
    live: await liveStats(db, now, list),
  }
}

/* ---------------- the live features ---------------- */
async function liveStats(db, now, list) {
  const all = async (sql, ...args) => (await db.prepare(sql).bind(...args).all()).results || []
  const one = async (sql, ...args) => (await db.prepare(sql).bind(...args).first()) || {}
  const src = new Map((await all("SELECT * FROM feed_sources")).map((r) => [r.id, r]))
  const counts = new Map((await all("SELECT source, COUNT(*) AS n FROM feed_items WHERE status = 'live' AND published_at > ? GROUP BY source", now - 7 * DAY)).map((r) => [r.source, r.n]))
  const feed = await one("SELECT SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) AS live, SUM(CASE WHEN status = 'live' AND published_at > ? THEN 1 ELSE 0 END) AS day, SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS waiting FROM feed_items", now - DAY)
  const push = await one("SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS people FROM push_subs")
  const email = new Map(list.map((u) => [u.id, u.email]))
  const deb = await all("SELECT id, user_id, created_at, status, ship, role, pub, topics FROM debriefs ORDER BY created_at DESC LIMIT 30")
  const week = await one("SELECT COUNT(*) AS n FROM debriefs WHERE status = 'live' AND created_at > ?", now - 7 * DAY)
  const today = utcDay(now)
  return {
    sources: SOURCES.map((s) => {
      const r = src.get(s.id) || {}
      return { id: s.id, name: s.name, official: !!s.official, lastRun: Number(r.last_run) || 0, lastOk: Number(r.last_ok) || 0, error: r.last_error || "", found: Number(r.items) || 0, live7: Number(counts.get(s.id)) || 0 }
    }),
    feed: { live: Number(feed.live) || 0, day: Number(feed.day) || 0, waiting: Number(feed.waiting) || 0 },
    reminders: { browsers: Number(push.n) || 0, people: Number(push.people) || 0 },
    drillToday: list.filter((u) => u.drillDay === today).length,
    drillPeople: list.filter((u) => u.drills > 0).length,
    pulse: {
      week: Number(week.n) || 0,
      recent: deb.map((d) => {
        let pub = {}
        try {
          pub = JSON.parse(d.pub || "{}")
        } catch {
          /* shown without details */
        }
        return { id: d.id, at: d.created_at, status: d.status, by: email.get(d.user_id) || "(deleted account)", role: d.role || "", ship: d.ship || "", summary: pub.summary || "", reason: pub.reason || "", questions: (pub.questions || []).length }
      }),
    },
  }
}
