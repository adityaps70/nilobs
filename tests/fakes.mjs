// Test doubles for the Worker: D1 on top of Node's built-in SQLite, and Google ID tokens signed with a local key.
import { DatabaseSync } from "node:sqlite"
import { webcrypto as crypto } from "node:crypto"

export function fakeD1() {
  const db = new DatabaseSync(":memory:")
  const exec = (sql, args) => {
    const p = db.prepare(sql)
    return /^\s*select/i.test(sql) ? p.all(...args) : p.run(...args)
  }
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ success: true, meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    _exec: () => exec(sql, args),
  })
  return { prepare: (sql) => stmt(sql), batch: async (list) => list.map((s) => s._exec()), sqlite: db }
}

const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

/** A fake Google: its public keys (JWKS) and a function that signs ID tokens like Google does. */
export async function fakeGoogle(kid = "test-key-1") {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey)
  const jwks = { keys: [{ kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", use: "sig", kid }] }
  async function sign(claims, opts = {}) {
    const now = Math.floor(Date.now() / 1000)
    const head = b64u(JSON.stringify({ alg: "RS256", kid: opts.kid || kid, typ: "JWT" }))
    const body = b64u(JSON.stringify({ iss: "https://accounts.google.com", iat: now, exp: now + 3600, email_verified: true, ...claims }))
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(head + "." + body))
    return `${head}.${body}.${b64u(sig)}`
  }
  return { jwks, sign }
}
