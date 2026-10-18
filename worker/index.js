// NilObs on Cloudflare Workers: static site from ./public, plus the AI endpoint.
import { handleAi } from "./ai.js"

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === "/api/ai") return handleAi(request, env)
    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ ok: true, ai: Boolean(env.ANTHROPIC_API_KEY) }), { headers: { "content-type": "application/json", "cache-control": "no-store" } })
    }
    return env.ASSETS.fetch(request)
  },
}
