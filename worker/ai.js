// POST /api/ai — NilObs AI endpoint.
// The browser never sees your Anthropic key: it is the ANTHROPIC_API_KEY secret on the Worker.
// Body: { messages: [{ role: "user" | "assistant", content: string }], tier?: "quick" | "default" | "complex", json?: boolean,
//         images?: [{ media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: base64 }] }
// Images (Photo check) are shown to Claude with the last user turn. They are never stored or logged.
// Streams back plain text. If the answer fails part-way, it sends "\u001e" followed by a JSON error.
import { limited, originAllowed, reply } from "./guard.js"

const EFFORT = { quick: "low", default: "medium", complex: "high" }
const MAX_TOKENS = { quick: 3000, default: 6000, complex: 8000 }
const MAX_INPUT_CHARS = 120000
export const MAX_IMAGES = 3
export const MAX_IMAGE_CHARS = 2_000_000 // base64 characters per image (about 1.5 MB); the app sends ~1280 px JPEGs
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
const B64 = /^[A-Za-z0-9+/]+={0,2}$/

/** Checks the optional images list. Returns the clean list, or an error string. */
export function cleanImages(raw) {
  if (raw == null) return []
  if (!Array.isArray(raw)) return "images must be a list"
  if (raw.length > MAX_IMAGES) return `At most ${MAX_IMAGES} photos at a time`
  const out = []
  for (const im of raw) {
    if (!im || typeof im !== "object") return "Bad image"
    const media_type = String(im.media_type || "")
    const data = typeof im.data === "string" ? im.data : ""
    if (!IMAGE_TYPES.includes(media_type)) return "Photos must be JPEG, PNG, WebP or GIF"
    if (!data || data.length > MAX_IMAGE_CHARS) return "Photo too large"
    if (data.length % 4 !== 0 || !B64.test(data)) return "Bad image data"
    out.push({ type: "image", source: { type: "base64", media_type, data } })
  }
  return out
}
const ERR = "\u001e"

const SYSTEM =
  "You are the AI inside NilObs, a SIRE 2.0 inspection-prep app for tanker crews. " +
  "Follow the instructions given in the user's message, keep to ship inspections and seafaring, " +
  "and never invent regulation numbers or OCIMF question wording."

/** Reads a reply the way the app does: the whole text, a fenced block, or the outermost {...} / [...]. */
export function parseJsonReply(text) {
  const tryParse = (t) => {
    try {
      return { ok: true, v: JSON.parse(t) }
    } catch {
      return { ok: false }
    }
  }
  let r = tryParse(text.trim())
  if (!r.ok) {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) r = tryParse(fence[1].trim())
  }
  if (!r.ok) {
    const a = text.search(/[[{]/), b = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"))
    if (a >= 0 && b > a) r = tryParse(text.slice(a, b + 1))
  }
  return r
}

/**
 * `meter` (signed-in users, see worker/wallet.js) ties the call to a paid ticket: begin() books it,
 * delivered() keeps the charge once the answer reaches the user, returned() gives the call back.
 * Replies that must be JSON are checked here before anything is sent, so a failed one leaks nothing.
 */
export async function handleAi(request, env, fetchImpl = fetch, meter = null, ctx = null) {
  if (request.method !== "POST") return reply(405, { error: "Use POST" })
  const key = env.ANTHROPIC_API_KEY
  if (!key) return reply(500, { error: "The server is missing the ANTHROPIC_API_KEY secret" })

  // Only accept calls from the site itself (plus any origins you list), and limit each IP
  if (!originAllowed(request, env)) return reply(403, { error: "Origin not allowed" })
  if (await limited(request, env, { name: "ai", binding: env.AI_LIMIT, perMinute: Number(env.NILOBS_RATE_PER_MINUTE || 12) }))
    return reply(429, { error: "Too many requests. Try again in a minute." })

  let body
  try {
    body = await request.json()
  } catch {
    return reply(400, { error: "Body must be JSON" })
  }
  const images = cleanImages(body?.images)
  if (typeof images === "string") return reply(images === "Photo too large" ? 413 : 400, { error: images })
  // photos cost more to read, so they get their own, tighter per-IP limit
  if (images.length && (await limited(request, env, { name: "photo", binding: env.PHOTO_LIMIT, perMinute: Number(env.NILOBS_PHOTO_PER_MINUTE || 4) })))
    return reply(429, { error: "Too many photo checks. Try again in a minute." })
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
  const chars = clean.reduce((n, m) => n + m.content.length, 0)
  if (chars > MAX_INPUT_CHARS) return reply(413, { error: "Too long" })
  if (meter) {
    const deny = await meter.begin(body, { tier, images: images.length, chars })
    if (deny) return deny
  }
  const jsonOnly = meter ? meter.json : false
  const messages = []
  for (const m of clean) {
    const last = messages[messages.length - 1]
    if (last && last.role === m.role) last.content += "\n\n" + m.content
    else messages.push({ ...m })
  }
  if (images.length) {
    const last = messages[messages.length - 1]
    last.content = [...images, { type: "text", text: last.content }]
  }

  let upstream
  try {
    upstream = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        // photos always go to the main (vision) model, never the quick one
        model: images.length && tier === "quick" ? models.default : models[tier],
        max_tokens: MAX_TOKENS[tier],
        system: body?.json || jsonOnly ? SYSTEM + " Reply with only the JSON value requested, with no other text." : SYSTEM,
        messages,
        output_config: { effort: EFFORT[tier] },
        stream: true,
      }),
    })
  } catch {
    await meter?.returned()
    return reply(502, { error: "Could not reach the AI service" })
  }
  if (!upstream.ok || !upstream.body) {
    await meter?.returned()
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
  let sent = false // has any of the answer reached the user?
  let finished = false
  const stream = new ReadableStream({
    async start(controller) {
      let buf = ""
      let whole = "" // JSON replies are held back until they're complete and valid
      const fail = (code) => controller.enqueue(enc.encode(ERR + JSON.stringify({ code })))
      const send = async (text) => {
        if (!sent) {
          sent = true
          await meter?.delivered() // record the delivery before the user has anything
        }
        controller.enqueue(enc.encode(text))
      }
      const finish = async (failed) => {
        finished = true
        if (jsonOnly) {
          const r = failed ? { ok: false } : parseJsonReply(whole)
          if (!r.ok) {
            await meter?.returned()
            fail(failed || "invalid_json")
          } else if (meter?.item === "photo" && r.v && r.v.relevant === false) {
            // not a ship photo: say only that, and let the charge be refunded
            await meter?.returned()
            controller.enqueue(enc.encode('{"relevant":false,"findings":[]}'))
          } else await send(whole)
        } else if (failed) {
          if (!sent) await meter?.returned()
          fail(failed)
        } else if (!sent) await meter?.returned()
        controller.close()
      }
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
            if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
              if (jsonOnly) whole += ev.delta.text
              else await send(ev.delta.text)
            } else if (ev.type === "error") {
              await finish(ev.error?.type === "overloaded_error" ? "rate_limited" : "upstream_error")
              return
            }
          }
        }
      } catch {
        if (!finished) await finish("upstream_error")
        return
      }
      if (!finished) await finish(null)
    },
    cancel() {
      reader.cancel().catch(() => {})
      // the user stopped it: if nothing was delivered, the call is given back
      if (!sent && meter) {
        const p = meter.returned()
        if (ctx?.waitUntil) ctx.waitUntil(p)
      }
    },
  })
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } })
}
