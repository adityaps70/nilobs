import { handleAi } from "./ai.js"
import { handleVoice } from "./voice.js"
import { authEnabled, getSession, handleAuth } from "./auth.js"
import { reply } from "./guard.js"

const AUTH_ROUTES = ["/api/auth/config", "/api/auth/google", "/api/auth/logout", "/api/me", "/api/state"]

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    // www.nilobs.com → nilobs.com, keeping the path, the query and the #app link
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4)
      return Response.redirect(url.toString(), 301)
    }
    // One address for everyone (Google sign-in is allowed there): the old workers.dev pages move to it
    const home = env.NILOBS_CANONICAL_HOST
    if (home && url.hostname.endsWith(".workers.dev") && request.method === "GET" && !url.pathname.startsWith("/api/")) {
      url.hostname = home
      url.protocol = "https:"
      url.port = ""
      return Response.redirect(url.toString(), 301)
    }
    // (Cloudflare's static assets already serve public/privacy.html at /privacy)
    if (AUTH_ROUTES.includes(url.pathname)) return handleAuth(request, env)
    if (url.pathname === "/api/ai" || url.pathname === "/api/voice") {
      // With Google sign-in set up, the AI features are for signed-in users only
      if (authEnabled(env) && request.method === "POST" && !(await getSession(request, env)))
        return reply(401, { error: "Sign in with Google to use the AI" })
      return url.pathname === "/api/ai" ? handleAi(request, env) : handleVoice(request, env)
    }
    if (url.pathname === "/api/health")
      return new Response(JSON.stringify({ ok: true, ai: Boolean(env.ANTHROPIC_API_KEY), voice: Boolean(env.RUMIK_API_KEY), signin: authEnabled(env) }), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      })
    return env.ASSETS.fetch(request)
  },
}
