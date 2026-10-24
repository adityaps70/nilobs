import { handleAi } from "./ai.js"
import { handleVoice } from "./voice.js"
import { authEnabled, getSession, handleAuth } from "./auth.js"
import { handleWallet, meter } from "./wallet.js"
import { handlePay } from "./pay.js"
import { handleAdmin } from "./admin.js"
import { handleFeed, runFeed } from "./feed.js"
import { handlePush, runPush } from "./push.js"
import { handlePulse, runPulse } from "./pulse.js"
import { handleLeague } from "./league.js"
import { ensureLiveSchema } from "./live.js"
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
    // Razorpay's payment notifications (signed by Razorpay, no session)
    if (url.pathname === "/api/pay/razorpay/webhook") {
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
    // The live features: the industry feed (public), reminders, the inspection pulse and weekly leagues
    if (url.pathname === "/api/feed") return handleFeed(request, env, ctx)
    if (url.pathname.startsWith("/api/push/") || url.pathname === "/api/pulse" || url.pathname === "/api/league") {
      if (!authEnabled(env)) return reply(404, { error: "Accounts aren't set up on this server" })
      if (request.method !== "GET" && !originAllowed(request, env)) return reply(403, { error: "Origin not allowed" })
      if (await limited(request, env, { name: "live", binding: null, perMinute: Number(env.NILOBS_LIVE_PER_MINUTE || 60) })) return reply(429, { error: "Too many requests. Try again in a minute." })
      const s = url.pathname === "/api/push/key" ? null : await getSession(request, env)
      if (url.pathname.startsWith("/api/push/")) return handlePush(request, env, s?.user || null)
      if (url.pathname === "/api/pulse") return handlePulse(request, env, s?.user || null, ctx)
      return handleLeague(request, env, s?.user || null)
    }
    if (url.pathname === "/api/health")
      return new Response(JSON.stringify({ ok: true, ai: Boolean(env.ANTHROPIC_API_KEY), voice: Boolean(env.RUMIK_API_KEY), signin: authEnabled(env) }), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      })
    return env.ASSETS.fetch(request)
  },

  // Cron (wrangler.jsonc → triggers): every 15 minutes send the reminders that are due, and read the industry
  // sources whenever the last read is more than about 3 hours old (so a new deploy or a missed run catches up by
  // itself). Debriefs the AI couldn't check earlier are retried each time.
  async scheduled(event, env, ctx) {
    if (!env.DB) return
    const now = event?.scheduledTime || Date.now()
    let lastFeed = 0
    try {
      await ensureLiveSchema(env.DB)
      lastFeed = Number((await env.DB.prepare("SELECT MAX(last_run) AS t FROM feed_sources").first())?.t) || 0
    } catch {
      /* first run: no table yet */
    }
    const feedTime = event?.cron === "feed" || now - lastFeed > 165 * 60000
    const jobs = [
      runPush(env, now, fetch, feedTime ? 15 : 30).catch((e) => console.error("push run", e?.message || e)),
      runPulse(env).catch((e) => console.error("pulse run", e?.message || e)),
    ]
    if (feedTime) jobs.push(runFeed(env, now).then((r) => console.log("feed run", JSON.stringify(r))).catch((e) => console.error("feed run", e?.message || e)))
    ctx.waitUntil(Promise.all(jobs))
  },
}
