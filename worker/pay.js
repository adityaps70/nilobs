// Real payments, through Razorpay. Prices come only from app/src/economy.ts (never from the browser), and
// credits are added only once Razorpay says the money was captured:
//
//   POST /api/pay/order             creates a Razorpay order at the server's price; the browser opens
//                                   Razorpay Checkout for that order.
//   POST /api/pay/razorpay/confirm  the browser hands back Razorpay's payment id and signature. The signature
//                                   (HMAC-SHA256 of "order_id|payment_id" with the key secret) is checked, then
//                                   Razorpay's API is asked about the payment itself (amount, currency, order,
//                                   captured). An authorized payment is captured here.
//   POST /api/pay/razorpay/webhook  Razorpay's own notification (signed: HMAC-SHA256 of the raw body with the
//                                   webhook secret, in X-Razorpay-Signature), which covers a closed tab.
//
// Each payment is credited once: a "pay:<id>" claim in the wallet, saved with the version check, means a
// second confirmation (browser + webhook) does nothing.
//
// Secrets (Cloudflare → nilobs → Settings → Variables and Secrets): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and
// RAZORPAY_WEBHOOK_SECRET (the secret typed when adding the webhook in Razorpay). Test keys (rzp_test_…) take
// test payments; live keys (rzp_live_…) take real ones. RAZORPAY_CURRENCIES is "INR", or "INR,USD" once
// Razorpay has turned on international payments for the account.
import * as E from "../app/src/economy.ts"
import { reply } from "./guard.js"
import { HttpError, checkoutModes, ensureWalletSchema, errorReply, mutate, readWallet, view } from "./wallet.js"
import { applyFleet, fleetOrder, parseFleetKey } from "./crews.js"

const API = "https://api.razorpay.com/v1"
const enc = new TextEncoder()

const auth = (env) => "Basic " + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)
const razorpay = (env, fetchImpl, path, init = {}) =>
  fetchImpl(`${API}${path}`, { ...init, headers: { authorization: auth(env), "content-type": "application/json", ...(init.headers || {}) } })
export const razorpayReady = (env) => !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)
export const razorpayMode = (env) => (String(env.RAZORPAY_KEY_ID || "").startsWith("rzp_live_") ? "live" : "test")

/* ---------------- signatures ---------------- */
/** Hex HMAC-SHA256, as Razorpay signs both payments and webhooks. */
export async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(text)))
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("")
}
/** Compares two strings without leaking where they differ. */
function same(a, b) {
  a = String(a || "")
  b = String(b || "")
  if (!a || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/* ---------------- crediting a payment (once) ---------------- */
async function grant(env, pay, paymentRef, paid) {
  // `paid` is what the provider says was paid, in paise or cents
  if (paid && (Number(paid.amount) !== Number(pay.amount) || String(paid.currency || pay.currency).toUpperCase() !== pay.currency))
    throw new HttpError(400, "Amount doesn't match the order", "amount_mismatch")
  const via = pay.provider === "razorpay" ? "Razorpay" : "test"
  if (String(pay.product).startsWith("fleet:")) {
    // a fleet plan: the seats go to the crew (worker/crews.js); marking the payment paid is the once-only claim
    const r = await env.DB.prepare("UPDATE payments SET status = 'paid', paid_at = ?, payment_ref = ? WHERE id = ? AND status != 'paid'").bind(Date.now(), String(paymentRef || ""), pay.id).run()
    if (r?.meta?.changes === 1 && !(await applyFleet(env.DB, pay.product))) console.error("fleet payment not applied", pay.id, pay.product)
    return { already: r?.meta?.changes !== 1 }
  }
  const out = await mutate(env, pay.user_id, (d, now) => {
    const claim = `pay:${pay.id}`
    if (d.claims.includes(claim)) return { already: true }
    const paidWith = `${E.fmtPrice(pay.amount / 100, pay.currency)} via ${via}`
    const r = E.grantPurchase(d.w, pay.product, pay.currency, now, paidWith)
    if (r.ok) d.w = r.state
    else {
      // paid, but the plan can no longer be applied (e.g. a higher plan was bought meanwhile): keep the value as credits
      const p = E.product(pay.product)
      d.w = E.earn(d.w, p?.credits || 0, `${p?.name || "Purchase"} (${paidWith}): added as credits`, now)
      const b = d.w.buckets[d.w.buckets.length - 1]
      if (b) b.expires = null
    }
    d.claims = [...d.claims, claim]
    return { already: false }
  })
  await env.DB.prepare("UPDATE payments SET status = 'paid', paid_at = ?, payment_ref = ? WHERE id = ? AND status != 'paid'").bind(Date.now(), String(paymentRef || ""), pay.id).run()
  return out
}
/** A payment that can never be credited (a wrong amount) is logged and marked instead. */
async function grantOrMark(env, pay, paymentRef, paid) {
  try {
    await grant(env, pay, paymentRef, paid)
  } catch (e) {
    if (e instanceof HttpError && e.code === "amount_mismatch") {
      console.error("payment amount mismatch", pay.id, JSON.stringify(paid), pay.amount, pay.currency)
      await env.DB.prepare("UPDATE payments SET status = 'mismatch', payment_ref = ? WHERE id = ? AND status != 'paid'").bind(String(paymentRef || ""), pay.id).run()
      return false
    }
    throw e
  }
  return true
}

const findPayment = (env, where, ...args) => env.DB.prepare(`SELECT * FROM payments WHERE ${where}`).bind(...args).first()
const MISMATCH = { error: "That payment didn't match the order. Email us and we'll sort it out.", code: "amount_mismatch" }

/**
 * Settle one Razorpay payment for our order: it must belong to the order, and be captured (an authorized
 * payment is captured now). Returns "paid", "pending", "failed" or "mismatch".
 */
async function settle(env, fetchImpl, pay, paymentId) {
  const res = await razorpay(env, fetchImpl, `/payments/${encodeURIComponent(paymentId)}`)
  let p = await res.json().catch(() => null)
  if (!res.ok || !p) throw new HttpError(502, "Couldn't reach Razorpay. Your payment is safe; refresh in a minute.", "provider_error")
  if (p.order_id !== pay.ref) throw new HttpError(400, "That payment belongs to another order", "wrong_order")
  if (p.status === "authorized") {
    const cap = await razorpay(env, fetchImpl, `/payments/${encodeURIComponent(paymentId)}/capture`, { method: "POST", body: JSON.stringify({ amount: pay.amount, currency: pay.currency }) })
    const c = await cap.json().catch(() => null)
    if (cap.ok && c) p = c
  }
  if (p.status === "captured") return (await grantOrMark(env, pay, p.id, { amount: p.amount, currency: p.currency })) ? "paid" : "mismatch"
  return p.status === "failed" ? "failed" : "pending"
}

/** No payment id in hand (a reload, a closed pop-up): ask Razorpay about the order and its payments. */
async function settleOrder(env, fetchImpl, pay) {
  const res = await razorpay(env, fetchImpl, `/orders/${encodeURIComponent(pay.ref)}/payments`)
  const out = await res.json().catch(() => null)
  if (!res.ok || !out) throw new HttpError(502, "Couldn't reach Razorpay. Your payment is safe; refresh in a minute.", "provider_error")
  const items = Array.isArray(out.items) ? out.items : []
  const good = items.find((x) => x.status === "captured") || items.find((x) => x.status === "authorized")
  if (good) return settle(env, fetchImpl, pay, good.id)
  return items.length && items.every((x) => x.status === "failed") ? "failed" : "pending"
}

/* ---------------- routes ---------------- */
export async function handlePay(request, env, user, fetchImpl = fetch) {
  const url = new URL(request.url)
  const path = url.pathname
  await ensureWalletSchema(env.DB)
  try {
    // Razorpay's notification comes from Razorpay, not from a signed-in browser
    if (path === "/api/pay/razorpay/webhook") return await razorpayWebhook(request, env)
    if (!user) return reply(401, { error: "Sign in to buy" })
    if (path === "/api/pay/receipts" && request.method === "GET") return reply(200, { receipts: await receiptsOf(env, user.id) })
    if (request.method !== "POST") return reply(405, { error: "Use POST" })
    let body = {}
    try {
      body = await request.json()
    } catch {
      return reply(400, { error: "Body must be JSON" })
    }

    if (path === "/api/pay/order") {
      const cur = body?.currency === "USD" ? "USD" : "INR"
      const key = String(body?.product || "")
      let p
      if (key.startsWith("fleet:")) {
        // a fleet plan for a crew this user owns (priced by app/src/economy.ts fleetQuote)
        const q = await fleetOrder(env.DB, user, key, cur)
        if (!q.ok) return reply(409, { error: q.why, code: "cannot_buy" })
        p = { name: q.name, price: { [cur]: q.amount } }
      } else {
        p = E.product(key)
        if (!p) return reply(400, { error: "Unknown product", code: "bad_product" })
        const { data } = await readWallet(env, user.id)
        const can = E.canBuy(data.w, key, Date.now())
        if (!can.ok) return reply(409, { error: can.why, code: "cannot_buy" })
      }
      const mode = checkoutModes(env)[cur]
      if (!mode) return reply(503, { error: cur === "INR" ? "Payments in rupees aren't open yet." : "Payments in dollars aren't open yet. You can pay in rupees with an international card.", code: "payments_closed" })
      const amount = Math.round(p.price[cur] * 100) // paise or cents
      const id = "pay_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20)
      const now = Date.now()
      if (mode === "simulated") {
        await env.DB.prepare("INSERT INTO payments (id, user_id, provider, ref, product, currency, amount, status, created_at) VALUES (?, ?, 'simulated', ?, ?, ?, ?, 'created', ?)").bind(id, user.id, id, key, cur, amount, now).run()
        await grant(env, { id, user_id: user.id, provider: "simulated", product: key, currency: cur, amount }, id)
        const w = await readWallet(env, user.id)
        return reply(200, { provider: "simulated", ...view(env, w.data, w.version) })
      }
      const res = await razorpay(env, fetchImpl, "/orders", {
        method: "POST",
        body: JSON.stringify({ amount, currency: cur, receipt: id, notes: { product: key, pay: id, item: p.name.slice(0, 200) } }),
      })
      const out = await res.json().catch(() => null)
      if (!res.ok || !out?.id) {
        console.error("razorpay order", res.status, out?.error?.code, out?.error?.description)
        return reply(502, { error: "Couldn't start the payment. Try again.", code: "provider_error" })
      }
      await env.DB.prepare("INSERT INTO payments (id, user_id, provider, ref, product, currency, amount, status, created_at) VALUES (?, ?, 'razorpay', ?, ?, ?, ?, 'created', ?)").bind(id, user.id, out.id, key, cur, amount, now).run()
      return reply(200, {
        provider: "razorpay",
        orderId: id,
        razorpayOrderId: out.id,
        keyId: env.RAZORPAY_KEY_ID, // the public half of the keys: Checkout needs it
        amount,
        currency: cur,
        description: p.name,
        prefill: { name: String(user.name || "").slice(0, 100), email: String(user.email || "").slice(0, 100) },
        mode: razorpayMode(env),
      })
    }

    if (path === "/api/pay/razorpay/confirm") {
      if (!razorpayReady(env)) return reply(503, { error: "Razorpay isn't set up", code: "payments_closed" })
      const orderId = String(body?.orderId || "")
      const pay = await findPayment(env, "provider = 'razorpay' AND id = ? AND user_id = ?", orderId, user.id)
      if (!pay) return reply(404, { error: "No such order", code: "no_order" })
      if (pay.status === "mismatch") return reply(409, MISMATCH)
      if (pay.status !== "paid") {
        const paymentId = String(body?.paymentId || "")
        let state
        if (paymentId) {
          // Checkout's signature proves this payment id came from Razorpay for this order
          const want = await hmacHex(env.RAZORPAY_KEY_SECRET, `${pay.ref}|${paymentId}`)
          if (!same(body?.signature, want)) return reply(400, { error: "That payment couldn't be verified.", code: "bad_signature" })
          state = await settle(env, fetchImpl, pay, paymentId)
        } else state = await settleOrder(env, fetchImpl, pay)
        if (state === "mismatch") return reply(409, MISMATCH)
        if (state !== "paid") return reply(200, { status: state })
      }
      const w = await readWallet(env, user.id)
      return reply(200, { status: "paid", ...view(env, w.data, w.version) })
    }

    return reply(404, { error: "Not found" })
  } catch (e) {
    return errorReply(e)
  }
}

async function razorpayWebhook(request, env) {
  if (request.method !== "POST") return reply(405, { error: "Use POST" })
  const raw = await request.text()
  if (!env.RAZORPAY_WEBHOOK_SECRET) return reply(503, { error: "Razorpay webhook isn't set up" })
  if (!same(request.headers.get("x-razorpay-signature"), await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw))) return reply(400, { error: "Bad signature" })
  let ev
  try {
    ev = JSON.parse(raw)
  } catch {
    return reply(400, { error: "Bad body" })
  }
  const payment = ev?.payload?.payment?.entity
  if ((ev?.event === "payment.captured" || ev?.event === "order.paid") && payment?.status === "captured") {
    const orderId = String(payment.order_id || ev?.payload?.order?.entity?.id || "")
    const pay = orderId ? await findPayment(env, "provider = 'razorpay' AND ref = ?", orderId) : null
    if (pay) await grantOrMark(env, pay, payment.id, { amount: payment.amount, currency: payment.currency })
  }
  return reply(200, { ok: true })
}

/* ---------------- receipts ---------------- */
export const billingName = (env) => String(env.NILOBS_BILLING_NAME || "Sea N Shore IT Solutions LLP")
export const supportEmail = (env) => String(env.NILOBS_SUPPORT_EMAIL || "adityaps700@gmail.com")
/** What a payment was for, in words. */
export function itemName(key) {
  const f = parseFleetKey(key)
  if (f) {
    const term = f.cycle === "annual" ? "1 year" : "1 month"
    return f.action === "add" ? `Fleet plan: ${f.seats} more seat${f.seats === 1 ? "" : "s"}` : f.action === "renew" ? `Fleet plan renewal (${term})` : `Fleet plan: ${f.seats} seats, ${term}`
  }
  return E.product(key)?.name || "NilObs purchase"
}
async function receiptsOf(env, userId) {
  const rows = (await env.DB.prepare("SELECT id, provider, product, currency, amount, payment_ref, created_at, paid_at FROM payments WHERE user_id = ? AND status = 'paid' ORDER BY paid_at DESC LIMIT 100").bind(userId).all()).results || []
  return rows.map((r) => ({ id: r.id, at: r.paid_at || r.created_at, item: itemName(r.product), amount: r.amount / 100, currency: r.currency, provider: r.provider, ref: r.payment_ref || "" }))
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])

/** GET /receipt/<payment id>: a printable receipt, for the account that paid. Everyone else gets "not found". */
export async function handleReceipt(request, env, user) {
  const id = decodeURIComponent(new URL(request.url).pathname.split("/")[2] || "")
  if (!user || !/^pay_[A-Za-z0-9]{6,40}$/.test(id)) return env.ASSETS.fetch(new Request(new URL("/404", request.url)))
  await ensureWalletSchema(env.DB)
  const r = await env.DB.prepare("SELECT * FROM payments WHERE id = ? AND user_id = ? AND status = 'paid'").bind(id, user.id).first()
  if (!r) return env.ASSETS.fetch(new Request(new URL("/404", request.url)))
  const nonce = crypto.randomUUID().replace(/-/g, "")
  const when = new Date(r.paid_at || r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
  const money = E.fmtPrice(r.amount / 100, r.currency)
  const addr = env.NILOBS_BILLING_ADDRESS ? `<div>${esc(env.NILOBS_BILLING_ADDRESS)}</div>` : "<div>India</div>"
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Receipt ${esc(r.id)} · NilObs</title>
<style>
:root{--ink:#10233b;--mute:#5b6b80;--line:#d9e1ea;--accent:#0b6bcb}
*{box-sizing:border-box}body{margin:0;background:#f3f6f9;color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:24px auto;background:#fff;border:1px solid var(--line);border-radius:16px;padding:32px}
h1{font-size:26px;margin:0}.top{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:16px;margin-bottom:16px}
.mute{color:var(--mute);font-size:13.5px}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{text-align:left;padding:10px 0;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12.5px;color:var(--mute);font-weight:600;text-transform:uppercase;letter-spacing:.04em}.r{text-align:right}.total td{font-weight:700;font-size:17px;border-bottom:0}
.paid{display:inline-block;background:#e6f6ee;color:#0a7a45;font-weight:700;border-radius:999px;padding:2px 10px;font-size:13px}
[contenteditable]{outline:1px dashed #b9c6d4;border-radius:4px;padding:0 4px;min-width:120px;display:inline-block}
.bar{max-width:720px;margin:16px auto 0;display:flex;gap:8px;justify-content:flex-end;padding:0 16px}
button{height:40px;border-radius:10px;border:0;background:var(--accent);color:#fff;font-weight:600;padding:0 16px;font-size:14px;cursor:pointer}
a{color:var(--accent)}
@media (max-width:600px){main{margin:12px;padding:20px}}
@media print{body{background:#fff}.bar,.hint{display:none}main{border:0;margin:0;max-width:none}[contenteditable]{outline:0}}
</style></head><body>
<div class="bar"><button type="button" id="print">Print or save as PDF</button></div>
<main>
<div class="top">
<div><h1>Receipt</h1><div class="mute">Receipt no. ${esc(r.id)}</div><div class="mute">Paid ${esc(when)}</div></div>
<div class="mute" style="text-align:right"><div style="color:var(--ink);font-weight:700">${esc(billingName(env))}</div><div>NilObs · nilobs.com</div>${addr}<div>${esc(supportEmail(env))}</div></div>
</div>
<div><b>Billed to</b><div>${esc(user.name || "")}${user.name ? " · " : ""}${esc(user.email || "")}</div>
<div class="mute">Company or name to show: <span contenteditable="true" aria-label="Company or name to show on the receipt"></span> <span class="hint">(type here before printing)</span></div></div>
<table><thead><tr><th>Item</th><th class="r">Amount</th></tr></thead><tbody>
<tr><td>${esc(itemName(r.product))}</td><td class="r">${esc(money)}</td></tr>
<tr class="total"><td>Total paid</td><td class="r">${esc(money)}</td></tr>
</tbody></table>
<p><span class="paid">Paid</span> <span class="mute">via ${r.provider === "razorpay" ? "Razorpay" : esc(r.provider)}${r.payment_ref ? ` · payment reference ${esc(r.payment_ref)}` : ""}</span></p>
<p class="mute">No GST was charged on this payment. This is a payment receipt, not a tax invoice. Refunds follow the policy at <a href="https://nilobs.com/refunds">nilobs.com/refunds</a>. Questions: ${esc(supportEmail(env))}.</p>
</main>
<script nonce="${nonce}">document.getElementById("print").addEventListener("click",function(){window.print()})</script>
</body></html>`
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
      "referrer-policy": "no-referrer",
    },
  })
}
