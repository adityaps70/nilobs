// Run with: npm test  (Node 20+). Uses a fake Anthropic API, so no key or network is needed.
import test from "node:test"
import assert from "node:assert/strict"
import { handleAi } from "../worker/ai.js"

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
