// POST /api/ai — NilObs AI endpoint.
// The browser never sees your Anthropic key: it is the ANTHROPIC_API_KEY secret on the Worker.
// Body: { messages: [{ role: "user" | "assistant", content: string }], tier?: "quick" | "default" | "complex", json?: boolean }
// Streams back plain text. If the answer fails part-way, it sends "\u001e" followed by a JSON error.

const EFFORT = { quick: "low", default: "medium", complex: "high" }
const MAX_TOKENS = { quick: 3000, default: 6000, complex: 8000 }
const MAX_INPUT_CHARS = 120000
const ERR = "\u001e"

const SYSTEM =
  "You are the AI inside NilObs, a SIRE 2.0 inspection-prep app for tanker crews. " +
  "Follow the instructions given in the user's message, keep to ship inspections and seafaring, " +
  "and never invent regulation numbers or OCIMF question wording."

// Best-effort limit per IP, per Worker isolate. Add the AI_LIMIT rate-limit binding (see wrangler.jsonc) for a real one.
const hits = new Map()
function localLimited(ip, perMinute) {
  const now = Date.now()
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000)
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) hits.clear()
  return list.length > perMinute
}

const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } })

export async function handleAi(request, env, fetchImpl = fetch) {
  if (request.method !== "POST") return reply(405, { error: "Use POST" })
  const key = env.ANTHROPIC_API_KEY
  if (!key) return reply(500, { error: "The server is missing the ANTHROPIC_API_KEY secret" })

  // Only accept calls from the site itself (plus any origins you list)
  const self = new URL(request.url).origin
  const allowed = [self, ...String(env.NILOBS_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)]
  const origin = request.headers.get("origin")
  if (!origin || !allowed.includes(origin)) return reply(403, { error: "Origin not allowed" })

  const ip = request.headers.get("cf-connecting-ip") || (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown"
  if (env.AI_LIMIT?.limit) {
    const { success } = await env.AI_LIMIT.limit({ key: ip })
    if (!success) return reply(429, { error: "Too many requests. Try again in a minute." })
  } else if (localLimited(ip, Number(env.NILOBS_RATE_PER_MINUTE || 12))) {
    return reply(429, { error: "Too many requests. Try again in a minute." })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return reply(400, { error: "Body must be JSON" })
  }
  const tier = ["quick", "default", "complex"].includes(body?.tier) ? body.tier : "default"
  const models = {
    quick: env.NILOBS_MODEL_QUICK || "claude-haiku-5-5",
    default: env.NILOBS_MODEL || "claude-sonnet-5-5",
    complex: env.NILOBS_MODEL_COMPLEX || env.NILOBS_MODEL || "claude-sonnet-5-5",
  }
  const clean = (Array.isArray(body?.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }))
  if (!clean.length || clean[0].role !== "user" || clean[clean.length - 1].role !== "user") return reply(400, { error: "Messages must start and end with a user turn" })
  if (clean.reduce((n, m) => n + m.content.length, 0) > MAX_INPUT_CHARS) return reply(413, { error: "Too long" })
  const messages = []
  for (const m of clean) {
    const last = messages[messages.length - 1]
    if (last && last.role === m.role) last.content += "\n\n" + m.content
    else messages.push({ ...m })
  }

  let upstream
  try {
    upstream = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: models[tier],
        max_tokens: MAX_TOKENS[tier],
        system: body?.json ? SYSTEM + " Reply with only the JSON value requested, with no other text." : SYSTEM,
        messages,
        output_config: { effort: EFFORT[tier] },
        stream: true,
      }),
    })
  } catch {
    return reply(502, { error: "Could not reach the AI service" })
  }
  if (!upstream.ok || !upstream.body) {
    const status = upstream.status === 429 || upstream.status === 529 ? 429 : upstream.status === 400 ? 400 : 502
    let detail = ""
    try {
      detail = (await upstream.json())?.error?.message || ""
    } catch {
      /* ignore */
    }
    console.error("Anthropic API error", upstream.status, detail)
    return reply(status, { error: status === 429 ? "The AI is busy. Try again shortly." : "The AI service returned an error" })
  }

  const enc = new TextEncoder()
  const dec = new TextDecoder()
  const reader = upstream.body.getReader()
  const stream = new ReadableStream({
    async start(controller) {
      let buf = ""
      const fail = (code) => controller.enqueue(enc.encode(ERR + JSON.stringify({ code })))
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n")
          let i
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const event = buf.slice(0, i)
            buf = buf.slice(i + 2)
            const data = event.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("")
            if (!data) continue
            let ev
            try {
              ev = JSON.parse(data)
            } catch {
              continue
            }
            if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) controller.enqueue(enc.encode(ev.delta.text))
            else if (ev.type === "error") {
              fail(ev.error?.type === "overloaded_error" ? "rate_limited" : "upstream_error")
              controller.close()
              return
            }
          }
        }
      } catch {
        fail("upstream_error")
      }
      controller.close()
    },
    cancel() {
      reader.cancel().catch(() => {})
    },
  })
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } })
}
