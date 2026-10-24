// Sign in with Google, sessions and the synced state of each account.
//
// The browser gets a Google ID token from Google's own button (no client secret is involved), posts it
// here, and we check it against Google's public keys. A signed-in browser holds an HttpOnly session
// cookie; the session token itself is only stored hashed. Accounts, sessions and each user's saved
// state live in Cloudflare D1 (binding DB). Without GOOGLE_CLIENT_ID and DB, sign-in is simply off.
//
// Routes (wired in worker/index.js):
//   GET    /api/auth/config   → { google: client id | null }
//   POST   /api/auth/google   { credential } → { user }   (sets the session cookie)
//   POST   /api/auth/logout
//   GET    /api/me            → { user } | 401
//   DELETE /api/me            deletes the account, its sessions, saved state, wallet, reminders and shared
//                             debriefs (payment records are kept for the accounts, without name or email)
//   GET    /api/state         → { version, data }
//   PUT    /api/state         { base, data } → { version } | 409 { version, data }
import { limited, originAllowed, reply } from "./guard.js"
import { ensureWalletSchema, startKey } from "./wallet.js"
import { ensureLiveSchema } from "./live.js"

const GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs"
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"]
const COOKIE = "nilobs_sid"
const SESSION_DAYS = 30
const DAY = 86400000
export const MAX_STATE_CHARS = 600_000

export const authEnabled = (env) => !!(env.GOOGLE_CLIENT_ID && env.DB)

/* ---------------- Google ID tokens ---------------- */
const b64url = (s) => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/")
  return Uint8Array.from(atob(t + "===".slice((t.length + 3) % 4)), (c) => c.charCodeAt(0))
}
const json64 = (s) => JSON.parse(new TextDecoder().decode(b64url(s)))

let certs = { at: 0, keys: [] }
async function googleKeys(fetchImpl, force) {
  if (!force && certs.keys.length && Date.now() - certs.at < 6 * 3600000) return certs.keys
  const res = await fetchImpl(GOOGLE_CERTS)
  if (!res.ok) throw new Error("certs unavailable")
  const j = await res.json()
  certs = { at: Date.now(), keys: Array.isArray(j?.keys) ? j.keys : [] }
  return certs.keys
}
export const resetGoogleKeys = () => (certs = { at: 0, keys: [] })

/** Checks a Google ID token: signature, issuer, audience, expiry. Returns its claims or throws. */
export async function verifyGoogleToken(token, clientId, fetchImpl = fetch, now = Date.now()) {
  const parts = String(token || "").split(".")
  if (parts.length !== 3) throw new Error("malformed")
  const head = json64(parts[0])
  const claims = json64(parts[1])
  if (head.alg !== "RS256" || !head.kid) throw new Error("bad header")
  let keys = await googleKeys(fetchImpl)
  let jwk = keys.find((k) => k.kid === head.kid)
  if (!jwk) {
    keys = await googleKeys(fetchImpl, true) // Google rotates its keys
    jwk = keys.find((k) => k.kid === head.kid)
  }
  if (!jwk) throw new Error("unknown key")
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"])
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]))
  if (!ok) throw new Error("bad signature")
  if (!ISSUERS.includes(claims.iss)) throw new Error("bad issuer")
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!aud.includes(clientId)) throw new Error("wrong audience")
  if (!claims.exp || claims.exp * 1000 < now - 60000) throw new Error("expired")
  if (claims.iat && claims.iat * 1000 > now + 300000) throw new Error("issued in the future")
  if (!claims.sub) throw new Error("no subject")
  if (claims.email && claims.email_verified === false) throw new Error("email not verified")
  return claims
}

/* ---------------- storage ---------------- */
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, google_sub TEXT UNIQUE NOT NULL, email TEXT, name TEXT, picture TEXT, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)",
  "CREATE TABLE IF NOT EXISTS user_state (user_id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL)",
]
let ready = null
/** Creates the tables on first use (cheap: once per Worker instance). migrations/0001_init.sql has the same schema. */
export function ensureSchema(db) {
  ready ??= db.batch(SCHEMA.map((q) => db.prepare(q))).catch((e) => {
    ready = null
    throw e
  })
  return ready
}
export const resetSchemaFlag = () => (ready = null)

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))
const randomToken = () => {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
const publicUser = (u) => ({ id: u.id, email: u.email || "", name: u.name || "", picture: u.picture || "" })

function readCookie(request, name) {
  const all = request.headers.get("cookie") || ""
  for (const part of all.split(";")) {
    const i = part.indexOf("=")
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return ""
}
function cookieHeader(request, value, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : ""
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}
const withCookie = (res, cookie) => {
  const r = new Response(res.body, res)
  r.headers.append("set-cookie", cookie)
  return r
}

/** The signed-in user for this request, or null. */
export async function getSession(request, env, now = Date.now()) {
  if (!authEnabled(env)) return null
  const token = readCookie(request, COOKIE)
  if (!token || token.length > 100) return null
  await ensureSchema(env.DB)
  const row = await env.DB.prepare(
    "SELECT s.token_hash, s.expires_at, u.id, u.email, u.name, u.picture FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?"
  ).bind(await sha256(token)).first()
  if (!row || row.expires_at < now) return null
  return { user: publicUser(row), tokenHash: row.token_hash, expiresAt: row.expires_at }
}

/* ---------------- routes ---------------- */
export async function handleAuth(request, env, fetchImpl = fetch) {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method

  if (path === "/api/auth/config") return reply(200, { google: authEnabled(env) ? env.GOOGLE_CLIENT_ID : null })
  if (!authEnabled(env)) return reply(404, { error: "Sign-in is not set up on this server" })
  if (method !== "GET" && !originAllowed(request, env)) return reply(403, { error: "Origin not allowed" })
  await ensureSchema(env.DB)
  const now = Date.now()

  if (path === "/api/auth/google" && method === "POST") {
    if (await limited(request, env, { name: "auth", binding: env.AUTH_LIMIT, perMinute: Number(env.NILOBS_AUTH_PER_MINUTE || 10) })) return reply(429, { error: "Too many sign-in attempts. Try again in a minute." })
    let body
    try {
      body = await request.json()
    } catch {
      return reply(400, { error: "Body must be JSON" })
    }
    let claims
    try {
      claims = await verifyGoogleToken(body?.credential, env.GOOGLE_CLIENT_ID, fetchImpl, now)
    } catch (e) {
      return reply(401, { error: "Google sign-in could not be verified", reason: String(e?.message || e) })
    }
    const email = String(claims.email || "").slice(0, 320)
    const name = String(claims.name || claims.given_name || "").slice(0, 120)
    const picture = /^https:\/\//.test(claims.picture || "") ? String(claims.picture).slice(0, 500) : ""
    let user = await env.DB.prepare("SELECT id, email, name, picture FROM users WHERE google_sub = ?").bind(String(claims.sub)).first()
    if (user) {
      await env.DB.prepare("UPDATE users SET email = ?, name = ?, picture = ?, last_seen = ? WHERE id = ?").bind(email, name, picture, now, user.id).run()
      user = { ...user, email, name, picture }
    } else {
      user = { id: crypto.randomUUID(), email, name, picture }
      await env.DB.prepare("INSERT INTO users (id, google_sub, email, name, picture, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(user.id, String(claims.sub), email, name, picture, now, now).run()
    }
    const token = randomToken()
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at < ?").bind(user.id, now),
      env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), user.id, now, now + SESSION_DAYS * DAY),
    ])
    const state = await env.DB.prepare("SELECT version FROM user_state WHERE user_id = ?").bind(user.id).first()
    return withCookie(reply(200, { user: publicUser(user), stateVersion: state?.version ?? 0 }), cookieHeader(request, token, SESSION_DAYS * 86400))
  }

  if (path === "/api/auth/logout" && method === "POST") {
    const s = await getSession(request, env, now)
    if (s) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(s.tokenHash).run()
    return withCookie(reply(200, { ok: true }), cookieHeader(request, "", 0))
  }

  const s = await getSession(request, env, now)
  if (!s) return withCookie(reply(401, { error: "Not signed in" }), cookieHeader(request, "", 0))

  if (path === "/api/me" && method === "GET") {
    // keep active sessions alive: extend once less than half the time is left
    if (s.expiresAt - now < (SESSION_DAYS / 2) * DAY) {
      await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").bind(now + SESSION_DAYS * DAY, s.tokenHash).run()
      return withCookie(reply(200, { user: s.user }), cookieHeader(request, readCookie(request, COOKIE), SESSION_DAYS * 86400))
    }
    return reply(200, { user: s.user })
  }

  if (path === "/api/me" && method === "DELETE") {
    await ensureWalletSchema(env.DB)
    await ensureLiveSchema(env.DB)
    const row = await env.DB.prepare("SELECT google_sub FROM users WHERE id = ?").bind(s.user.id).first()
    await env.DB.batch([
      // signing up again with the same Google account doesn't bring back the free starting credits
      ...(row?.google_sub ? [env.DB.prepare("INSERT OR IGNORE INTO starts (key, at) VALUES (?, ?)").bind(await startKey(row.google_sub), now)] : []),
      env.DB.prepare("DELETE FROM wallets WHERE user_id = ?").bind(s.user.id),
      env.DB.prepare("DELETE FROM user_state WHERE user_id = ?").bind(s.user.id),
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(s.user.id),
      env.DB.prepare("DELETE FROM users WHERE id = ?").bind(s.user.id),
      env.DB.prepare("DELETE FROM push_subs WHERE user_id = ?").bind(s.user.id),
      env.DB.prepare("DELETE FROM debriefs WHERE user_id = ?").bind(s.user.id),
    ])
    return withCookie(reply(200, { ok: true }), cookieHeader(request, "", 0))
  }

  if (path === "/api/state" && method === "GET") {
    const row = await env.DB.prepare("SELECT version, data FROM user_state WHERE user_id = ?").bind(s.user.id).first()
    return reply(200, { version: row?.version ?? 0, data: row ? JSON.parse(row.data) : null })
  }

  if (path === "/api/state" && method === "PUT") {
    const raw = await request.text()
    if (raw.length > MAX_STATE_CHARS + 1000) return reply(413, { error: "Too much to save" })
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      return reply(400, { error: "Body must be JSON" })
    }
    const base = Number(body?.base)
    if (!Number.isInteger(base) || base < 0 || !body.data || typeof body.data !== "object" || Array.isArray(body.data)) return reply(400, { error: "Need base and data" })
    // credits live in the server wallet (worker/wallet.js): a wallet sent here is ignored
    const { wallet: _ignored, ...rest } = body.data
    const data = JSON.stringify(rest)
    if (data.length > MAX_STATE_CHARS) return reply(413, { error: "Too much to save" })
    // only one writer wins per version: the other gets the newer copy back and merges
    const res =
      base === 0
        ? await env.DB.prepare("INSERT INTO user_state (user_id, version, data, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT (user_id) DO NOTHING").bind(s.user.id, data, now).run()
        : await env.DB.prepare("UPDATE user_state SET version = version + 1, data = ?, updated_at = ? WHERE user_id = ? AND version = ?").bind(data, now, s.user.id, base).run()
    if (res?.meta?.changes === 1) return reply(200, { version: base + 1 })
    const row = await env.DB.prepare("SELECT version, data FROM user_state WHERE user_id = ?").bind(s.user.id).first()
    return reply(409, { version: row?.version ?? 0, data: row ? JSON.parse(row.data) : null })
  }

  return reply(404, { error: "Not found" })
}
