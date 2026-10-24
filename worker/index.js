import { handleAi } from "./ai.js"
import { handleVoice } from "./voice.js"
import { authEnabled, getSession, handleAuth } from "./auth.js"
import { handleWallet, meter } from "./wallet.js"
import { handlePay } from "./pay.js"
import { handleAdmin } from "./admin.js"
import { limited, originAllowed, reply } from "./guard.js"

const AUTH_ROUTES = ["/api/auth/config", "/api/auth/google", "/api/auth/logout", "/api/me", "/api/state"]

export default {
  async fetch(request, env, ctx) {
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
    // The owner's analytics (only for ADMIN_EMAILS; everyone else gets "not found")
    if (url.pathname === "/admin" || url.pathname === "/admin/" || url.pathname.startsWith("/api/admin/")) return handleAdmin(request, env)
    // (Cloudflare's static assets already serve public/privacy.html at /privacy)
    if (AUTH_ROUTES.includes(url.pathname)) return handleAuth(request, env)
    // Cashfree's payment notifications (signed by Cashfree, no session)
    if (url.pathname === "/api/pay/cashfree/webhook") {
      if (!authEnabled(env)) return reply(404, { error: "Not set up" })
      return handlePay(request, env, null)
    }
    if (url.pathname === "/api/wallet" || url.pathname.startsWith("/api/wallet/") || url.pathname.startsWith("/api/pay/")) {
      if (!authEnabled(env)) return reply(404, { error: "Accounts aren't set up on this server" })
      if (request.method !== "GET" && !originAllowed(request, env)) return reply(403, { error: "Origin not allowed" })
      if (request.method !== "GET" && (await limited(request, env, { name: "wallet", binding: env.WALLET_LIMIT, perMinute: Number(env.NILOBS_WALLET_PER_MINUTE || 60) })))
        return reply(429, { error: "Too many requests. Try again in a minute." })
      if (url.pathname === "/api/pay/order" && (await limited(request, env, { name: "pay", binding: env.PAY_LIMIT, perMinute: Number(env.NILOBS_PAY_PER_MINUTE || 8) })))
        return reply(429, { error: "Too many payment attempts. Try again in a minute." })
      const s = await getSession(request, env)
      if (!s) return reply(401, { error: "Sign in first" })
      return url.pathname.startsWith("/api/pay/") ? handlePay(request, env, s.user) : handleWallet(request, env, s.user)
    }
    if (url.pathname === "/api/ai" || url.pathname === "/api/voice") {
      const isAi = url.pathname === "/api/ai"
      if (!authEnabled(env)) return isAi ? handleAi(request, env) : handleVoice(request, env)
      // With accounts set up, the AI is for signed-in users, and every call needs a paid ticket
      if (request.method !== "POST") return reply(405, { error: "Use POST" })
      const s = await getSession(request, env)
      if (!s) return reply(401, { error: "Sign in with Google to use the AI" })
      const m = meter(env, s.user.id, isAi ? "ai" : "voice")
      return isAi ? handleAi(request, env, fetch, m, ctx) : handleVoice(request, env, fetch, globalThis.caches?.default, m)
    }
    if (url.pathname === "/api/health")
      return new Response(JSON.stringify({ ok: true, ai: Boolean(env.ANTHROPIC_API_KEY), voice: Boolean(env.RUMIK_API_KEY), signin: authEnabled(env) }), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      })
    return env.ASSETS.fetch(request)
  },
}
