// Sending email (sign-in codes). Two ways, whichever is set up:
//  - Cloudflare Email Service: a "send_email" binding called EMAIL (wrangler.jsonc or the dashboard). Sending to
//    any address needs the Workers Paid plan and nilobs.com onboarded under Compute → Email Service.
//  - Resend (resend.com): the secret RESEND_API_KEY, with nilobs.com verified there (free for 3,000 emails a month).
// The sender is NILOBS_EMAIL_FROM, by default "NilObs <signin@nilobs.com>".

export const emailReady = (env) => !!(env.EMAIL?.send || env.RESEND_API_KEY)

/** "NilObs <signin@nilobs.com>" → { name, email } */
export function sender(env) {
  const raw = String(env.NILOBS_EMAIL_FROM || "NilObs <signin@nilobs.com>").trim()
  const m = raw.match(/^(.*)<([^>]+)>$/)
  return m ? { name: m[1].trim().replace(/^"|"$/g, ""), email: m[2].trim() } : { name: "NilObs", email: raw }
}

export async function sendEmail(env, { to, subject, text, html }, fetchImpl = fetch) {
  const from = sender(env)
  if (env.EMAIL?.send) {
    await env.EMAIL.send({ to, from: { email: from.email, name: from.name }, subject, text, html })
    return
  }
  if (env.RESEND_API_KEY) {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: `${from.name} <${from.email}>`, to: [to], subject, text, html }),
    })
    if (!res.ok) throw new Error(`resend ${res.status}`)
    return
  }
  throw new Error("no email sender")
}
