// Tests for merging two devices' copies of one account (app/src/sync.ts). Run: node --test app/tests/sync.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { fileURLToPath, pathToFileURL } from "node:url"
import * as esbuild from "esbuild"

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nilobs-sync-")), "sync.mjs")
await esbuild.build({
  stdin: { contents: 'export * from "@/sync"; export * as E from "@/economy"', resolveDir: here, loader: "ts" },
  bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "warning", alias: { "@": path.join(here, "../src") },
})
const S = await import(pathToFileURL(out).href)
const E = S.E
const T0 = Date.UTC(2026, 9, 19, 9, 0, 0)
const D = E.DAY
const copy = (x) => JSON.parse(JSON.stringify(x))
const bal = (w, t = T0 + D) => E.balance(w, t)

test("both devices spend from the same account: both spends count", () => {
  const base = E.fresh(T0) // 80 credits
  const a = E.spend(copy(base), 4, "Ask (deep)", T0 + 1000).state
  const b = E.spend(copy(base), 8, "AI inspector", T0 + 2000).state
  assert.equal(bal(a), 76)
  assert.equal(bal(b), 72)
  const m = S.mergeWallet(a, b)
  assert.equal(bal(m), 68)
  assert.equal(m.ledger.filter((e) => e.kind === "spend").length, 2)
  // merging is stable: doing it again changes nothing
  assert.equal(bal(S.mergeWallet(m, b)), 68)
  assert.equal(bal(S.mergeWallet(a, m)), 68)
})

test("a refund on one device brings the credits back after merging", () => {
  const base = E.fresh(T0)
  const spent = E.spend(copy(base), 8, "Photo check", T0 + 1000, "photos")
  const server = spent.state // the spend reached the server before the refund
  const local = E.refund(copy(spent.state), spent.entry, T0 + 5000, "photos")
  assert.equal(bal(S.mergeWallet(server, local)), 80)
  assert.equal(bal(S.mergeWallet(local, server)), 80)
})

test("the same monthly refill granted on two devices counts once", () => {
  const base = E.fresh(T0)
  const later = T0 + 31 * D
  const a = E.tick(copy(base), later)
  const b = E.tick(copy(base), later)
  const refillsA = a.buckets.filter((x) => x.kind === "monthly" && x.at > T0)
  assert.equal(refillsA.length, 1)
  assert.notEqual(refillsA[0].id, b.buckets.find((x) => x.kind === "monthly" && x.at > T0).id, "each device made its own bucket")
  const b2 = E.spend(b, 5, "Ask", later + 1000).state
  const m = S.mergeWallet(a, b2)
  assert.equal(m.buckets.filter((x) => x.kind === "monthly" && x.at > T0).length, 1)
  assert.equal(E.balance(m, later + 2000), 15, "20 new credits, 5 spent; welcome and the first month have expired")
  assert.equal(m.ledger.filter((e) => e.kind === "plan" && e.delta > 0).length, 1, "refill logged once")
})

test("purchases, unlocks and plan changes from either side survive", () => {
  const base = E.fresh(T0)
  const a = E.subscribe(copy(base), "watch", "monthly", "INR", T0 + 1000)
  const b = E.buyTopUp(copy(base), E.TOPUPS[0], "INR", T0 + 2000)
  b.unlocked = [3]
  const m = S.mergeWallet(a, b)
  assert.equal(m.plan.id, "watch")
  assert.ok(m.buckets.some((x) => x.kind === "topup"))
  assert.deepEqual(m.unlocked, [3])
  assert.equal(bal(m, T0 + 3000), 80 + 400 + 150)
})

test("first sign-in on a device used signed-out: the account wins, purchases are added, free credits don't stack", () => {
  const account = E.spend(E.fresh(T0), 30, "AI inspector", T0 + 1000).state // 50 left
  let device = E.fresh(T0 + 5 * D) // its own 80 free credits
  device = E.buyTopUp(device, E.TOPUPS[0], "USD", T0 + 5 * D + 1000) // +150
  device = E.spend(device, 5, "Story", T0 + 5 * D + 2000).state
  const m = S.adoptWallet(account, device)
  const t = T0 + 5 * D + 3000
  assert.equal(E.balance(m, t), 50 + 150)
  assert.equal(m.buckets.filter((x) => x.kind === "welcome").length, 1)
  assert.ok(m.ledger.some((e) => e.kind === "purchase"))
  assert.equal(m.paid, 1)
  // a plan bought while signed out comes along
  const dev2 = E.subscribe(E.fresh(T0 + D), "command", "monthly", "INR", T0 + D + 10)
  const m2 = S.adoptWallet(account, dev2)
  assert.equal(m2.plan.id, "command")
  assert.equal(E.balance(m2, T0 + D + 20), 50 + 1500)
})

test("progress never goes backwards", () => {
  const a = { xp: 500, streak: { n: 4, last: "2026-10-18", best: 9, freezes: 1 }, stats: { cards: 40, spot: 3 }, badges: { first: "2026-10-01" }, read: [1, 2], srs: { 5: [2, 100], 6: [1, 90] }, missions: { day: "2026-10-19", cards: 3, spot: 5, read: 0, claimed: false }, interviews: [{ at: 1, avg: 6 }], topic: { Cargo: { c: [1, 2], s: [0, 0], i: [0, 0] } }, levelPaid: 2 }
  const b = { xp: 420, streak: { n: 5, last: "2026-10-19", best: 5, freezes: 0 }, stats: { cards: 35, spot: 9 }, badges: { first: "2026-09-20", eye10: "2026-10-19" }, read: [2, 7], srs: { 5: [3, 104] }, missions: { day: "2026-10-19", cards: 10, spot: 1, read: 1, claimed: true }, interviews: [{ at: 2, avg: 8 }, { at: 1, avg: 6 }], topic: { Cargo: { c: [3, 5], s: [1, 1], i: [0, 0] } }, levelPaid: 1 }
  const m = S.mergeProgress(a, b)
  assert.equal(m.xp, 500)
  assert.deepEqual(m.streak, { n: 5, last: "2026-10-19", best: 9, freezes: 0 })
  assert.deepEqual(m.stats, { cards: 40, spot: 9 })
  assert.deepEqual(m.badges, { first: "2026-09-20", eye10: "2026-10-19" })
  assert.deepEqual(m.read.sort(), [1, 2, 7])
  assert.deepEqual(m.srs, { 5: [3, 104], 6: [1, 90] })
  assert.deepEqual(m.missions, { day: "2026-10-19", cards: 10, spot: 5, read: 1, claimed: true })
  assert.equal(m.interviews.length, 2)
  assert.deepEqual(m.topic.Cargo.c, [3, 5])
  assert.equal(m.levelPaid, 2)
  assert.deepEqual(S.mergeProgress(null, b), b)
  assert.deepEqual(S.mergeProgress(a, undefined), a)
})

test("saved screens: newest copy wins; on first sign-in the account's copy wins", () => {
  const server = { "sr.profile": { v: { rank: "C/O", ship: "Crude" }, t: 100 }, "sr.ask": { v: { msgs: [] }, t: 50 } }
  const local = { "sr.profile": { v: { rank: "2/O", ship: "Product" }, t: 200 }, "sr.brief": { v: { major: "X" }, t: 10 }, "sr.photos": { v: "big", t: 999 } }
  const m = S.mergeExtras(server, local)
  assert.equal(m["sr.profile"].v.rank, "2/O")
  assert.ok(m["sr.brief"])
  assert.ok(!m["sr.photos"], "photo thumbnails stay on the device")
  const first = S.mergeExtras(server, local, true)
  assert.equal(first["sr.profile"].v.rank, "C/O")
  assert.ok(first["sr.brief"], "screens the account doesn't have yet are filled in")
})

test("mergeAll picks merge or adopt, and handles an empty side", () => {
  const w = E.fresh(T0)
  const local = { wallet: w, progress: { xp: 5 }, extras: {} }
  assert.deepEqual(S.mergeAll({ wallet: null, progress: null, extras: {} }, local, false), local)
  const server = { wallet: E.spend(copy(w), 10, "x", T0 + 1).state, progress: { xp: 9 }, extras: {} }
  assert.equal(E.balance(S.mergeAll(server, local, true).wallet, T0 + 2), 70)
  assert.equal(S.mergeAll(server, local, true).progress.xp, 9)
})
