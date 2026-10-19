// Sign in with Google, sessions, synced state, and the sign-in gate on the AI. No network: fake Google and D1.
import test from "node:test"
import assert from "node:assert/strict"
import worker from "../worker/index.js"
import { handleAuth, resetGoogleKeys, resetSchemaFlag, verifyGoogleToken } from "../worker/auth.js"
import { fakeD1, fakeGoogle } from "./fakes.mjs"

const SITE = "https://nilobs.com"
const CLIENT = "test-client.apps.googleusercontent.com"
const google = await fakeGoogle()
const realFetch = globalThis.fetch
let certCalls = 0
globalThis.fetch = async (url, init) => {
  if (String(url) === "https://www.googleapis.com/oauth2/v3/certs") {
    certCalls++
    return new Response(JSON.stringify(google.jwks), { headers: { "content-type": "application/json" } })
  }
  if (String(url).startsWith("https://api.anthropic.com/")) return new Response("event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hi\"}}\n\n", { headers: { "content-type": "text/event-stream" } })
  return realFetch(url, init)
}

const freshEnv = () => {
  resetSchemaFlag()
  return { DB: fakeD1(), GOOGLE_CLIENT_ID: CLIENT, ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("site") }, NILOBS_RATE_PER_MINUTE: "1000", NILOBS_AUTH_PER_MINUTE: "1000" }
}
const req = (path, { method = "GET", body, cookie, origin = SITE } = {}) =>
  new Request(SITE + path, { method, headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
const cookieOf = (res) => (res.headers.get("set-cookie") || "").split(";")[0]

async function signIn(env, claims = { sub: "g-1", email: "officer@example.com", name: "Second Officer", picture: "https://lh3.googleusercontent.com/a/x" }) {
  const credential = await google.sign({ aud: CLIENT, ...claims })
  const res = await worker.fetch(req("/api/auth/google", { method: "POST", body: { credential } }), env)
  return { res, json: await res.clone().json(), cookie: cookieOf(res) }
}

test("config tells the app whether sign-in is on", async () => {
  const env = freshEnv()
  assert.deepEqual(await (await worker.fetch(req("/api/auth/config"), env)).json(), { google: CLIENT })
  assert.deepEqual(await (await worker.fetch(req("/api/auth/config"), { ASSETS: env.ASSETS })).json(), { google: null })
  const health = await (await worker.fetch(req("/api/health"), env)).json()
  assert.equal(health.signin, true)
})

test("a valid Google token signs in, sets an HttpOnly cookie, and /api/me knows the user", async () => {
  const env = freshEnv()
  const { res, json, cookie } = await signIn(env)
  assert.equal(res.status, 200)
  assert.equal(json.user.email, "officer@example.com")
  assert.equal(json.user.name, "Second Officer")
  assert.equal(json.stateVersion, 0)
  const set = res.headers.get("set-cookie")
  assert.match(set, /^nilobs_sid=[\w-]{40,}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure$/)
  const me = await worker.fetch(req("/api/me", { cookie }), env)
  assert.equal(me.status, 200)
  assert.equal((await me.json()).user.id, json.user.id)
  // the token itself is never stored, only its hash
  const rows = env.DB.sqlite.prepare("SELECT token_hash FROM sessions").all()
  assert.equal(rows.length, 1)
  assert.ok(!cookie.includes(rows[0].token_hash))
  // the same Google account signs in to the same NilObs account
  const again = await signIn(env)
  assert.equal(again.json.user.id, json.user.id)
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get().n, 1)
})

test("bad tokens are refused: wrong audience, expired, forged, garbage, unverified email", async () => {
  const env = freshEnv()
  const post = (credential) => worker.fetch(req("/api/auth/google", { method: "POST", body: { credential } }), env)
  const now = Math.floor(Date.now() / 1000)
  assert.equal((await post(await google.sign({ aud: "someone-else", sub: "x" }))).status, 401)
  assert.equal((await post(await google.sign({ aud: CLIENT, sub: "x", exp: now - 3600 }))).status, 401)
  assert.equal((await post(await google.sign({ aud: CLIENT, sub: "x", iss: "https://evil.example" }))).status, 401)
  assert.equal((await post(await google.sign({ aud: CLIENT, sub: "x", email_verified: false, email: "a@b.c" }))).status, 401)
  const other = await fakeGoogle("test-key-1") // same key id, different key: signature must fail
  assert.equal((await post(await other.sign({ aud: CLIENT, sub: "x" }))).status, 401)
  assert.equal((await post("not.a.token")).status, 401)
  assert.equal((await post("")).status, 401)
  // a cross-site page can't sign anyone in
  const credential = await google.sign({ aud: CLIENT, sub: "x" })
  assert.equal((await worker.fetch(req("/api/auth/google", { method: "POST", body: { credential }, origin: "https://evil.example" }), env)).status, 403)
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get().n, 0)
})

test("unknown key ids refresh Google's keys once, then fail", async () => {
  resetGoogleKeys()
  certCalls = 0
  const t = await google.sign({ aud: CLIENT, sub: "x" }, { kid: "rotated-away" })
  await assert.rejects(verifyGoogleToken(t, CLIENT), /unknown key/)
  assert.equal(certCalls, 2)
})

test("AI and voice need a signed-in user once sign-in is set up", async () => {
  const env = freshEnv()
  const ask = (cookie) => worker.fetch(req("/api/ai", { method: "POST", cookie, body: { messages: [{ role: "user", content: "hi" }] } }), env)
  assert.equal((await ask()).status, 401)
  assert.equal((await ask("nilobs_sid=made-up")).status, 401)
  const voice = await worker.fetch(req("/api/voice", { method: "POST", body: { text: "hi" } }), env)
  assert.equal(voice.status, 401)
  const { cookie } = await signIn(env)
  const ok = await ask(cookie)
  assert.equal(ok.status, 200)
  assert.equal(await ok.text(), "Hi")
})

test("synced state: first save, version checks, conflicts return the newer copy", async () => {
  const env = freshEnv()
  const { cookie } = await signIn(env)
  const get = async () => (await worker.fetch(req("/api/state", { cookie }), env)).json()
  const put = (base, data) => worker.fetch(req("/api/state", { method: "PUT", cookie, body: { base, data } }), env)
  assert.deepEqual(await get(), { version: 0, data: null })
  let r = await put(0, { wallet: { a: 1 } })
  assert.deepEqual(await r.json(), { version: 1 })
  r = await put(1, { wallet: { a: 2 } })
  assert.deepEqual(await r.json(), { version: 2 })
  // a second device still on version 1 is told about version 2
  r = await put(1, { wallet: { a: 99 } })
  assert.equal(r.status, 409)
  assert.deepEqual(await r.json(), { version: 2, data: { wallet: { a: 2 } } })
  r = await put(0, { wallet: { a: 98 } })
  assert.equal(r.status, 409)
  assert.deepEqual(await get(), { version: 2, data: { wallet: { a: 2 } } })
  // limits and bad input
  assert.equal((await put(2, { big: "x".repeat(700000) })).status, 413)
  assert.equal((await put("2", [])).status, 400)
  assert.equal((await worker.fetch(req("/api/state", { method: "PUT", cookie, body: { base: 2, data: {} }, origin: "https://evil.example" }), env)).status, 403)
  // another user can't see it
  const other = await signIn(env, { sub: "g-2", email: "b@example.com" })
  assert.deepEqual(await (await worker.fetch(req("/api/state", { cookie: other.cookie }), env)).json(), { version: 0, data: null })
  // signed out: nothing
  assert.equal((await worker.fetch(req("/api/state"), env)).status, 401)
})

test("sign out ends the session; delete account removes everything", async () => {
  const env = freshEnv()
  const { cookie } = await signIn(env)
  await worker.fetch(req("/api/state", { method: "PUT", cookie, body: { base: 0, data: { x: 1 } } }), env)
  const out = await worker.fetch(req("/api/auth/logout", { method: "POST", cookie }), env)
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/)
  assert.equal((await worker.fetch(req("/api/me", { cookie }), env)).status, 401)
  const again = await signIn(env)
  assert.deepEqual((await (await worker.fetch(req("/api/state", { cookie: again.cookie }), env)).json()).data, { x: 1 }, "data survives sign-out")
  const del = await worker.fetch(req("/api/me", { method: "DELETE", cookie: again.cookie }), env)
  assert.equal(del.status, 200)
  for (const t of ["users", "sessions", "user_state"]) assert.equal(env.DB.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, 0, t)
})

test("expired sessions don't count", async () => {
  const env = freshEnv()
  const { cookie } = await signIn(env)
  env.DB.sqlite.prepare("UPDATE sessions SET expires_at = 1").run()
  assert.equal((await worker.fetch(req("/api/me", { cookie }), env)).status, 401)
})

test("without sign-in set up, the auth routes are off and AI stays open", async () => {
  const env = { ASSETS: { fetch: async () => new Response("site") }, ANTHROPIC_API_KEY: "k", NILOBS_RATE_PER_MINUTE: "1000", NILOBS_AUTH_PER_MINUTE: "1000" }
  assert.equal((await handleAuth(req("/api/me"), env)).status, 404)
  const res = await worker.fetch(req("/api/ai", { method: "POST", body: { messages: [{ role: "user", content: "hi" }] } }), env)
  assert.equal(res.status, 200)
})
