// Tests for Photo check's pure logic (app/src/photo.ts). Run: node --test app/tests/photo.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { fileURLToPath, pathToFileURL } from "node:url"
import * as esbuild from "esbuild"

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nilobs-photo-")), "photo.mjs")
await esbuild.build({
  stdin: { contents: 'export * from "@/photo"; export { OBS } from "@/fleet"', resolveDir: here, loader: "ts" },
  bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "warning", alias: { "@": path.join(here, "../src") },
})
const P = await import(pathToFileURL(out).href)
const { OBS } = P

test("every area gets about a dozen real examples from its own topics", () => {
  for (const a of P.AREAS) {
    const ex = P.examplesFor(a)
    assert.ok(ex.length >= 8 && ex.length <= 12, `${a.id}: ${ex.length}`)
    assert.equal(new Set(ex.map((e) => e.id)).size, ex.length, `${a.id}: no repeats`)
    for (const e of ex) {
      assert.match(e.id, /^O\d+$/)
      assert.equal(OBS[Number(e.id.slice(1))], e.o)
      if (a.topics.length) assert.ok(a.topics.includes(e.o.p), `${a.id}: ${e.o.p}`)
    }
  }
  // physical areas lead with hardware findings, records with process and human ones
  assert.ok(P.examplesFor(P.areaById("mooring")).slice(0, 3).every((e) => e.o.y === "W"))
  assert.ok(P.examplesFor(P.areaById("record")).slice(0, 3).every((e) => e.o.y === "P" || e.o.y === "H"))
  // examples spread across topics rather than all from one
  assert.ok(new Set(P.examplesFor(P.areaById("bridge")).map((e) => e.o.p)).size >= 4)
  assert.equal(P.areaById("nonsense").id, "any")
})

test("the prompt carries the area, the photo count, the note and the examples, and asks for JSON", () => {
  const a = P.areaById("lsa")
  const ex = P.examplesFor(a)
  const s = P.photoPrompt(a, 2, "extinguisher by the galley", "C/O", "Product", ex)
  assert.match(s, /^Photo check\./)
  assert.match(s, /2 photos \(numbered 1 to 2/)
  assert.match(s, /Lifesaving & firefighting/)
  assert.match(s, /extinguisher by the galley/)
  assert.match(s, /Chief Officer|C\/O/)
  for (const e of ex) assert.ok(s.includes(`[${e.id}]`))
  assert.match(s, /Reply with only JSON/)
  assert.match(s, /IMO number/)
  assert.doesNotMatch(s, /undefined/)
  // a long note is cut
  assert.ok(P.photoPrompt(a, 1, "x".repeat(1000), "C/O", "Product", ex).length < s.length + 400)
})

test("normalize keeps good findings, clamps boxes and drops junk", () => {
  const ids = new Set(["O1", "O2"])
  const r = P.normalize(
    {
      relevant: true,
      area: "  Mooring winch  ",
      summary: "Mostly fine.",
      findings: [
        { photo: 1, title: "Frayed rope", severity: "low", type: "Hardware", chapter: 9, what: "w", why: "y", fix: "f", box: [0.1, 0.2, 0.3, 0.4], related: ["O1", "O999", "X"] },
        { photo: 7, title: "Brake lining worn", severity: "high", type: "Alien", chapter: 44, box: [10, 20, 30, 40] },
        { title: "", severity: "high" },
        "nonsense",
        { photo: 1, title: "Box off the edge", severity: "weird", box: [0.9, 0.9, 0.5, 0.5] },
        { photo: 1, title: "Whole frame", box: [0, 0, 1, 1] },
      ],
      good: ["Clear walkway", 5, ""],
      check_next: ["Brake test record", "MBL certificate", "Line management plan", "fourth"],
      confidence: "silly",
    },
    2,
    (id) => ids.has(id)
  )
  assert.equal(r.relevant, true)
  assert.equal(r.area, "Mooring winch")
  assert.equal(r.findings.length, 4)
  // most serious first
  assert.deepEqual(r.findings.map((f) => f.severity), ["high", "medium", "medium", "low"])
  const high = r.findings[0]
  assert.equal(high.photo, 2, "photo number clamped to the photos sent")
  assert.equal(high.type, "")
  assert.equal(high.chapter, null)
  assert.deepEqual(high.box, [0.1, 0.2, 0.3, 0.4], "percentages become fractions")
  const edge = r.findings.find((f) => f.title === "Box off the edge")
  assert.ok(Math.abs(edge.box[2] - 0.1) < 1e-9 && Math.abs(edge.box[3] - 0.1) < 1e-9, "box clamped inside the photo")
  assert.equal(r.findings.find((f) => f.title === "Whole frame").box, null, "a box covering the whole photo is not a marker")
  assert.deepEqual(r.findings.find((f) => f.title === "Frayed rope").related, ["O1"])
  assert.deepEqual(r.good, ["Clear walkway"])
  assert.equal(r.checkNext.length, 3)
  assert.equal(r.confidence, "medium")
})

test("normalize: not relevant, empty and hostile replies", () => {
  assert.equal(P.normalize({ relevant: false, findings: [] }, 1).relevant, false)
  const empty = P.normalize(null, 1)
  assert.equal(empty.relevant, true)
  assert.deepEqual(empty.findings, [])
  assert.equal(P.normalize([1, 2, 3], 1).findings.length, 0)
  const many = P.normalize({ findings: Array.from({ length: 20 }, (_, i) => ({ title: `F${i}` })) }, 1)
  assert.equal(many.findings.length, 6)
  const long = P.normalize({ summary: "s".repeat(5000), findings: [{ title: "t".repeat(500), what: "w".repeat(5000) }] }, 1)
  assert.ok(long.summary.length <= 500)
  assert.ok(long.findings[0].title.length <= 90)
  assert.ok(long.findings[0].what.length <= 420)
  // default id check accepts only real observation ids
  const real = P.normalize({ findings: [{ title: "x", related: ["O0", `O${OBS.length + 5}`, "C1"] }] }, 1)
  assert.deepEqual(real.findings[0].related, ["O0"])
})

test("similar real findings need two shared words and prefer the area", () => {
  const lsa = P.areaById("lsa")
  const hits = P.similarObs("Fire extinguisher access blocked by stores", lsa)
  assert.ok(hits.length <= 2)
  for (const h of hits) assert.match(h.o.t.toLowerCase(), /extinguisher|access|store|block|fire/)
  assert.deepEqual(P.similarObs("zzzz qqqq", lsa), [])
  assert.deepEqual(P.similarObs("", lsa), [])
  // one shared word is not enough
  assert.deepEqual(P.similarObs("lifeboat", P.areaById("any")), [])
})
