// POST /api/voice — reads short text aloud with Rumik text-to-speech (the AI inspector's studio voice).
// The browser never sees the Rumik key: it is the RUMIK_API_KEY secret on the Worker.
// Body: { text: string }  ->  audio/wav (24 kHz mono). Identical text is served from Cloudflare's cache.
import { limited, originAllowed, reply } from "./guard.js"

const MAX_CHARS = 600
const DEFAULT_URL = "https://silk-api.rumik.ai/v1/tts"

async function sha256(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

export async function handleVoice(request, env, fetchImpl = fetch, cache = globalThis.caches?.default) {
  if (request.method !== "POST") return reply(405, { error: "Use POST" })
  const key = env.RUMIK_API_KEY
  if (!key) return reply(503, { error: "Voice isn't set up on this server (missing RUMIK_API_KEY)" })
  if (!originAllowed(request, env)) return reply(403, { error: "Origin not allowed" })
  if (await limited(request, env, { name: "voice", binding: env.VOICE_LIMIT, perMinute: Number(env.NILOBS_VOICE_PER_MINUTE || 20) }))
    return reply(429, { error: "Too many requests. Try again in a minute." })

  let body
  try {
    body = await request.json()
  } catch {
    return reply(400, { error: "Body must be JSON" })
  }
  const text = String(body?.text ?? "").replace(/\s+/g, " ").trim()
  if (!text) return reply(400, { error: "No text" })
  if (text.length > MAX_CHARS) return reply(413, { error: `Keep it under ${MAX_CHARS} characters` })

  const model = env.NILOBS_VOICE_MODEL || "muga"
  const tone = env.NILOBS_VOICE_TONE || ""
  const payload = { text: model === "muga" && tone ? `[${tone}] ${text}` : text, model }
  if (env.NILOBS_VOICE_SPEAKER) payload.speaker = env.NILOBS_VOICE_SPEAKER
  if (env.NILOBS_VOICE_DESCRIPTION) payload.description = env.NILOBS_VOICE_DESCRIPTION

  const cacheKey = cache ? new Request(`https://voice-cache.nilobs.internal/${await sha256(JSON.stringify(payload))}`) : null
  if (cache && cacheKey) {
    const hit = await cache.match(cacheKey)
    if (hit) return new Response(hit.body, { headers: { "content-type": hit.headers.get("content-type") || "audio/wav", "cache-control": "no-store", "x-voice-cache": "hit" } })
  }

  let upstream
  try {
    upstream = await fetchImpl(env.NILOBS_VOICE_URL || DEFAULT_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
  } catch {
    return reply(502, { error: "Could not reach the voice service" })
  }
  if (!upstream.ok) {
    let detail = ""
    try {
      detail = (await upstream.text()).slice(0, 300)
    } catch {
      /* ignore */
    }
    console.error("Rumik TTS error", upstream.status, detail)
    if (upstream.status === 429) return reply(429, { error: "The voice service is busy. Try again shortly." })
    return reply(502, { error: upstream.status === 401 || upstream.status === 403 ? "The voice key was rejected" : "The voice service returned an error" })
  }
  const audio = await upstream.arrayBuffer()
  const type = upstream.headers.get("content-type") || "audio/wav"
  if (cache && cacheKey) {
    try {
      await cache.put(cacheKey, new Response(audio, { headers: { "content-type": type, "cache-control": "public, max-age=604800" } }))
    } catch {
      /* caching is best-effort */
    }
  }
  return new Response(audio, { headers: { "content-type": type, "cache-control": "no-store", "x-voice-cache": "miss" } })
}
