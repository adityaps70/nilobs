// Certificates of completion (the rules are in app/src/cert.ts, shared with the app).
//
//   GET  /api/cert          what's done so far, and your certificate if you have one (signed in)
//   POST /api/cert { name } issue it (or change the name on it) once everything is done
//   GET  /c/<id>            the certificate itself: public, printable, and the way anyone can check it's real
//
// It records self-study in NilObs from the account's synced progress. It isn't an official, STCW or OCIMF
// certificate, and the page says so.
import { CERT_TITLE, certChecks, certReady, cleanCertName } from "../app/src/cert.ts"
import { ROLES } from "../app/src/roles.ts"
import { json } from "./live.js"

const ROLE = new Map(ROLES.map((r) => [r.id, r]))
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS certs (id TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, issued_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, summary TEXT)",
]
const ready = new WeakMap() // per D1 binding: the tables are created once
export function ensureCertSchema(db) {
  let p = ready.get(db)
  if (!p) {
    p = db.batch(SCHEMA.map((q) => db.prepare(q))).catch((e) => {
      ready.delete(db)
      throw e
    })
    ready.set(db, p)
  }
  return p
}
export const resetCertSchemaFlag = () => {} // (kept for tests; the tables are tracked per database)

const ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const newId = () => [...crypto.getRandomValues(new Uint8Array(10))].map((x) => ID_CHARS[x % ID_CHARS.length]).join("")
const parse = (s, d) => {
  try {
    return s == null ? d : JSON.parse(s)
  } catch {
    return d
  }
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
const roleName = (p) => (p?.rank === "Other" ? String(p.roleName || "").trim().slice(0, 30) || "Crew" : ROLE.get(p?.rank)?.name || "Crew")

async function stateOf(db, userId) {
  const row = await db.prepare("SELECT json_extract(data, '$.progress') AS progress, json_extract(data, '$.extras.\"sr.profile\".v') AS profile FROM user_state WHERE user_id = ?").bind(userId).first()
  return { progress: parse(row?.progress, {}), profile: parse(row?.profile, {}) }
}
const certView = (c) => (c ? { id: c.id, name: c.name, role: c.role, issued: c.issued_at, url: `/c/${c.id}` } : null)

export async function handleCert(request, env, user, now = Date.now()) {
  if (!user) return json(401, { error: "Sign in first" })
  const db = env.DB
  await ensureCertSchema(db)
  const mine = await db.prepare("SELECT * FROM certs WHERE user_id = ?").bind(user.id).first()
  const { progress, profile } = await stateOf(db, user.id)
  const checks = certChecks(progress, profile)
  if (request.method === "GET") return json(200, { checks, ready: certReady(checks), cert: certView(mine) })
  if (request.method !== "POST") return json(405, { error: "Use GET or POST" })
  let body = {}
  try {
    body = await request.json()
  } catch {
    return json(400, { error: "Body must be JSON" })
  }
  const name = cleanCertName(body?.name)
  if (!name) return json(400, { error: "Write your name as it should appear: 2 to 60 letters." })
  if (!mine && !certReady(checks)) return json(409, { error: "Finish everything on the list first. Progress you make on another device can take a minute to sync.", checks })
  const summary = JSON.stringify({ drills: checks.find((c) => c.id === "drills")?.have || 0, topics: checks.find((c) => c.id === "topics")?.need || 0, interview: checks.find((c) => c.id === "interview")?.have || 0 })
  if (mine) {
    await db.prepare("UPDATE certs SET name = ?, updated_at = ? WHERE id = ?").bind(name, now, mine.id).run()
  } else {
    await db.prepare("INSERT INTO certs (id, user_id, name, role, issued_at, updated_at, summary) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(newId(), user.id, name, roleName(profile), now, now, summary).run()
  }
  return json(200, { checks, ready: true, cert: certView(await db.prepare("SELECT * FROM certs WHERE user_id = ?").bind(user.id).first()) })
}

/** GET /c/<id>: the certificate page. Anyone with the link can see it (that's how an employer checks it). */
export async function handleCertPage(request, env) {
  const id = String(new URL(request.url).pathname.split("/")[2] || "").toUpperCase()
  let c = null
  if (/^[A-Z0-9]{10}$/.test(id) && env.DB) {
    await ensureCertSchema(env.DB)
    c = await env.DB.prepare("SELECT * FROM certs WHERE id = ?").bind(id).first()
  }
  const nonce = crypto.randomUUID().replace(/-/g, "")
  const s = parse(c?.summary, {})
  const when = c ? new Date(c.issued_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : ""
  const body = c
    ? `<div class="cert">
<div class="brand">NilObs</div>
<div class="kicker">Certificate of completion</div>
<div class="presented">This records that</div>
<h1>${esc(c.name)}</h1>
<div class="role">${esc(c.role)}</div>
<p class="what">completed the <b>${esc(CERT_TITLE)}</b> in NilObs: practice in every inspection topic for this role, ${esc(s.drills || 7)} daily drills, and an AI inspector session scored ${esc(s.interview || 6)}/10.</p>
<div class="foot"><div><div class="label">Issued</div><div>${esc(when)}</div></div><div><div class="label">Certificate no.</div><div>${esc(c.id)}</div></div><div><div class="label">Check it at</div><div>nilobs.com/c/${esc(c.id)}</div></div></div>
<p class="fine">Issued by NilObs (Sea N Shore IT Solutions LLP) from self-study recorded in the app. This is not an official, STCW or flag-state certificate, and NilObs is not affiliated with OCIMF.</p>
</div>`
    : `<div class="cert"><div class="brand">NilObs</div><h1 style="font-size:28px">No certificate with that number</h1><p class="what">Check the link or number. Certificates are removed if the account that earned them is deleted.</p></div>`
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${c ? `Certificate: ${esc(c.name)}` : "Certificate not found"} · NilObs</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eef3f8;color:#10233b;font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.bar{max-width:900px;margin:16px auto 0;display:flex;justify-content:space-between;gap:8px;padding:0 16px;align-items:center}
.bar a{color:#0b6bcb;font-weight:600;text-decoration:none}
button{height:40px;border-radius:10px;border:0;background:#0b6bcb;color:#fff;font-weight:600;padding:0 16px;font-size:14px;cursor:pointer}
.cert{max-width:900px;margin:16px auto 32px;background:#fff;border:10px solid #0b2f57;outline:2px solid #c9a227;outline-offset:-18px;border-radius:6px;padding:56px 48px;text-align:center}
.brand{font-weight:800;letter-spacing:.08em;color:#0b6bcb;font-size:18px}
.kicker{margin-top:18px;text-transform:uppercase;letter-spacing:.18em;font-size:13px;color:#8a6d12;font-weight:700}
.presented{margin-top:28px;color:#5b6b80}
h1{font-family:Georgia,"Times New Roman",serif;font-size:44px;margin:8px 0 4px;line-height:1.15;word-break:break-word}
.role{color:#5b6b80;font-weight:600}
.what{max-width:620px;margin:22px auto 0;font-size:16px}
.foot{display:flex;justify-content:center;gap:40px;flex-wrap:wrap;margin-top:36px;font-size:14px}
.label{font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;color:#8193a8;font-weight:700}
.fine{margin-top:28px;font-size:12px;color:#7a8a9e;max-width:620px;margin-left:auto;margin-right:auto}
@media (max-width:640px){.cert{padding:32px 18px;border-width:6px;outline-offset:-12px}h1{font-size:32px}}
@media print{@page{size:A4 landscape;margin:10mm}body{background:#fff}.bar{display:none}.cert{margin:0 auto;max-width:none}}
</style></head><body>
<div class="bar"><a href="https://nilobs.com">← nilobs.com</a>${c ? '<button type="button" id="print">Print or save as PDF</button>' : ""}</div>
${body}
<script nonce="${nonce}">var b=document.getElementById("print");if(b)b.addEventListener("click",function(){window.print()})</script>
</body></html>`
  return new Response(html, {
    status: c ? 200 : 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
      "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
      "referrer-policy": "no-referrer",
    },
  })
}
