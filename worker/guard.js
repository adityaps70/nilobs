// Shared checks for the Worker's API routes: same-site origin and a per-IP rate limit.

export const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } })

/** Only the site itself (plus any origins listed in NILOBS_ALLOWED_ORIGINS) may call the API. */
export function originAllowed(request, env) {
  const self = new URL(request.url).origin
  const allowed = [self, ...String(env.NILOBS_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)]
  const origin = request.headers.get("origin")
  return !!origin && allowed.includes(origin)
}

export const clientIp = (request) =>
  request.headers.get("cf-connecting-ip") || (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown"

// Best-effort limit per IP, per Worker isolate. Add a rate-limit binding (see wrangler.jsonc) for a network-wide one.
const buckets = new Map()
function localLimited(key, perMinute) {
  const now = Date.now()
  const list = (buckets.get(key) || []).filter((t) => now - t < 60000)
  list.push(now)
  buckets.set(key, list)
  if (buckets.size > 5000) buckets.clear()
  return list.length > perMinute
}

/** True when this caller has made too many requests in the last minute. */
export async function limited(request, env, { name, binding, perMinute }) {
  const ip = clientIp(request)
  if (binding?.limit) {
    const { success } = await binding.limit({ key: `${name}:${ip}` })
    return !success
  }
  return localLimited(`${name}:${ip}`, perMinute)
}
