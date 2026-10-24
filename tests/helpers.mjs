// Shared set-up for the Worker tests: a signed-in user on fake D1, fake Google and a scriptable fake Claude.
import worker from "../worker/index.js"
import { resetSchemaFlag } from "../worker/auth.js"
import { resetWalletSchemaFlag } from "../worker/wallet.js"
import { resetLiveSchemaFlag } from "../worker/live.js"
import { fakeD1, fakeGoogle } from "./fakes.mjs"

export const SITE = "https://nilobs.com"
export const CLIENT = "test-client.apps.googleusercontent.com"
export const google = await fakeGoogle()

const sse = (events) =>
  new Response(new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)); c.close() } }), { headers: { "content-type": "text/event-stream" } })
export const textReply = (...parts) => sse(parts.map((t) => ({ type: "content_block_delta", delta: { type: "text_delta", text: t } })))

/** What the fake Claude answers next: a function (body) => Response. Default: "Hi". */
export const fakeClaude = { next: null, calls: 0, last: null }
export const fakeVoice = { fail: false, calls: 0 }
export const fakeProviders = { handler: null } // set by payment tests
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  if (u === "https://www.googleapis.com/oauth2/v3/certs") return new Response(JSON.stringify(google.jwks), { headers: { "content-type": "application/json" } })
  if (u.startsWith("https://api.anthropic.com/")) {
    fakeClaude.calls++
    fakeClaude.last = JSON.parse(init.body)
    const f = fakeClaude.next
    return f ? f(fakeClaude.last) : textReply("Hi")
  }
  if (u.startsWith("https://silk-api.rumik.ai/")) {
    fakeVoice.calls++
    return fakeVoice.fail ? new Response("down", { status: 500 }) : new Response(new Uint8Array([82, 73, 70, 70]), { headers: { "content-type": "audio/wav" } })
  }
  if (fakeProviders.handler && u.startsWith("https://api.razorpay.com/")) return fakeProviders.handler(u, init)
  return realFetch(url, init)
}

export function freshEnv(extra = {}) {
  resetSchemaFlag()
  resetWalletSchemaFlag()
  resetLiveSchemaFlag()
  return {
    DB: fakeD1(), GOOGLE_CLIENT_ID: CLIENT, ANTHROPIC_API_KEY: "k", RUMIK_API_KEY: "r",
    ASSETS: { fetch: async () => new Response("site") },
    NILOBS_RATE_PER_MINUTE: "1000", NILOBS_AUTH_PER_MINUTE: "1000", NILOBS_PHOTO_PER_MINUTE: "1000", NILOBS_VOICE_PER_MINUTE: "1000", NILOBS_WALLET_PER_MINUTE: "1000", NILOBS_PAY_PER_MINUTE: "1000",
    ...extra,
  }
}
export const req = (path, { method = "GET", body, cookie, origin = SITE, headers = {} } = {}) =>
  new Request(SITE + path, { method, headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) })
export const call = (env, path, opts) => worker.fetch(req(path, opts), env, { waitUntil: () => {} })
/** The reply's JSON, with the HTTP status as .status (the body itself stays in .body). */
export const json = async (res) => {
  const body = await res.json()
  return { ...body, body, status: res.status }
}

export async function signIn(env, sub = "g-1") {
  const credential = await google.sign({ aud: CLIENT, sub, email: `${sub}@example.com`, name: "Officer" })
  const res = await call(env, "/api/auth/google", { method: "POST", body: { credential } })
  return { cookie: (res.headers.get("set-cookie") || "").split(";")[0], user: (await res.json()).user }
}
let n = 0
export const ref = () => `test-ref-${Date.now().toString(36)}-${(n++).toString(36)}`
export const balanceOf = (w) => w.buckets.reduce((s, b) => s + (b.left > 0 && (b.expires == null || b.expires > Date.now()) ? b.left : 0), 0)
export { worker }
