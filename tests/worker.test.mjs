// Run with: npm test  (Node 20+). Uses a fake Anthropic API, so no key or network is needed.
import test from "node:test"
import assert from "node:assert/strict"
import { MAX_IMAGE_CHARS, MAX_IMAGES, cleanImages, handleAi } from "../worker/ai.js"

const SITE = "https://nilobs.example.workers.dev"
const env = { ANTHROPIC_API_KEY: "test-key", NILOBS_RATE_PER_MINUTE: "1000" }
const sse = (events) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const e of events) c.enqueue(new TextEncoder().encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`))
        c.close()
      },
    }),
    { headers: { "content-type": "text/event-stream" } }
  )
const ask = (body, headers = { origin: SITE }) =>
  new Request(`${SITE}/api/ai`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) })
const text = async (res) => await res.text()

test("streams Claude's text back as plain text", async () => {
  let sent
  const fake = async (url, init) => {
    sent = { url, body: JSON.parse(init.body), headers: init.headers }
    return sse([
      { type: "message_start" },
      { type: "content_block_start", index: 0, content_block: { type: "thinking" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hello " } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "crew" } },
      { type: "message_stop" },
    ])
  }
  const res = await handleAi(ask({ messages: [{ role: "user", content: "Hi" }, { role: "user", content: "again" }], tier: "quick" }), env, fake)
  assert.equal(res.status, 200)
  assert.equal(await text(res), "Hello crew")
  assert.equal(sent.url, "https://api.anthropic.com/v1/messages")
  assert.equal(sent.headers["x-api-key"], "test-key")
  assert.equal(sent.body.model, "claude-haiku-5-5")
  assert.equal(sent.body.stream, true)
  assert.equal(sent.body.messages.length, 1, "consecutive user turns are merged")
})

test("rejects other origins, missing key and bad input", async () => {
  const never = async () => assert.fail("should not call the API")
  assert.equal((await handleAi(ask({ messages: [{ role: "user", content: "x" }] }, { origin: "https://evil.example" }), env, never)).status, 403)
  assert.equal((await handleAi(ask({ messages: [{ role: "user", content: "x" }] }), {}, never)).status, 500)
  assert.equal((await handleAi(ask({ messages: [{ role: "assistant", content: "x" }] }), env, never)).status, 400)
  assert.equal((await handleAi(new Request(`${SITE}/api/ai`), env, never)).status, 405)
})

test("marks an answer that fails part-way", async () => {
  const fake = async () => sse([{ type: "content_block_delta", delta: { type: "text_delta", text: "Part" } }, { type: "error", error: { type: "overloaded_error" } }])
  const body = await text(await handleAi(ask({ messages: [{ role: "user", content: "x" }] }), env, fake))
  assert.equal(body, 'Part\u001e{"code":"rate_limited"}')
})

test("passes API rate limits through as 429", async () => {
  const fake = async () => new Response(JSON.stringify({ error: { message: "slow down" } }), { status: 429 })
  assert.equal((await handleAi(ask({ messages: [{ role: "user", content: "x" }] }), env, fake)).status, 429)
})

/* ---------------- voice ---------------- */
import { handleVoice } from "../worker/voice.js"
import worker from "../worker/index.js"

const venv = { RUMIK_API_KEY: "rk_test_key", NILOBS_VOICE_PER_MINUTE: "1000" }
const say = (body, headers = { origin: SITE }) =>
  new Request(`${SITE}/api/voice`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) })
const wav = () => new Response(new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]), { headers: { "content-type": "audio/wav" } })
function memoryCache() {
  const m = new Map()
  return { match: async (r) => m.get(r.url)?.clone(), put: async (r, res) => void m.set(r.url, res), size: () => m.size }
}

test("voice: sends text to Rumik with the bearer key and returns audio", async () => {
  let sent
  const fake = async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) }
    return wav()
  }
  const res = await handleVoice(say({ text: "  What does your   SMS say about pilot boarding?  " }), venv, fake, null)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("content-type"), "audio/wav")
  assert.equal((await res.arrayBuffer()).byteLength, 8)
  assert.equal(sent.url, "https://silk-api.rumik.ai/v1/tts")
  assert.equal(sent.init.headers.authorization, "Bearer rk_test_key")
  assert.deepEqual(sent.body, { text: "What does your SMS say about pilot boarding?", model: "muga" })
})

test("voice: optional speaker, description and tone come from settings", async () => {
  let body
  const fake = async (_u, init) => ((body = JSON.parse(init.body)), wav())
  await handleVoice(say({ text: "Hello" }), { ...venv, NILOBS_VOICE_SPEAKER: "speaker_2", NILOBS_VOICE_TONE: "neutral" }, fake, null)
  assert.deepEqual(body, { text: "[neutral] Hello", model: "muga", speaker: "speaker_2" })
  await handleVoice(say({ text: "Hello" }), { ...venv, NILOBS_VOICE_MODEL: "mulberry", NILOBS_VOICE_DESCRIPTION: "calm male inspector", NILOBS_VOICE_TONE: "neutral" }, fake, null)
  assert.deepEqual(body, { text: "Hello", model: "mulberry", description: "calm male inspector" })
})

test("voice: the same line is served from cache the second time", async () => {
  let calls = 0
  const fake = async () => (calls++, wav())
  const cache = memoryCache()
  const a = await handleVoice(say({ text: "Show me the gas detector calibration record." }), venv, fake, cache)
  const b = await handleVoice(say({ text: "Show me the gas detector calibration record." }), venv, fake, cache)
  assert.equal(a.headers.get("x-voice-cache"), "miss")
  assert.equal(b.headers.get("x-voice-cache"), "hit")
  assert.equal((await b.arrayBuffer()).byteLength, 8)
  assert.equal(calls, 1)
})

test("voice: refuses without a key, from other sites, and for empty or long text", async () => {
  const never = async () => assert.fail("should not call Rumik")
  assert.equal((await handleVoice(say({ text: "x" }), {}, never, null)).status, 503)
  assert.equal((await handleVoice(say({ text: "x" }, { origin: "https://evil.example" }), venv, never, null)).status, 403)
  assert.equal((await handleVoice(say({ text: "   " }), venv, never, null)).status, 400)
  assert.equal((await handleVoice(say({ text: "a".repeat(601) }), venv, never, null)).status, 413)
  assert.equal((await handleVoice(new Request(`${SITE}/api/voice`), venv, never, null)).status, 405)
})

test("voice: provider errors are mapped, and a rejected key says so", async () => {
  assert.equal((await handleVoice(say({ text: "x" }), venv, async () => new Response("slow", { status: 429 }), null)).status, 429)
  const bad = await handleVoice(say({ text: "x" }), venv, async () => new Response("no", { status: 401 }), null)
  assert.equal(bad.status, 502)
  assert.match((await bad.json()).error, /key was rejected/)
})

test("health reports whether AI and voice are configured", async () => {
  const assets = { fetch: async () => new Response("site") }
  const h1 = await (await worker.fetch(new Request(`${SITE}/api/health`), { ASSETS: assets, ANTHROPIC_API_KEY: "k" })).json()
  assert.deepEqual(h1, { ok: true, ai: true, voice: false, signin: false })
  const h2 = await (await worker.fetch(new Request(`${SITE}/api/health`), { ASSETS: assets, ANTHROPIC_API_KEY: "k", RUMIK_API_KEY: "r" })).json()
  assert.deepEqual(h2, { ok: true, ai: true, voice: true, signin: false })
})

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg=="

test("photo check: images go to Claude with the last user turn, on the vision model", async () => {
  let sent
  const fake = async (url, init) => {
    sent = JSON.parse(init.body)
    return sse([{ type: "content_block_delta", delta: { type: "text_delta", text: "{}" } }])
  }
  const res = await handleAi(ask({ messages: [{ role: "user", content: "What would an inspector flag?" }], tier: "quick", json: true, images: [{ media_type: "image/png", data: PNG }, { media_type: "image/jpeg", data: PNG }] }), env, fake)
  assert.equal(res.status, 200)
  assert.equal(await text(res), "{}")
  assert.equal(sent.model, "claude-sonnet-5-5", "photos never go to the quick model")
  const content = sent.messages[0].content
  assert.ok(Array.isArray(content))
  assert.deepEqual(content[0], { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } })
  assert.equal(content[1].source.media_type, "image/jpeg")
  assert.deepEqual(content[2], { type: "text", text: "What would an inspector flag?" })
})

test("photo check: rejects too many, too large, wrong type and broken images", async () => {
  const never = async () => assert.fail("should not call the API")
  const msg = [{ role: "user", content: "x" }]
  const one = { media_type: "image/png", data: PNG }
  const status = async (images) => (await handleAi(ask({ messages: msg, images }), env, never)).status
  assert.equal(await status(Array(MAX_IMAGES + 1).fill(one)), 400)
  assert.equal(await status([{ media_type: "image/png", data: "A".repeat(MAX_IMAGE_CHARS + 4) }]), 413)
  assert.equal(await status([{ media_type: "image/svg+xml", data: PNG }]), 400)
  assert.equal(await status([{ media_type: "image/png", data: "not base64!" }]), 400)
  assert.equal(await status("nope"), 400)
  assert.deepEqual(cleanImages(undefined), [])
  assert.equal(cleanImages([one]).length, 1)
})

test("photo check: has its own tighter rate limit", async () => {
  const ok = async () => sse([{ type: "content_block_delta", delta: { type: "text_delta", text: "ok" } }])
  const e2 = { ...env, NILOBS_PHOTO_PER_MINUTE: "2" }
  const call = (ip) => handleAi(ask({ messages: [{ role: "user", content: "x" }], images: [{ media_type: "image/png", data: PNG }] }, { origin: SITE, "cf-connecting-ip": ip }), e2, ok)
  assert.equal((await call("9.9.9.1")).status, 200)
  assert.equal((await call("9.9.9.1")).status, 200)
  assert.equal((await call("9.9.9.1")).status, 429)
  // text questions are unaffected
  const res = await handleAi(ask({ messages: [{ role: "user", content: "x" }] }, { origin: SITE, "cf-connecting-ip": "9.9.9.1" }), e2, ok)
  assert.equal(res.status, 200)
})

test("www.nilobs.com redirects to nilobs.com, keeping the path and query", async () => {
  const { default: worker } = await import("../worker/index.js")
  const assets = { fetch: async () => new Response("site") }
  const res = await worker.fetch(new Request("https://www.nilobs.com/app?x=1"), { ASSETS: assets })
  assert.equal(res.status, 301)
  assert.equal(res.headers.get("location"), "https://nilobs.com/app?x=1")
  const home = await worker.fetch(new Request("https://nilobs.com/"), { ASSETS: assets })
  assert.equal(await home.text(), "site")
})

test("workers.dev pages move to nilobs.com; the API and other hosts don't", async () => {
  const { default: worker } = await import("../worker/index.js")
  const env = { NILOBS_CANONICAL_HOST: "nilobs.com", ASSETS: { fetch: async (r) => new Response("asset " + new URL(r.url).pathname) } }
  const r = await worker.fetch(new Request("https://nilobs.someone.workers.dev/?x=1"), env)
  assert.equal(r.status, 301)
  assert.equal(r.headers.get("location"), "https://nilobs.com/?x=1")
  const deep = await worker.fetch(new Request("https://nilobs.someone.workers.dev/privacy?a=b"), env)
  assert.equal(deep.headers.get("location"), "https://nilobs.com/privacy?a=b")
  const api = await worker.fetch(new Request("https://nilobs.someone.workers.dev/api/health"), env)
  assert.equal(api.status, 200)
  const local = await worker.fetch(new Request("http://localhost:8788/"), env)
  assert.equal(await local.text(), "asset /")
  const priv = await worker.fetch(new Request("https://nilobs.com/privacy"), env)
  assert.equal(await priv.text(), "asset /privacy", "served by Cloudflare's assets as privacy.html")
})
