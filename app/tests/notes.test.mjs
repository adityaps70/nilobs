// "What to show" in the question bank: every question has its own points (not one list per topic), and every
// related SIRE 2.0 number is a real one. Run: node --test app/tests/notes.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { fileURLToPath, pathToFileURL } from "node:url"
import * as esbuild from "esbuild"

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nilobs-notes-")), "notes.mjs")
await esbuild.build({
  stdin: { contents: 'export * from "@/notes"; export { BANK } from "@/data"; export { LIBRARY } from "@/library"', resolveDir: here, loader: "ts" },
  bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "warning", alias: { "@": path.join(here, "../src") },
})
const { noteFor, BANK, LIBRARY } = await import(pathToFileURL(out).href)
const RAW = JSON.parse(fs.readFileSync(path.join(here, "../src/gen/bank-notes.json"), "utf8"))

test("every bank question has its own two to five points", () => {
  assert.ok(BANK.length > 400)
  for (const q of BANK) {
    const n = noteFor(q.id)
    assert.ok(n, `${q.id} has a note`)
    assert.ok(n.show.length >= 2 && n.show.length <= 5, `${q.id}: ${n.show.length} points`)
    for (const s of n.show) assert.ok(s.length > 10 && s.length < 220, `${q.id}: "${s}"`)
  }
  assert.deepEqual(Object.keys(RAW).sort(), BANK.map((q) => q.id).sort(), "no notes for questions that aren't in the bank")
})

test("questions on the same topic don't all get the same answer", () => {
  const byTopic = {}
  for (const q of BANK) (byTopic[q.topic] ||= []).push(noteFor(q.id).show.join("|"))
  for (const [topic, lists] of Object.entries(byTopic)) {
    const distinct = new Set(lists).size
    assert.ok(distinct >= Math.ceil(lists.length * 0.9), `${topic}: ${distinct} different notes for ${lists.length} questions`)
  }
  const ecdis = BANK.filter((q) => q.topic === "ECDIS").map((q) => noteFor(q.id).show.join("|"))
  assert.ok(ecdis.length > 10 && new Set(ecdis).size === ecdis.length, "every ECDIS question has its own points")
})

test("related SIRE 2.0 numbers all exist in the library", () => {
  const known = new Set(LIBRARY.map((q) => q.n))
  for (const [id, n] of Object.entries(RAW)) {
    assert.ok(n.r.length <= 4, `${id}: at most four related questions`)
    for (const r of n.r) assert.ok(known.has(r), `${id}: ${r} is a SIRE 2.0 question`)
    assert.equal(noteFor(id).related.length, n.r.length)
  }
})

test("our vetting experts' corrections are in", () => {
  const leak = BANK.find((q) => /double hull/i.test(q.q) && /leak/i.test(q.q))
  assert.ok(leak, "the double-hull leak question")
  assert.match(noteFor(leak.id).show.join(" "), /fixed gas detection system.*first to raise the alarm/i)
  const odme = BANK.find((q) => /ODME/.test(q.q) && /fail/i.test(q.q))
  assert.ok(odme, "the ODME failure question")
  const s = noteFor(odme.id).show.join(" ")
  assert.match(s, /Oil Record Book|ORB/)
  assert.match(s, /flag/)
  assert.match(s, /class/)
  assert.match(s, /dispensation/)
})

test("an unknown id gets nothing", () => {
  assert.equal(noteFor("999-9"), null)
})
