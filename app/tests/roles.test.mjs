// Roles: every crew rank and shore role, generic (not one company's), with what each usually covers.
import { test } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { fileURLToPath, pathToFileURL } from "node:url"
import * as esbuild from "esbuild"

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nilobs-roles-")), "roles.mjs")
await esbuild.build({
  stdin: { contents: 'export * as R from "@/roles"; export * as L from "@/library"; export * as F from "@/fleet"; export * as D from "@/data"', resolveDir: here, loader: "ts" },
  bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "warning", alias: { "@": path.join(here, "../src") }, loader: { ".json": "json" },
})
const { R, L, F, D } = await import(pathToFileURL(out).href)
const TOPICS = [...fs.readFileSync(path.join(here, "../src/data.ts"), "utf8").match(/export type Topic =([\s\S]*?)\n\n/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])

test("crew ranks, cadets, ratings, catering, shore roles and 'other' are all offered", () => {
  const ids = R.RANKS
  for (const id of ["Master", "C/O", "2/O", "3/O", "C/E", "2/E", "3/E", "4/E", "ETO", "Deck cadet", "Engine cadet", "Bosun", "Pumpman", "AB", "OS", "Fitter", "Oiler", "Wiper", "Cook", "Steward",
    "Marine superintendent", "Technical superintendent", "Port captain", "Vetting manager", "HSEQ manager", "DPA", "Fleet manager", "Crewing manager", "Training officer", "Other"])
    assert.ok(ids.includes(id), id)
  assert.equal(new Set(ids).size, ids.length, "no duplicates")
  for (const g of R.ROLE_GROUPS) assert.ok(R.ROLES.some((r) => r.group === g.id), g.id)
  assert.deepEqual(D.RANKS, R.RANKS, "data re-exports the same list")
})

test("every role has real topics and real SIRE 2.0 sections", () => {
  for (const r of R.ROLES) {
    assert.ok(r.topics.length >= 3, r.id)
    for (const t of r.topics) assert.ok(TOPICS.includes(t), `${r.id}: ${t}`)
    for (const s of r.sections) assert.ok(s === "*" || L.SECTIONS[s], `${r.id}: section ${s}`)
    assert.ok(L.libForRank(r.id).length > 0, `${r.id} has questions`)
  }
})

test("the question split is generic: every SIRE 2.0 question is covered by some crew rank", () => {
  const crew = R.ROLES.filter((r) => !["shore", "other"].includes(r.group))
  const missing = L.LIBRARY.filter((q) => !crew.some((r) => R.coversQuestion(r.id, q.n)) && !q.n.startsWith("4.5") && !q.n.startsWith("8.7") && !q.n.startsWith("8.8") && !q.n.startsWith("9.7"))
  assert.deepEqual(missing.map((q) => q.n), [])
  assert.ok(!fs.readFileSync(path.join(here, "../src/library.ts"), "utf8").includes('"r":['), "no company rank-wise sheet left in the library")
  assert.equal(L.libForRank("Vetting manager").length, L.LIBRARY.length, "vetting manager sees all")
  assert.ok(L.libForRank("2/O").every((q) => q.n.startsWith("4.") || q.n.startsWith("7.") || q.n.startsWith("12.")))
})

test("prepared questions where they exist; the AI writes them for the rest", () => {
  for (const id of ["Master", "C/O", "2/O", "3/O", "C/E", "2/E", "ETO", "Deck cadet", "AB", "Pumpman", "Oiler"]) {
    assert.ok(R.hasPreparedQuestions(id), id)
    assert.ok(F.interviewPool(id).length >= 12, `${id} pool`)
  }
  for (const id of ["Cook", "Steward", "Marine superintendent", "DPA", "Vetting manager", "Other"]) {
    assert.ok(!R.hasPreparedQuestions(id), id)
    assert.equal(F.interviewPool(id).length, 0, `${id}: AI writes the questions`)
  }
  assert.ok(F.cardsFor("trending", "2/E").every((c) => ["Engineers", "All"].includes(c.r)))
  assert.ok(F.cardsFor("trending", "Cook").length > 50, "no prepared cards: the whole deck")
})

test("'Other' uses the user's own words; prompts know crew from shore", () => {
  R.setCustomRole(R.cleanRoleName("  Cargo   surveyor <b>"))
  assert.equal(R.RANK_NAMES.Other, "Cargo surveyor b")
  R.setCustomRole("")
  assert.equal(R.RANK_NAMES.Other, "Other role")
  assert.match(R.roleContext("DPA", "Crude"), /ashore at the company that manages a crude tanker/)
  assert.match(R.roleContext("AB", "Chemical"), /Able Seaman on board a chemical tanker/)
  assert.match(R.roleContext("Master", "Gas", "Acme Tankers"), /works for Acme Tankers; don't assume/)
  assert.ok(R.isShore("Port captain") && !R.isShore("Bosun") && R.isCrew("Cook") && !R.isCrew("Other"))
  assert.equal(R.roleOf("nonsense").id, "2/O")
})
