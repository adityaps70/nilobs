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

test("mergeAll merges progress and screens, handles an empty side, and carries no wallet", () => {
  const local = { progress: { xp: 5 }, extras: {} }
  assert.deepEqual(S.mergeAll({ progress: null, extras: {} }, local, false), local)
  const server = { progress: { xp: 9 }, extras: {}, wallet: E.fresh(T0) }
  const m = S.mergeAll(server, { ...local, wallet: E.fresh(T0) }, true)
  assert.equal(m.progress.xp, 9)
  assert.ok(!("wallet" in m), "credits never travel in synced state")
})
