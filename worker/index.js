import { handleAi } from "./ai.js"
import { handleVoice } from "./voice.js"

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    // www.nilobs.com → nilobs.com, keeping the path, the query and the #app link
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4)
      return Response.redirect(url.toString(), 301)
    }
    if (url.pathname === "/api/ai") return handleAi(request, env)
    if (url.pathname === "/api/voice") return handleVoice(request, env)
    if (url.pathname === "/api/health")
      return new Response(JSON.stringify({ ok: true, ai: Boolean(env.ANTHROPIC_API_KEY), voice: Boolean(env.RUMIK_API_KEY) }), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      })
    return env.ASSETS.fetch(request)
  },
}
