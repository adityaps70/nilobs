// The account's wallet lives here, on the server. The browser only ever gets a copy to show.
//
// Every change goes through this file, with the same rules the app uses (app/src/economy.ts):
//  - Spending: POST /api/wallet/spend { item, ref } charges the item's price. For AI items it issues a
//    "ticket" (id = ref) that /api/ai and /api/voice require; a ticket pays for a set number of answers,
//    on set models, with a size limit, and expires.
//  - Refunds: POST /api/wallet/refund { ticket } only while nothing has been delivered for it. A charge
//    held for an AI answer that never arrives is refunded automatically after 10 minutes.
//  - Earning: POST /api/wallet/earn { kind, key } pays a fixed amount once per badge, level, streak
//    milestone and day's chest; shared debriefs follow the daily and monthly limits.
//  - Buying: worker/pay.js, after Razorpay confirms a payment (or /api/wallet/buy when
//    NILOBS_SIMULATED_CHECKOUT is "1", for demos).
// Each user's wallet is one D1 row with a version number; concurrent changes retry on the latest copy.
import * as E from "../app/src/economy.ts"
import { reply } from "./guard.js"
import { seatFor } from "./crews.js"

export class HttpError extends Error {
  constructor(status, message, code, extra) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}
export const errorReply = (e) =>
  e instanceof HttpError ? reply(e.status, { error: e.message, code: e.code, ...(e.extra || {}) }) : reply(500, { error: "Something went wrong" })

const REF = /^[A-Za-z0-9_-]{8,40}$/
const MAX_TICKETS = 80
const DAY = 86400000

let ready = null
export function ensureWalletSchema(db) {
  ready ??= db
    .batch([
      db.prepare("CREATE TABLE IF NOT EXISTS wallets (user_id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
      db.prepare("CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL, ref TEXT, product TEXT NOT NULL, currency TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL, payment_ref TEXT, created_at INTEGER NOT NULL, paid_at INTEGER)"),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS payments_ref ON payments (provider, ref)"),
      db.prepare("CREATE INDEX IF NOT EXISTS payments_user ON payments (user_id)"),
      // one-way codes of Google accounts that have had their free starting credits (kept after deletion)
      db.prepare("CREATE TABLE IF NOT EXISTS starts (key TEXT PRIMARY KEY, at INTEGER NOT NULL)"),
    ])
    .catch((e) => {
      ready = null
      throw e
    })
  return ready
}
export const resetWalletSchemaFlag = () => (ready = null)

/* ---------------- storage ---------------- */
function normalize(raw, now) {
  const d = raw && typeof raw === "object" ? raw : {}
  // no page id here: only holds older than 10 minutes are refunded by tick
  const w = E.tick(E.migrate(d.w ?? null, now), now)
  const refunded = new Set(w.ledger.filter((e) => e.refunded).map((e) => e.id))
  const tickets = (Array.isArray(d.tickets) ? d.tickets : [])
    .filter((t) => t && typeof t.id === "string" && t.exp > now - 2 * DAY)
    .map((t) => (t.entry && refunded.has(t.entry) ? { ...t, refunded: true } : t))
    .slice(-MAX_TICKETS)
  const today = E.dayOf(now)
  const claims = (Array.isArray(d.claims) ? d.claims : []).filter((c) => typeof c === "string" && (!c.startsWith("chest:") || c.slice(6) >= E.dayOf(now - 7 * DAY) || c.slice(6) > today))
  return { w, tickets, claims }
}

/** A one-way code for a Google account, so a deleted account can't collect the starting credits again. */
export async function startKey(googleSub) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`nilobs-start:${googleSub}`))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
}
/** A new wallet: the welcome and free credits, unless this Google account had them before (and deleted it). */
async function firstWallet(env, userId, now) {
  const w = E.fresh(now)
  try {
    const u = await env.DB.prepare("SELECT google_sub FROM users WHERE id = ?").bind(userId).first()
    const seen = u?.google_sub ? await env.DB.prepare("SELECT at FROM starts WHERE key = ?").bind(await startKey(u.google_sub)).first() : null
    if (seen) {
      w.buckets = []
      w.ledger = []
    }
  } catch (e) {
    console.error("first wallet", e?.message || e)
  }
  return w
}

async function load(env, userId, now) {
  const row = await env.DB.prepare("SELECT version, data FROM wallets WHERE user_id = ?").bind(userId).first()
  if (!row) return { version: 0, data: withSeat(await seatOf(env, userId, now), { w: await firstWallet(env, userId, now), tickets: [], claims: [] }, now), stored: "" }
  let parsed = null
  try {
    parsed = JSON.parse(row.data)
  } catch {
    /* a damaged row starts again from what migrate can recover */
  }
  return { version: row.version, data: withSeat(await seatOf(env, userId, now), normalize(parsed, now), now), stored: row.data }
}
/** A fleet seat the company pays for (worker/crews.js): Watchkeeper to the end of the fleet's paid period. */
async function seatOf(env, userId, now) {
  try {
    return await seatFor(env.DB, userId, now)
  } catch (e) {
    console.error("seat", e?.message || e)
    return null
  }
}
function withSeat(seat, data, now) {
  if (!seat || !(seat.until > now) || seat.until <= (E.paidUntil(data.w) ?? 0)) return data
  const r = E.grantSeat(data.w, seat.until, `Fleet seat from ${String(seat.name || "your company").slice(0, 40)}`, now)
  if (r.ok) data.w = r.state
  return data
}

async function save(env, userId, version, data, now) {
  const json = JSON.stringify(data)
  const res =
    version === 0
      ? await env.DB.prepare("INSERT INTO wallets (user_id, version, data, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT (user_id) DO NOTHING").bind(userId, json, now).run()
      : await env.DB.prepare("UPDATE wallets SET version = version + 1, data = ?, updated_at = ? WHERE user_id = ? AND version = ?").bind(json, now, userId, version).run()
  return res?.meta?.changes === 1
}

/** Read the wallet (saving it only if expiry, refills or stuck holds changed it). */
export async function readWallet(env, userId) {
  await ensureWalletSchema(env.DB)
  for (let i = 0; i < 4; i++) {
    const now = Date.now()
    const { version, data, stored } = await load(env, userId, now)
    if (stored && JSON.stringify(data) === stored) return { data, version }
    if (await save(env, userId, version, data, now)) return { data, version: version + 1 }
  }
  throw new HttpError(503, "Busy. Try again.", "busy")
}

/** Change the wallet with fn(data, now). Retries on the newest copy if another request saved first. */
export async function mutate(env, userId, fn) {
  await ensureWalletSchema(env.DB)
  for (let i = 0; i < 6; i++) {
    const now = Date.now()
    const { version, data } = await load(env, userId, now)
    const result = fn(data, now) // may throw HttpError
    if (await save(env, userId, version, data, now)) return { result, data, version: version + 1 }
  }
  throw new HttpError(503, "Busy. Try again.", "busy")
}

/** How each currency can be paid: through Razorpay (once its keys are set), a test switch, or not yet. */
export function checkoutModes(env) {
  const sim = env.NILOBS_SIMULATED_CHECKOUT === "1"
  const razorpay = !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)
  const currencies = String(env.RAZORPAY_CURRENCIES || "INR").toUpperCase().split(",").map((c) => c.trim())
  const mode = (cur) => (razorpay && currencies.includes(cur) ? "razorpay" : sim ? "simulated" : null)
  return { INR: mode("INR"), USD: mode("USD") }
}
/** What the browser gets: the wallet, its perks and the open tickets. */
export function view(env, data, version) {
  const now = Date.now()
  return {
    wallet: data.w,
    version,
    perks: E.perks(data.w, now),
    claims: data.claims,
    tickets: data.tickets.filter((t) => !t.refunded && t.exp > now).map((t) => ({ id: t.id, kind: t.item.kind, calls: t.calls, used: t.used, delivered: t.delivered, exp: t.exp })),
    checkout: checkoutModes(env),
  }
}

/* ---------------- spending ---------------- */
function parseItem(raw) {
  const kind = String(raw?.kind || "")
  if (!(kind in E.ITEMS)) throw new HttpError(400, "Unknown item", "bad_item")
  const item = { kind }
  if (raw.n != null) item.n = Math.round(Number(raw.n))
  if (raw.id != null) item.id = typeof raw.id === "number" ? raw.id : String(raw.id).slice(0, 40)
  return item
}

/** A short line from the app for the history ("Pump room · 2 photos"), shown only to this user. */
const cleanNote = (s) => String(s || "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)

export function spendIn(data, now, rawItem, ref, rawNote) {
  const item = parseItem(rawItem)
  if (!REF.test(String(ref || ""))) throw new HttpError(400, "Missing or bad ref", "bad_ref")
  // the same ref twice (a retry) returns the first result instead of charging again
  const again = data.tickets.find((t) => t.id === ref)
  if (again) return { ticket: again, repeat: true }
  const rule = E.ITEMS[item.kind]
  const perks = E.perks(data.w, now)
  if (item.kind === "story" && data.w.unlocked.includes(Number(item.id))) return { unlocked: true }
  if (item.kind === "deck" && data.w.decks.includes(String(item.id))) return { unlocked: true }
  const cost = E.itemCost(item, perks)
  if (cost == null) throw new HttpError(402, item.kind === "askExpert" ? "Expert answers come with the Command plan." : "This can't be bought.", "not_allowed")
  let entry = null
  if (cost > 0) {
    const note = cleanNote(rawNote)
    const r = E.spend(data.w, cost, `${rule.label(item)}${note ? ` · ${note}` : ""}`, now, rule.usage, rule.ai?.hold ? "srv" : undefined)
    data.w = r.state
    if (!r.ok) throw new HttpError(402, `This needs ${cost} credits and you have ${E.balance(data.w, now)}.`, "short", { need: cost, have: E.balance(data.w, now) })
    entry = r.entry
  }
  if (item.kind === "story") data.w.unlocked = [...data.w.unlocked, Number(item.id)]
  if (item.kind === "deck") data.w.decks = [...data.w.decks, String(item.id)]
  let ticket = null
  if (rule.ai) {
    const a = rule.ai
    const tiers = [...a.tiers, ...(a.expertTier && perks.expert ? ["complex"] : [])]
    ticket = {
      id: ref, item, cost, entry, created: now, exp: now + a.hours * 3600000,
      calls: a.calls, used: 0, attempts: 0, maxAttempts: a.calls + 6, delivered: 0,
      voice: a.voice || 0, voiceUsed: 0, tiers, images: a.images ? item.n || 0 : 0, json: a.json || null,
      maxChars: a.maxChars, hold: !!(a.hold && entry), refundable: rule.refundable, refunded: false,
    }
    data.tickets = [...data.tickets, ticket].slice(-MAX_TICKETS)
  } else if (entry) {
    // non-AI purchases leave a record too, so a repeated ref never charges twice
    data.tickets = [...data.tickets, { id: ref, item, cost, entry, created: now, exp: now + DAY, calls: 0, used: 0, attempts: 0, maxAttempts: 0, delivered: 1, voice: 0, voiceUsed: 0, tiers: [], images: 0, json: null, maxChars: 0, hold: false, refundable: false, refunded: false }].slice(-MAX_TICKETS)
  }
  return { ticket, cost }
}

export function refundIn(data, now, ticketId) {
  const t = data.tickets.find((x) => x.id === ticketId)
  if (!t) throw new HttpError(404, "No such charge", "no_ticket")
  if (t.refunded) return { already: true }
  if (!t.refundable) throw new HttpError(409, "This can't be refunded.", "not_refundable")
  // an AI answer delivered ends the refund; for a voice interview, so does more than the first question or two
  // spoken (a listen, which is only voice, ends it with the first line)
  const spoken = t.voiceDelivered || 0
  if (t.delivered > 0 || spoken > (t.calls === 0 ? 0 : 2)) throw new HttpError(409, "The answer was delivered, so this can't be refunded.", "delivered")
  if (t.entry) data.w = E.refund(data.w, t.entry, now, E.ITEMS[t.item.kind].usage)
  t.refunded = true
  return { refunded: t.cost }
}

/* ---------------- earning ---------------- */
const LEVELS = Object.keys(E.EARN.level).map(Number)
const STREAKS = Object.keys(E.EARN.streak).map(Number)
/** One earning claim. Returns the credits granted (0 if already claimed). */
export function earnIn(data, now, kind, rawKey, text, rawLabel) {
  const key = String(rawKey ?? "")
  let amount = 0, label = ""
  if (kind === "badge") {
    if (!E.BADGE_IDS.includes(key)) throw new HttpError(400, "Unknown badge", "bad_claim")
    amount = E.EARN.badge
    label = `Badge: ${key}`
  } else if (kind === "level") {
    if (!LEVELS.includes(Number(key))) throw new HttpError(400, "Unknown level", "bad_claim")
    amount = E.EARN.level[Number(key)]
    label = `Reached level ${key}`
  } else if (kind === "streak") {
    if (!STREAKS.includes(Number(key))) throw new HttpError(400, "Unknown streak", "bad_claim")
    amount = E.EARN.streak[Number(key)]
    label = `${key}-day streak`
  } else if (kind === "chest") {
    // the day as the phone sees it; allow a day either side for time zones
    const ok = [E.dayOf(now - DAY), E.dayOf(now), E.dayOf(now + DAY)].includes(key)
    if (!ok) throw new HttpError(400, "That chest isn't today's", "bad_claim")
    amount = E.EARN.chest
    label = "Daily missions chest"
  } else if (kind === "share") {
    const t = String(text || "").trim()
    if (t.length < 40) throw new HttpError(400, "Write a little more about the inspection first.", "too_short")
    const st = E.shareStatus(data.w, now, t)
    if (!st.ok) throw new HttpError(409, st.why, "share_limit")
    data.w = E.recordShare(data.w, now, t)
    return E.EARN.share
  } else throw new HttpError(400, "Unknown claim", "bad_claim")
  const id = `${kind}:${key}`
  if (data.claims.includes(id)) return 0
  data.claims = [...data.claims, id]
  data.w = E.earn(data.w, amount, cleanNote(rawLabel) || label, now)
  return amount
}

/* ---------------- metering AI and voice calls ---------------- */
/**
 * Ties one /api/ai or /api/voice call to a ticket. begin() checks and books the call; then exactly one of
 * delivered() (the answer reached the user), returned() (it didn't: the call is given back) is called.
 */
export function meter(env, userId, kind) {
  let ticketId = ""
  let info = null
  let settled = false
  const once = (fn) => async () => {
    if (settled || !ticketId) return
    settled = true
    try {
      await mutate(env, userId, (d, now) => fn(d.tickets.find((t) => t.id === ticketId), d, now))
    } catch (e) {
      console.error("meter", e?.message || e)
    }
  }
  return {
    get item() {
      return info?.item?.kind || ""
    },
    get json() {
      return info?.json || false
    },
    async begin(body, call) {
      ticketId = String(body?.ticket || "")
      if (!REF.test(ticketId)) return reply(402, { error: "This needs credits. Try again.", code: "no_ticket" })
      try {
        const { result } = await mutate(env, userId, (d, now) => {
          const t = d.tickets.find((x) => x.id === ticketId)
          if (!t || t.refunded) throw new HttpError(402, "That charge isn't valid any more. Try again.", "bad_ticket")
          if (t.exp < now) throw new HttpError(402, "That charge has expired. Start again.", "expired_ticket")
          if (kind === "voice") {
            if (t.voiceUsed >= t.voice) throw new HttpError(402, "No studio voice left on this charge.", "used_ticket")
            t.voiceUsed += 1
            return { item: t.item, json: false }
          }
          if (t.used >= t.calls) throw new HttpError(402, "This charge has been used. Start a new one.", "used_ticket")
          if (t.attempts >= t.maxAttempts) throw new HttpError(429, "Too many tries on this charge.", "too_many_tries")
          if (!t.tiers.includes(call.tier)) throw new HttpError(403, "That model isn't part of this feature.", "bad_tier")
          if (call.images > t.images) throw new HttpError(403, "More photos than were paid for.", "bad_images")
          if (call.chars > t.maxChars) throw new HttpError(413, "Too long for this feature.", "too_long")
          t.used += 1
          t.attempts += 1
          return { item: t.item, json: t.json === "always" || (t.json === "maybe" && !!body?.json) }
        })
        info = result
        return null
      } catch (e) {
        return errorReply(e)
      }
    },
    delivered: once((t, d) => {
      if (!t) return
      if (kind === "voice") t.voiceDelivered = (t.voiceDelivered || 0) + 1
      else t.delivered += 1
      // the answer arrived: a held charge is kept
      if (t.hold && t.entry && !t.settled) {
        d.w = E.settle(d.w, t.entry)
        t.settled = true
      }
    }),
    returned: once((t) => {
      if (!t) return
      if (kind === "voice") t.voiceUsed = Math.max(0, t.voiceUsed - 1)
      else t.used = Math.max(0, t.used - 1)
    }),
  }
}

/* ---------------- routes ---------------- */
export async function handleWallet(request, env, user) {
  const path = new URL(request.url).pathname
  const method = request.method
  try {
    if (path === "/api/wallet" && method === "GET") {
      const { data, version } = await readWallet(env, user.id)
      return reply(200, view(env, data, version))
    }
    if (method !== "POST") return reply(405, { error: "Use POST" })
    let body = {}
    try {
      body = await request.json()
    } catch {
      return reply(400, { error: "Body must be JSON" })
    }
    if (path === "/api/wallet/spend") {
      const { result, data, version } = await mutate(env, user.id, (d, now) => spendIn(d, now, body?.item, body?.ref, body?.note))
      return reply(200, { ...view(env, data, version), ticket: result.ticket ? { id: result.ticket.id, exp: result.ticket.exp } : null, charged: result.cost ?? 0 })
    }
    if (path === "/api/wallet/refund") {
      const { result, data, version } = await mutate(env, user.id, (d, now) => refundIn(d, now, String(body?.ticket || "")))
      return reply(200, { ...view(env, data, version), refunded: result.refunded ?? 0 })
    }
    if (path === "/api/wallet/earn") {
      const { result, data, version } = await mutate(env, user.id, (d, now) => earnIn(d, now, String(body?.kind || ""), body?.key, body?.text, body?.label))
      return reply(200, { ...view(env, data, version), granted: result })
    }
    if (path === "/api/wallet/claims") {
      // catch up after signing in: badges, levels and streak milestones already reached on this device
      const badges = (Array.isArray(body?.badges) ? body.badges : []).map(String).slice(0, 40)
      const level = Math.max(0, Math.min(10, Math.round(Number(body?.level) || 0)))
      const best = Math.max(0, Math.round(Number(body?.streakBest) || 0))
      const { result, data, version } = await mutate(env, user.id, (d, now) => {
        let n = 0
        for (const b of badges) if (E.BADGE_IDS.includes(b)) n += earnIn(d, now, "badge", b)
        for (const L of LEVELS) if (L <= level) n += earnIn(d, now, "level", L)
        for (const s of STREAKS) if (s <= best) n += earnIn(d, now, "streak", s)
        return n
      })
      return reply(200, { ...view(env, data, version), granted: result })
    }
    if (path === "/api/wallet/buy") {
      if (env.NILOBS_SIMULATED_CHECKOUT !== "1") return reply(403, { error: "Buying needs a real payment.", code: "payments_required" })
      const cur = body?.currency === "USD" ? "USD" : "INR"
      const { data, version } = await mutate(env, user.id, (d, now) => {
        const r = E.grantPurchase(d.w, String(body?.product || ""), cur, now, "simulated, no charge")
        if (!r.ok) throw new HttpError(409, r.why, "cannot_buy")
        d.w = r.state
      })
      return reply(200, view(env, data, version))
    }
    return reply(404, { error: "Not found" })
  } catch (e) {
    return errorReply(e)
  }
}
