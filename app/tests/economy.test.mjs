// Tests for the credit economy (app/src/economy.ts). Run: node app/tests/economy.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { fileURLToPath, pathToFileURL } from "node:url"
import * as esbuild from "esbuild"

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nilobs-eco-")), "economy.mjs")
await esbuild.build({ entryPoints: [path.join(here, "../src/economy.ts")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "warning" })
const E = await import(pathToFileURL(out).href)

const T0 = Date.UTC(2026, 9, 19, 9, 0, 0)
const D = E.DAY

test("a new wallet has welcome + free monthly credits", () => {
  const s = E.fresh(T0)
  assert.equal(E.balance(s, T0), 80)
  assert.equal(s.plan.id, "free")
  assert.equal(E.perks(s, T0).paid, false)
})

test("spending uses soonest-expiring credits first and top-ups last", () => {
  let s = E.fresh(T0)
  s = E.buyTopUp(s, E.TOPUPS[0], "INR", T0) // 150, never expires
  s = E.earn(s, 10, "Chest", T0 + D / 2) // earned credits last 30 days: this lot expires half a day after the others
  // welcome expires day 30, free monthly expires day 30 (same), earned day 30.5, top-up never
  const r = E.spend(s, 85, "Big spend", T0 + D)
  assert.equal(r.ok, true)
  const left = Object.fromEntries(r.state.buckets.map((b) => [b.kind, b.left]))
  assert.equal(left.welcome + left.monthly, 0, "welcome and monthly used first")
  assert.equal(left.earned, 5, "then earned")
  assert.equal(left.topup, 150, "top-up untouched")
  assert.equal(E.balance(r.state, T0 + D), 155)
})

test("cannot overspend; reports the shortfall", () => {
  const s = E.fresh(T0)
  const r = E.spend(s, 81, "Too much", T0)
  assert.equal(r.ok, false)
  assert.equal(r.short, 1)
  assert.equal(E.balance(r.state, T0), 80)
})

test("refund returns credits to the buckets they came from, once", () => {
  const s = E.fresh(T0)
  const r = E.spend(s, 8, "Interview", T0, "interviews")
  assert.equal(r.state.usage.interviews, 1)
  let s2 = E.refund(r.state, r.entry, T0 + 1000, "interviews")
  assert.equal(E.balance(s2, T0 + 1000), 80)
  assert.equal(s2.usage.interviews, 0)
  assert.equal(s2.usage.spent, 0)
  s2 = E.refund(s2, r.entry, T0 + 2000)
  assert.equal(E.balance(s2, T0 + 2000), 80, "second refund ignored")
})

test("welcome credits expire after 30 days; free plan refills 20 without rollover", () => {
  let s = E.fresh(T0)
  s = E.spend(s, 5, "x", T0).state // 75 left: welcome 55... soonest first (welcome and monthly share expiry)
  const later = E.tick(s, T0 + 31 * D)
  assert.equal(E.balance(later, T0 + 31 * D), 20, "only the new month's 20")
  assert.ok(later.ledger.some((e) => e.kind === "expire"))
  // a long absence grants only the current cycle once
  const much = E.tick(s, T0 + 200 * D)
  assert.equal(E.balance(much, T0 + 200 * D), 20)
  assert.ok(much.plan.renews > T0 + 200 * D)
})

test("earned credits last 30 days", () => {
  let s = E.fresh(T0)
  s = E.earn(s, 3, "Chest", T0 + 10 * D)
  assert.equal(E.balance(E.tick(s, T0 + 39 * D), T0 + 39 * D), 20 + 3, "welcome gone, monthly refilled, earned still there")
  assert.equal(E.balance(E.tick(s, T0 + 41 * D), T0 + 41 * D), 20)
})

test("upgrading keeps the credits you have and adds the plan's allowance", () => {
  let s = E.fresh(T0)
  s = E.subscribe(s, "watch", "monthly", "INR", T0 + D)
  assert.equal(E.balance(s, T0 + D), 80 + 400)
  assert.equal(E.perks(s, T0 + D).allStories, true)
  assert.equal(E.perks(s, T0 + D).expert, false)
  s = E.subscribe(s, "command", "annual", "USD", T0 + 2 * D)
  assert.equal(E.balance(s, T0 + 2 * D), 80 + 400 + 1500, "nothing is wiped on upgrade")
  assert.equal(E.perks(s, T0 + 2 * D).expert, true)
})

test("downgrading waits for the end of the term", () => {
  let s = E.subscribe(E.fresh(T0), "command", "monthly", "INR", T0)
  s = E.subscribe(s, "watch", "monthly", "INR", T0 + 10 * D)
  assert.equal(s.plan.id, "command", "still Command until renewal")
  assert.deepEqual(s.plan.next, { id: "watch", cycle: "monthly" })
  assert.equal(E.balance(s, T0 + 10 * D), 80 + 1500, "no credits lost")
  const after = E.tick(s, T0 + 30 * D + 1)
  assert.equal(after.plan.id, "watch")
  assert.equal(after.plan.next, null)
  assert.equal(after.buckets.filter((b) => b.kind === "monthly" && b.left > 0).reduce((n, b) => n + b.left, 0), 400)
})

test("switching monthly to yearly keeps credits and sets a 12-refill term", () => {
  let s = E.subscribe(E.fresh(T0), "watch", "monthly", "INR", T0)
  s = E.spend(s, 100, "use", T0 + D).state
  const before = E.balance(s, T0 + 2 * D)
  s = E.subscribe(s, "watch", "annual", "INR", T0 + 2 * D)
  assert.equal(E.balance(s, T0 + 2 * D), before)
  assert.equal(s.plan.cycle, "annual")
  assert.equal(s.plan.term, s.plan.started + 360 * D)
  assert.equal(E.changeKind(s, "watch", "annual"), "same")
})

test("a cancelled yearly plan runs to the end of the year, refilling monthly", () => {
  let s = E.subscribe(E.fresh(T0), "watch", "annual", "INR", T0)
  s = E.cancelPlan(s, T0 + 5 * D)
  assert.equal(s.plan.cancelAt, T0 + 360 * D)
  const mid = E.tick(s, T0 + 200 * D)
  assert.equal(mid.plan.id, "watch")
  assert.equal(E.perks(mid, T0 + 200 * D).paid, true)
  assert.ok(mid.ledger[0].label.includes("this month's 400"), mid.ledger[0].label)
  const end = E.tick(s, T0 + 361 * D)
  assert.equal(end.plan.id, "free")
})

test("a yearly plan renews for another year at the end of its term", () => {
  const s = E.subscribe(E.fresh(T0), "command", "annual", "USD", T0)
  const next = E.tick(s, T0 + 361 * D)
  assert.equal(next.plan.id, "command")
  assert.equal(next.plan.term, T0 + 720 * D)
  assert.ok(next.ledger[0].label.includes("another year"), next.ledger[0].label)
})

test("keeping a cancelled plan is logged and clears the cancellation", () => {
  let s = E.subscribe(E.fresh(T0), "watch", "monthly", "INR", T0)
  s = E.cancelPlan(s, T0 + D)
  assert.equal(E.changeKind(s, "watch", "monthly"), "keep")
  s = E.subscribe(s, "watch", "monthly", "INR", T0 + 2 * D)
  assert.equal(s.plan.cancelAt, null)
  assert.match(s.ledger[0].label, /Kept your Watchkeeper/)
})

test("held charges: settled ones stay, abandoned ones refund themselves", () => {
  const s0 = E.fresh(T0)
  const r = E.spend(s0, 4, "Ask", T0, "deep", "pageA")
  assert.equal(r.state.holds.length, 1)
  // same page, still running: kept
  assert.equal(E.balance(E.tick(r.state, T0 + 100000, "pageA"), T0 + 100000), 76)
  // another page (this one closed or reloaded) after 90 s: refunded
  const other = E.tick(r.state, T0 + 100000, "pageB")
  assert.equal(E.balance(other, T0 + 100000), 80)
  assert.equal(other.holds.length, 0)
  assert.equal(other.usage.deep, 0)
  // settled: never refunded
  const settled = E.settle(r.state, r.entry)
  assert.equal(E.balance(E.tick(settled, T0 + 700000, "pageB"), T0 + 700000), 76)
  // stuck on the same page for 10 minutes: refunded
  assert.equal(E.balance(E.tick(r.state, T0 + 700000, "pageA"), T0 + 700000), 80)
})

test("plan credits refresh each cycle and do not roll over", () => {
  let s = E.subscribe(E.fresh(T0), "watch", "monthly", "INR", T0)
  s = E.spend(s, 100, "use", T0 + D).state
  const next = E.tick(s, T0 + 30 * D + 1)
  const monthly = next.buckets.filter((b) => b.kind === "monthly" && b.left > 0)
  assert.equal(monthly.length, 1)
  assert.equal(monthly[0].left, 400)
})

test("a cancelled plan runs to the end of the cycle, then drops to Free", () => {
  let s = E.subscribe(E.fresh(T0), "watch", "monthly", "INR", T0)
  s = E.cancelPlan(s, T0 + 5 * D)
  assert.equal(s.plan.id, "watch")
  assert.equal(E.perks(E.tick(s, T0 + 29 * D), T0 + 29 * D).paid, true)
  const after = E.tick(s, T0 + 31 * D)
  assert.equal(after.plan.id, "free")
  assert.equal(E.perks(after, T0 + 31 * D).paid, false)
  assert.equal(E.balance(after, T0 + 31 * D), 20)
})

test("voyage pass: credits and perks for 180 days, no renewal", () => {
  let s = E.buyPass(E.fresh(T0), "INR", T0)
  assert.equal(E.balance(s, T0), 80 + 1000)
  assert.equal(E.perks(s, T0 + 179 * D).paid, true)
  const end = E.tick(s, T0 + 181 * D)
  assert.equal(end.pass, null)
  assert.equal(E.perks(end, T0 + 181 * D).paid, false)
})

test("top-ups never expire", () => {
  const s = E.buyTopUp(E.fresh(T0), E.TOPUPS[2], "USD", T0)
  assert.equal(E.balance(E.tick(s, T0 + 900 * D), T0 + 900 * D), 1200 + 20)
})

test("sharing debriefs: once a day, two a month", () => {
  let s = E.fresh(T0)
  s = E.recordShare(s, T0, "debrief 0")
  assert.equal(E.balance(s, T0), 80 + 10)
  assert.equal(E.shareStatus(s, T0).ok, false, "not twice in a day")
  s = E.recordShare(s, T0, "another")
  assert.equal(E.balance(s, T0), 90)
  assert.equal(E.shareStatus(s, T0 + D, "Debrief 0!").ok, false, "the same text never earns twice")
  for (let d = 1; d < 6; d++) s = E.recordShare(s, T0 + d * D, `debrief ${d}`) // 19-24 Oct, all one month
  assert.equal(E.balance(s, T0 + 5 * D) - 80, 2 * 10, "capped at two a month")
  assert.equal(E.shareStatus(s, T0 + 5 * D).ok, false)
  assert.equal(E.shareStatus(s, T0 + 14 * D).ok, true, "a new month resets the cap")
})

test("old v1 wallets migrate: balance carried over, unlocked stories kept", () => {
  const s = E.migrate({ balance: 230, ledger: [], unlocked: [101, 102] }, T0)
  assert.equal(E.balance(s, T0), 230 + 20)
  assert.deepEqual(s.unlocked, [101, 102])
  assert.equal(E.balance(E.tick(s, T0 + 400 * D), T0 + 400 * D), 230 + 20)
})

test("corrupted storage never crashes and never yields NaN", () => {
  for (const raw of [null, "x", 5, { v: 2, buckets: [{ left: "9" }, null] }, { v: 2, buckets: [], plan: { id: "gold" } }, { balance: "100-10" }]) {
    const s = E.migrate(raw, T0)
    const b = E.balance(s, T0)
    assert.ok(Number.isFinite(b), `finite for ${JSON.stringify(raw)}`)
    assert.ok(Array.isArray(s.unlocked))
    assert.ok(s.plan.id in E.PLANS)
  }
})

test("prices: plans beat top-ups per credit, annual saves two months", () => {
  for (const cur of ["INR", "USD"]) {
    const watch = E.PLANS.watch.price[cur].monthly / E.PLANS.watch.credits
    const command = E.PLANS.command.price[cur].monthly / E.PLANS.command.credits
    const smallTop = E.TOPUPS[0].price[cur] / E.TOPUPS[0].credits
    assert.ok(command < watch && watch <= smallTop, `${cur}: command < watch <= top-up per credit`)
    for (const p of ["watch", "command"]) assert.equal(E.PLANS[p].price[cur].annual, E.PLANS[p].price[cur].monthly * 10)
  }
})

test("a free user's first month covers one of everything", () => {
  const C = E.COSTS
  const tour = C.interview + C.brief + 3 * C.askDeep + 5 * C.askQuick + 5 * C.explain + 2 * C.story
  assert.ok(tour <= E.WELCOME.credits + E.PLANS.free.credits, `tour costs ${tour}`)
})
