// What the server charges and sells (app/src/economy.ts), and that it matches what the app shows.
import { test } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { fileURLToPath, pathToFileURL } from "node:url"
import * as esbuild from "esbuild"

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nilobs-buy-")), "economy.mjs")
await esbuild.build({ entryPoints: [path.join(here, "../src/economy.ts")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "warning" })
const E = await import(pathToFileURL(out).href)
const src = (f) => fs.readFileSync(path.join(here, "../src", f), "utf8")

const T0 = Date.UTC(2026, 9, 19, 9, 0, 0)
const D = E.DAY

test("every AI feature has a server price and an allowance", () => {
  const free = E.perks(E.fresh(T0), T0)
  for (const kind of Object.keys(E.ITEMS)) {
    const item = kind === "photo" ? { kind, n: 2 } : kind === "deck" ? { kind, id: "ecdis" } : kind === "story" ? { kind, id: 1 } : { kind }
    const cost = E.itemCost(item, free)
    if (kind === "askExpert") assert.equal(cost, null, "expert is Command-only")
    else assert.ok(cost > 0, kind)
  }
  assert.equal(E.itemCost({ kind: "photo", n: 2 }, free), 6, "per photo")
  assert.equal(E.itemCost({ kind: "photo", n: 9 }, free), null, "at most 3 photos")
  assert.equal(E.itemCost({ kind: "deck", id: "made-up" }, free), null)
  assert.equal(E.itemCost({ kind: "nope" }, free), null)
})

test("product keys and prices", () => {
  assert.equal(E.product("topup:t500").price.INR, 699)
  assert.equal(E.product("plan:watch:annual").price.USD, 70)
  assert.equal(E.product("pass").credits, E.PASS.credits)
  for (const bad of ["", "topup", "topup:t1", "plan:free:monthly", "plan:watch", "plan:watch:weekly", "pass:x", "gift"]) assert.equal(E.product(bad), null, bad)
  assert.equal(E.productKey("plan", "command", "annual"), "plan:command:annual")
  assert.equal(E.productKey("topup", "t150"), "topup:t150")
  assert.equal(E.productKey("pass"), "pass")
})

test("prepaid plans: buy, extend, refill, end", () => {
  let s = E.fresh(T0)
  let r = E.grantPurchase(s, "plan:watch:monthly", "INR", T0, "₹499 via Cashfree")
  assert.ok(r.ok)
  s = r.state
  assert.equal(E.balance(s, T0), 80 + 400)
  assert.equal(E.paidUntil(s), T0 + 30 * D)
  s = E.grantPurchase(s, "plan:watch:monthly", "INR", T0 + 5 * D, "").state
  assert.equal(E.paidUntil(s), T0 + 60 * D, "extended from the end, not from today")
  assert.equal(E.tick(s, T0 + 31 * D).plan.id, "watch", "still on in the second month")
  assert.equal(E.tick(s, T0 + 61 * D).plan.id, "free", "ends on its own")
  assert.equal(E.canBuy(s, "plan:watch:annual", T0 + 10 * D).ok, true)
  const before = E.balance(s, T0 + 10 * D)
  s = E.grantPurchase(s, "plan:command:monthly", "INR", T0 + 10 * D, "").state
  assert.equal(s.plan.id, "command")
  assert.equal(E.balance(s, T0 + 10 * D) - before, 400 + E.PLANS.command.credits, "Watch's unused second month kept as credits, plus Command's")
  assert.match(s.ledger[1].label, /1 unused month/)
  const lower = E.canBuy(s, "plan:watch:monthly", T0 + 11 * D)
  assert.equal(lower.ok, false)
  assert.match(lower.why, /Command/)
  assert.equal(E.grantPurchase(s, "plan:watch:monthly", "INR", T0 + 11 * D, "").ok, false)
  assert.equal(E.canBuy(s, "plan:watch:monthly", T0 + 41 * D).ok, true, "after Command ends")
  assert.equal(E.canBuy(s, "topup:t150", T0 + 11 * D).ok, true, "top-ups any time")
})

test("top-ups never expire; passes stack", () => {
  let s = E.grantPurchase(E.fresh(T0), "topup:t150", "USD", T0, "$3 via Cashfree").state
  assert.equal(E.balance(s, T0 + 400 * D), 150)
  s = E.grantPurchase(s, "pass", "INR", T0, "").state
  s = E.grantPurchase(s, "pass", "INR", T0 + D, "").state
  assert.equal(s.pass.until, T0 + 2 * E.PASS.days * D)
  assert.match(s.ledger[0].label, /Voyage pass/)
})

test("the server's deck prices match the app's decks", () => {
  const decks = [...src("fleet.ts").matchAll(/\{ id: "([a-z0-9-]+)", name: "[^"]*", sub: "[^"]*", cost: (\d+)/g)]
  assert.ok(decks.length >= 3)
  const paid = Object.fromEntries(decks.filter(([, , c]) => Number(c) > 0).map(([, id, c]) => [id, Number(c)]))
  assert.deepEqual(paid, E.PAID_DECKS)
})

test("the server's badge list matches the app's badges", () => {
  const block = src("progress.tsx").match(/export const BADGES[^=]*=\s*\[([\s\S]*?)\n\]/)
  assert.ok(block, "BADGES list found")
  const ids = [...block[1].matchAll(/\{ id: "([a-z0-9]+)"/g)].map((m) => m[1])
  assert.deepEqual([...ids].sort(), [...E.BADGE_IDS].sort())
})
