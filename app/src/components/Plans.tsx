// Plans, top-ups and the wallet screen. Checkout is simulated in this prototype: nothing is charged.
import { useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import confetti from "canvas-confetti"

import * as I from "@/components/icons"
import { cn } from "@/lib/utils"
import { BorderBeam } from "@/components/magicui/border-beam"
import { Section, TopBar, Scroll } from "@/components/ui"
import { IconTile, type TileColor } from "@/components/topicIcons"
import { COSTS, EARN, PASS, PLANS, TOPUPS, fmtPrice, useWallet, type Currency, type Cycle, type PlanId } from "@/credits"
import { PLAN_ORDER, dayOf, perMonth } from "@/economy"
import { LEVELS, useProgress } from "@/progress"
import type { AppScreen } from "@/nav"

/* ---------------- toggles ---------------- */
export function CurrencyToggle({ value, onChange, dark }: { value: Currency; onChange: (c: Currency) => void; dark?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Currency" className={cn("inline-flex rounded-full p-0.5 text-[12.5px] font-semibold", dark ? "bg-white/10" : "bg-surface-2")}>
      {(["INR", "USD"] as const).map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} onClick={() => onChange(c)} className={cn("h-8 rounded-full px-3", value === c ? (dark ? "bg-white text-ink" : "bg-surface text-ink shadow-sm") : dark ? "text-white/70" : "text-mute")}>
          {c === "INR" ? "₹ INR" : "$ USD"}
        </button>
      ))}
    </div>
  )
}
export function CycleToggle({ value, onChange, dark }: { value: Cycle; onChange: (c: Cycle) => void; dark?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Billing" className={cn("inline-flex rounded-full p-0.5 text-[12.5px] font-semibold", dark ? "bg-white/10" : "bg-surface-2")}>
      {(["monthly", "annual"] as const).map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} onClick={() => onChange(c)} className={cn("flex h-8 items-center gap-1.5 rounded-full px-3", value === c ? (dark ? "bg-white text-ink" : "bg-surface text-ink shadow-sm") : dark ? "text-white/70" : "text-mute")}>
          {c === "monthly" ? "Monthly" : "Yearly"}
          {c === "annual" && <span className="rounded-full bg-sea-soft px-1.5 py-px text-[10px] font-bold text-sea">2 months free</span>}
        </button>
      ))}
    </div>
  )
}

export const priceLine = (id: PlanId, cur: Currency, cycle: Cycle) => {
  const p = PLANS[id]
  if (id === "free") return { big: fmtPrice(0, cur), small: "forever" }
  return { big: fmtPrice(perMonth(p, cur, cycle), cur), small: cycle === "annual" ? `a month, billed ${fmtPrice(p.price[cur].annual, cur)} a year` : "a month" }
}

function burst(el?: Element | null) {
  const r = el?.getBoundingClientRect()
  confetti({
    particleCount: 110, spread: 80, startVelocity: 34, disableForReducedMotion: true,
    colors: ["#0b6bcb", "#f26b1d", "#0b7d64", "#ffcf70", "#7cc4ff"],
    origin: r ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight } : undefined,
  })
}

/** What NilObs has already done for this user, shown when they run out. */
function ValueReceipt() {
  const w = useWallet()
  const p = useProgress()
  const pl = (n: number, one: string, many: string) => [n, n === 1 ? one : many] as [number, string]
  const items = [
    pl(p.stats.cards, "flashcard reviewed", "flashcards reviewed"),
    pl(p.stats.spot, "observation spotted", "observations spotted"),
    pl(p.stats.interviews, "mock interview", "mock interviews"),
    pl(p.stats.asks, "AI answer", "AI answers"),
    pl(w.usage.explains, "close-out drafted", "close-outs drafted"),
    pl(w.usage.photos, "photo checked", "photos checked"),
    pl(w.usage.briefs, "inspection brief", "inspection briefs"),
  ].filter(([n]) => n > 0)
  if (!items.length) return null
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-primary-soft px-3.5 py-3">
      <span className="text-[12px] font-semibold text-primary">So far with NilObs</span>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">
        {items.slice(0, 4).map(([n, l]) => <span key={l}><b className="tnum font-bold">{n}</b> {l}</span>)}
      </div>
      <span className="text-[11.5px] text-mute">Level {p.level.n} · {p.level.name} · {p.xp.toLocaleString("en-IN")} XP. Your progress stays whichever plan you choose.</span>
    </div>
  )
}

/* ---------------- the sheet ---------------- */
type Pick = { kind: "plan"; id: PlanId } | { kind: "pass" } | { kind: "topup"; id: string }

export function PlansSheet() {
  const w = useWallet()
  const open = !!w.sheet
  const [tab, setTab] = useState<"plans" | "topup">("plans")
  const [cycle, setCycle] = useState<Cycle>("monthly")
  const [pick, setPick] = useState<Pick>({ kind: "plan", id: "watch" })
  const [stage, setStage] = useState<"pick" | "pay" | "done">("pick")
  const [done, setDone] = useState("")
  const btn = useRef<HTMLButtonElement>(null)
  // each purchase gets a token; closing the sheet or starting another purchase cancels the older one
  const token = useRef(0)
  const defaultPlan = (): PlanId => (w.plan.id === "free" ? "watch" : w.plan.id)

  useEffect(() => {
    if (!w.sheet) return
    setStage("pick")
    setDone("")
    token.current++
    setCycle(w.sheet.cycle ?? (w.plan.id === "free" ? "monthly" : w.state.plan.cycle))
    const sel = w.sheet.select
    if (sel === "pass") (setTab("plans"), setPick({ kind: "pass" }))
    else if (sel && TOPUPS.some((t) => t.id === sel)) (setTab("topup"), setPick({ kind: "topup", id: sel }))
    else if (sel === "watch" || sel === "command") (setTab("plans"), setPick({ kind: "plan", id: sel }))
    else if (w.sheet.tab === "topup") (setTab("topup"), setPick({ kind: "topup", id: "t500" }))
    else (setTab("plans"), setPick({ kind: "plan", id: defaultPlan() }))
  }, [w.sheet]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stage !== "pay" && w.closePlans()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, stage, w])

  const cur = w.currency
  const choose = (t: "plans" | "topup") => {
    setTab(t)
    setPick(t === "topup" ? { kind: "topup", id: "t500" } : { kind: "plan", id: defaultPlan() })
  }
  const change = pick.kind === "plan" ? w.changeKind(pick.id, cycle) : null
  const isCurrent = change === "same"
  const fmtD = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  const boundary = w.state.plan.cycle === "annual" ? w.state.plan.term : w.state.plan.renews
  const effect =
    pick.kind !== "plan" ? ""
      : change === "upgrade" ? (w.balance > 0 ? `Starts today. Your ${w.balance.toLocaleString("en-IN")} credits stay, and ${PLANS[pick.id].credits.toLocaleString("en-IN")} more arrive now.` : `Starts today with ${PLANS[pick.id].credits.toLocaleString("en-IN")} credits.`)
      : change === "downgrade" ? `You keep ${w.plan.name} and its credits until ${fmtD(boundary)}, then move to ${PLANS[pick.id].name}.`
      : change === "cycle" ? `Your credits stay as they are. ${cycle === "annual" ? `You're billed yearly from now; refills stay monthly.` : `Monthly billing starts when your current year ends.`}`
      : change === "keep" ? `Your ${w.plan.name} plan carries on as before.`
      : ""
  const amount =
    pick.kind === "plan" ? PLANS[pick.id].price[cur][cycle] : pick.kind === "pass" ? PASS.price[cur] : TOPUPS.find((t) => t.id === pick.id)!.price[cur]
  const what =
    pick.kind === "plan" ? `${PLANS[pick.id].name}, ${fmtPrice(amount, cur)}/${cycle === "annual" ? "year" : "month"}` : pick.kind === "pass" ? `${PASS.name}, ${fmtPrice(amount, cur)} once` : `${TOPUPS.find((t) => t.id === pick.id)!.credits} credits, ${fmtPrice(amount, cur)}`
  const pay = () => {
    if (stage === "pay" || isCurrent) return
    const item = pick
    const cyc = cycle
    const kind = change
    // keeping a plan or scheduling a downgrade involves no payment
    const instant = kind === "keep" || kind === "downgrade"
    const my = ++token.current
    setStage("pay")
    setTimeout(() => {
      if (my !== token.current) return // closed or replaced while processing: nothing happens
      if (item.kind === "plan") w.subscribe(item.id, cyc)
      else if (item.kind === "pass") w.buyPass()
      else w.buyTopUp(item.id)
      const pn = item.kind === "plan" ? PLANS[item.id] : null
      setDone(
        item.kind === "plan"
          ? kind === "keep" ? `You're staying on ${pn!.name}.`
            : kind === "downgrade" ? `Done. You keep ${w.plan.name} until ${fmtD(boundary)}, then move to ${pn!.name}.`
            : kind === "cycle" ? `${pn!.name} is now billed ${cyc === "annual" ? "yearly" : "monthly"}. Your credits are unchanged.`
            : `You're on ${pn!.name}. ${pn!.credits.toLocaleString("en-IN")} credits are in your wallet and refill every 30 days.`
          : item.kind === "pass" ? `Your Voyage pass is active: ${PASS.credits.toLocaleString("en-IN")} credits and Watchkeeper perks for ${PASS.days} days.`
          : `${TOPUPS.find((t) => t.id === item.id)!.credits} credits added. Top-ups never expire.`
      )
      setStage("done")
      if (!instant) burst(btn.current)
    }, instant ? 300 : 1100)
  }
  const close = () => {
    token.current++
    w.closePlans()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 bg-[rgba(6,16,27,0.55)] backdrop-blur-[2px]" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="plans-title"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="no-scrollbar relative m-0 flex max-h-[92dvh] w-full max-w-[480px] flex-col gap-3.5 overflow-y-auto rounded-t-[28px] border border-line sheet-panel p-5 pb-[max(20px,env(safe-area-inset-bottom))] font-sans text-ink shadow-2xl sm:m-4 sm:rounded-[28px]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="plans-title" className="display text-[22px] leading-tight font-bold">
                  {stage === "done" ? "You're all set" : w.sheet?.reason ? "Keep going with NilObs" : "Plans and credits"}
                </h2>
                <p className="text-[13.5px] leading-snug text-mute">{stage === "done" ? done : w.sheet?.reason || `You have ${w.balance} credits on ${w.plan.name}.`}</p>
              </div>
              <button type="button" aria-label="Close" onClick={close} className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-surface-2">
                <I.Close size={18} />
              </button>
            </div>

            {stage === "done" ? (
              <>
                <div className="flex items-center justify-between rounded-2xl bg-sea-soft px-4 py-3">
                  <span className="text-[13.5px] font-semibold text-sea">New balance</span>
                  <span className="tnum display text-[24px] font-bold text-sea">{w.balance.toLocaleString("en-IN")}</span>
                </div>
                <button type="button" onClick={close} className="h-12 rounded-xl bg-primary text-[15px] font-semibold text-on-primary">Continue</button>
              </>
            ) : (
              <>
                {w.sheet?.reason && <ValueReceipt />}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div role="tablist" aria-label="Buy" className="inline-flex rounded-full bg-surface-2 p-0.5 text-[13px] font-semibold">
                    {(["plans", "topup"] as const).map((t) => (
                      <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => choose(t)} className={cn("h-9 rounded-full px-3.5", tab === t ? "bg-surface text-ink shadow-sm" : "text-mute")}>
                        {t === "plans" ? "Plans" : "Top up"}
                      </button>
                    ))}
                  </div>
                  <CurrencyToggle value={cur} onChange={w.setCurrency} />
                </div>
                {tab === "plans" ? (
                  <>
                    <CycleToggle value={cycle} onChange={setCycle} />
                    <div role="radiogroup" aria-label="Plans" className="flex flex-col gap-2">
                      {(["watch", "command"] as const).map((id) => {
                        const p = PLANS[id]
                        const on = pick.kind === "plan" && pick.id === id
                        const pl = priceLine(id, cur, cycle)
                        const current = w.plan.id === id
                        return (
                          <button key={id} type="button" role="radio" aria-checked={on} onClick={() => setPick({ kind: "plan", id })} className={cn("relative flex flex-col gap-2 overflow-hidden rounded-2xl border p-3.5 text-left transition-colors", on ? "border-primary bg-surface-2" : "border-line hover:border-mute")}>
                            <span className="flex items-start gap-3">
                              <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2", on ? "border-signal" : "border-line")}>{on && <span className="size-2.5 rounded-full bg-signal" />}</span>
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="flex items-center gap-2 text-[15.5px] font-bold">{p.name}{id === "watch" && <span className="rounded-full bg-signal-soft px-2 py-0.5 font-mono text-[10px] font-semibold text-signal-ink">POPULAR</span>}{current && <span className="rounded-full bg-sea-soft px-2 py-0.5 font-mono text-[10px] font-semibold text-sea">CURRENT</span>}</span>
                                <span className="text-[12.5px] text-mute">{p.tagline}</span>
                              </span>
                              <span className="flex flex-col items-end">
                                <span className="tnum text-[17px] font-bold">{pl.big}</span>
                                <span className="text-[11px] text-mute">{cycle === "annual" ? "a month, yearly" : "a month"}</span>
                              </span>
                            </span>
                            <span className="flex flex-wrap gap-1.5 pl-8">
                              {p.perks.slice(0, 4).map((x) => <span key={x} className="rounded-full bg-surface px-2 py-0.5 text-[11.5px] text-mute">{x}</span>)}
                            </span>
                            {on && id === "watch" && <BorderBeam size={90} duration={6} colorFrom="#0b6bcb" colorTo="#f26b1d" borderWidth={1.5} />}
                          </button>
                        )
                      })}
                      <button type="button" role="radio" aria-checked={pick.kind === "pass"} onClick={() => setPick({ kind: "pass" })} className={cn("flex items-start gap-3 rounded-2xl border border-dashed p-3.5 text-left", pick.kind === "pass" ? "border-primary bg-surface-2" : "border-line hover:border-mute")}>
                        <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2", pick.kind === "pass" ? "border-signal" : "border-line")}>{pick.kind === "pass" && <span className="size-2.5 rounded-full bg-signal" />}</span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-center gap-2 text-[15px] font-bold"><I.Anchor size={15} /> {PASS.name}</span>
                          <span className="text-[12.5px] leading-snug text-mute">No subscription. {PASS.credits.toLocaleString("en-IN")} credits and Watchkeeper perks for {PASS.days / 30} months. Made for a contract at sea.</span>
                        </span>
                        <span className="flex flex-col items-end">
                          <span className="tnum text-[17px] font-bold">{fmtPrice(PASS.price[cur], cur)}</span>
                          <span className="text-[11px] text-mute">once</span>
                        </span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div role="radiogroup" aria-label="Top-ups" className="flex flex-col gap-2">
                    {TOPUPS.map((t) => {
                      const on = pick.kind === "topup" && pick.id === t.id
                      return (
                        <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => setPick({ kind: "topup", id: t.id })} className={cn("flex items-center gap-3 rounded-2xl border p-3.5 text-left", on ? "border-primary bg-surface-2" : "border-line hover:border-mute")}>
                          <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", on ? "border-signal" : "border-line")}>{on && <span className="size-2.5 rounded-full bg-signal" />}</span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="flex items-center gap-2 text-[15px] font-bold">{t.credits.toLocaleString("en-IN")} credits{t.tag && <span className="rounded-full bg-signal-soft px-2 py-0.5 font-mono text-[10px] font-semibold text-signal-ink">{t.tag.toUpperCase()}</span>}</span>
                            <span className="text-[12.5px] text-mute">Never expire · about {Math.floor(t.credits / COSTS.interview)} mock interviews</span>
                          </span>
                          <span className="tnum text-[17px] font-bold">{fmtPrice(t.price[cur], cur)}</span>
                        </button>
                      )
                    })}
                    <p className="text-[12px] leading-snug text-mute">Plans work out cheaper per credit. Top-ups are for when you run short, and they never expire.</p>
                  </div>
                )}
                <button ref={btn} type="button" onClick={pay} disabled={stage === "pay" || isCurrent} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-signal text-[15px] font-semibold text-white disabled:opacity-60">
                  {stage === "pay" ? (
                    <>
                      <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }} className="size-4 rounded-full border-2 border-white/40 border-t-white" />
                      Processing…
                    </>
                  ) : isCurrent ? "This is your plan" : pick.kind === "plan" && change === "keep" ? (
                    `Keep ${PLANS[pick.id].name}`
                  ) : pick.kind === "plan" && change === "downgrade" ? (
                    `Switch to ${PLANS[pick.id].name} on ${fmtD(boundary)}`
                  ) : (
                    <>{pick.kind === "plan" ? (change === "cycle" ? `Switch to ${cycle === "annual" ? "yearly" : "monthly"} billing` : w.plan.id === "free" ? `Start ${PLANS[pick.id].name}` : `Upgrade to ${PLANS[pick.id].name}`) : pick.kind === "pass" ? "Get the Voyage pass" : "Buy credits"} · {fmtPrice(amount, cur)}{pick.kind === "plan" ? (cycle === "annual" ? "/year" : "/month") : ""}</>
                  )}
                </button>
                {effect && <p className="-mt-1 text-center text-[12.5px] leading-snug font-medium text-ink">{effect}</p>}
                <p className="text-center text-[11.5px] leading-snug text-mute">
                  Prototype: no payment is taken ({what}). {pick.kind === "plan" ? "Cancel any time; the plan runs to the end of the month or year you paid for." : ""} {cur === "INR" ? "Prices include GST." : ""}
                </p>
                <p className="text-center text-[12px] text-mute">
                  Or earn free credits: daily chest +{EARN.chest}, badges +{EARN.badge}, level-ups, and +{EARN.share} for each debrief you share.
                </p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------------- in-app Plans & credits screen ---------------- */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const fmtDay = (t: number) => {
  const d = new Date(t)
  return `${d.getDate()} ${MON[d.getMonth()]}`
}
const fmtTime = (t: number) => {
  const d = new Date(t)
  return `${d.getDate()} ${MON[d.getMonth()]} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export const COST_ROWS: { label: string; sub: string; cost: number; icon: (p: { size?: number }) => ReactNode; color: TileColor; screen?: AppScreen }[] = [
  { label: "Ask NilObs, quick", sub: "A short answer with sources", cost: COSTS.askQuick, icon: I.Sparkle, color: "violet", screen: "ask" },
  { label: "Ask NilObs, deep", sub: "A fuller answer from the strongest model", cost: COSTS.askDeep, icon: I.Sparkle, color: "indigo", screen: "ask" },
  { label: "Why it was raised + close-out", sub: "Root cause, fix and a close-out you can copy", cost: COSTS.explain, icon: I.FileText, color: "teal", screen: "radar" },
  { label: "Photo check", sub: "Per photo: what an inspector would flag and how to fix it", cost: COSTS.photo, icon: I.Camera, color: "sky", screen: "photo" },
  { label: "AI inspector interview", sub: "Five graded questions, follow-ups and a debrief", cost: COSTS.interview, icon: I.Mic, color: "orange", screen: "practice" },
  { label: "Voice interview", sub: "The inspector speaks each question. No extra cost on plans", cost: COSTS.voiceInterview, icon: I.Volume, color: "rose", screen: "practice" },
  { label: "Inspection brief + AI plan", sub: "For your oil major, port, rank and date", cost: COSTS.brief, icon: I.Clipboard, color: "sky", screen: "setup" },
  { label: "Full inspection story", sub: "Yours to keep. Included in plans", cost: COSTS.story, icon: I.Newspaper, color: "amber", screen: "stories" },
  { label: "Specialist deck", sub: "ECDIS, CDI or China coast. Included in plans", cost: COSTS.deck, icon: I.Layers, color: "blue", screen: "train" },
  { label: "Streak freeze", sub: "Protects your streak for one missed day", cost: COSTS.freeze, icon: I.Snow, color: "slate", screen: "me" },
]

export function WalletScreen({ go }: { go: (s: AppScreen) => void }) {
  const w = useWallet()
  const p = useProgress()
  const plan = w.state.plan
  const paidUntil = w.state.pass ? fmtDay(w.state.pass.until) : null
  return (
    <>
      <TopBar title="Plans & credits" onBack={() => go("today")} />
      <Scroll>
        <div className="flex flex-col gap-4 rounded-[20px] bg-hero p-5 text-hero-ink">
          <div className="flex items-start justify-between gap-3">
            <span className="flex flex-col gap-1">
              <span className="font-mono text-[11.5px] tracking-[0.1em] text-hero-muted uppercase">Balance</span>
              <span className="flex items-end gap-2">
                <motion.span key={w.flash} initial={{ scale: 1.06 }} animate={{ scale: 1 }} className="tnum display origin-left text-[44px] leading-none font-bold">{w.balance.toLocaleString("en-IN")}</motion.span>
                <span className="pb-1 text-[14px] text-hero-muted">credits</span>
              </span>
            </span>
            <CurrencyToggle value={w.currency} onChange={w.setCurrency} dark />
          </div>
          {w.parts.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="wallet-bar flex h-2 overflow-hidden rounded-full bg-hero-track">
                {w.parts.map((x, i) => <span key={x.key} style={{ width: `${(x.n / Math.max(1, w.balance)) * 100}%`, background: ["#ffb547", "#7cc4ff", "#b9a8ff", "#5fd3a5", "#ffffff"][i % 5] }} />)}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-hero-muted">
                {w.parts.map((x) => (
                  <span key={x.key}><b className="tnum font-semibold text-hero-ink">{x.n}</b> {x.label}{x.expires ? ` · until ${fmtDay(x.expires)}` : x.note ? ` · ${x.note.toLowerCase()}` : ""}</span>
                ))}
              </div>
            </div>
          )}
          <span className="text-[12px] leading-snug text-hero-muted">Credits that expire soonest are used first. Top-ups never expire.</span>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => w.openPlans({ tab: "plans" })} className="h-11 rounded-xl bg-hero-accent text-[14px] font-semibold text-[#1a0a00]">{w.plan.id === "free" ? "See plans" : "Change plan"}</button>
            <button type="button" onClick={() => w.openPlans({ tab: "topup" })} className="h-11 rounded-xl bg-hero-track text-[14px] font-semibold">Top up</button>
          </div>
        </div>

        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="flex flex-col">
              <span className="text-[12px] font-semibold text-mute">Your plan</span>
              <span className="display text-[20px] leading-tight font-bold">{w.plan.name}{w.perks.pass && w.plan.id === "free" ? " + Voyage pass" : ""}</span>
            </span>
            <IconTile icon={w.plan.id === "command" ? I.Crown : w.plan.id === "watch" ? I.Anchor : I.Compass} color={w.plan.id === "free" ? "slate" : "amber"} size={42} />
          </div>
          <span className="text-[13px] leading-snug text-mute">
            {plan.cancelAt
              ? `Cancelled. Your ${w.plan.name} perks and credits last until ${fmtDay(plan.cancelAt)}, then you move to Free.`
              : w.plan.id === "free"
                ? `${PLANS.free.credits} free credits arrive on ${fmtDay(plan.renews)}.`
                : `${w.plan.credits.toLocaleString("en-IN")} credits refill on ${fmtDay(plan.renews)}. ${plan.cycle === "annual" ? `Billed yearly; the year runs to ${fmtDay(plan.term)}.` : "Billed monthly."}`}
            {plan.next ? ` Moves to ${PLANS[plan.next.id].name} on ${fmtDay(plan.cycle === "annual" ? plan.term : plan.renews)}.` : ""}
            {paidUntil ? ` Voyage pass active until ${paidUntil}.` : ""}
          </span>
          <ul className="flex flex-col gap-1.5">
            {(w.plan.id !== "free" ? PLANS[w.plan.id].perks : w.perks.pass ? PASS.perks : PLANS.free.perks).map((x) => (
              <li key={x} className="flex gap-2 text-[13px] leading-snug"><I.Check size={15} className="mt-0.5 shrink-0 text-sea" />{x}</li>
            ))}
          </ul>
          {w.plan.id !== "free" && !plan.cancelAt && (
            <button type="button" onClick={w.cancelPlan} className="self-start text-[12.5px] font-semibold text-mute underline underline-offset-2">Cancel plan</button>
          )}
          {(plan.cancelAt || plan.next) && (
            <button type="button" onClick={() => w.subscribe(w.plan.id, plan.cycle)} className="self-start text-[12.5px] font-semibold text-primary">Keep my {w.plan.name} plan</button>
          )}
        </section>

        <Section title="What things cost">
          <div className="flex flex-col rounded-2xl border border-line bg-surface px-3.5">
            {COST_ROWS.map((r) => {
              const included = (r.screen === "stories" && w.perks.allStories) || (r.screen === "train" && w.perks.allDecks)
              return (
                <button key={r.label} type="button" onClick={() => r.screen && go(r.screen)} className="flex items-center gap-3 border-b border-line py-3 text-left last:border-0">
                  <IconTile icon={r.icon} color={r.color} size={34} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[13.5px] font-semibold">{r.label}</span>
                    <span className="text-[12px] leading-snug text-mute">{r.sub}</span>
                  </span>
                  {included ? <span className="rounded-full bg-sea-soft px-2 py-0.5 text-[11px] font-semibold text-sea">Included</span> : <span className="tnum flex items-center gap-1 font-mono text-[13px] font-semibold"><I.Coin size={14} />{r.cost}</span>}
                </button>
              )
            })}
          </div>
          <p className="text-[12.5px] leading-snug text-mute">Always free: flashcards, Spot the observation, the radar, the ready kit, missions, the question bank and the official checklist. A failed AI answer is refunded automatically.</p>
        </Section>

        <Section title="Earn free credits">
          <div className="grid grid-cols-2 gap-2">
            {([
              [`+${EARN.chest} a day`, "Open the daily chest", I.Gift, "rose"],
              [`+${EARN.badge} each`, "Win a badge", I.Award, "violet"],
              [`+${EARN.level[2]} to +${EARN.level[10]}`, "Level up", I.Crown, "amber"],
              [`+${EARN.streak[7]} / +${EARN.streak[30]}`, "7 and 30-day streaks", I.Flame, "orange"],
            ] as const).map(([v, l, Icon, c]) => (
              <span key={l} className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface p-3">
                <IconTile icon={Icon} color={c as TileColor} size={34} />
                <span className="flex flex-col">
                  <span className="tnum text-[14px] font-bold">{v}</span>
                  <span className="text-[11.5px] leading-snug text-mute">{l}</span>
                </span>
              </span>
            ))}
          </div>
          <button type="button" onClick={() => go("share")} className="flex items-center gap-3.5 rounded-2xl border border-dashed border-line p-4 text-left">
            <IconTile icon={I.Plus} color="green" size={40} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-bold">+{EARN.share} credits for a debrief</span>
              <span className="text-[12.5px] text-mute">Share an anonymous debrief after an inspection. Up to {EARN.sharePerMonth} a month.</span>
            </span>
            <I.ArrowRight size={17} className="text-mute" />
          </button>
          <p className="text-[12px] text-mute">Earned credits last 60 days. Next level: {p.level.next ? `${p.level.next.name} in ${p.level.toNext.toLocaleString("en-IN")} XP (+${EARN.level[p.level.n + 1] ?? 0} credits)` : "you're at the top"}. Levels: {LEVELS.length}.</p>
        </Section>

        <Section title="History" aside={`${w.ledger.length} entries`}>
          <ol className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
            {w.ledger.slice(0, 40).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13.5px] leading-snug font-medium">{e.label}</span>
                  <span className="font-mono text-[11px] text-mute">{fmtTime(e.at)}{e.refunded ? " · refunded" : ""}</span>
                </span>
                <span className={cn("tnum shrink-0 font-mono text-[13.5px] font-semibold", e.delta > 0 ? "text-sea" : e.kind === "expire" ? "text-mute" : "text-ink")}>{e.delta > 0 ? `+${e.delta}` : e.delta || "·"}</span>
              </li>
            ))}
          </ol>
        </Section>
        <p className="text-center text-[11.5px] leading-snug text-mute">Prototype: purchases are simulated. Signed in, your credits follow your Google account; signed out, they stay in this browser. Plan dates use your device's clock. Last checked {dayOf(Date.now())}.</p>
      </Scroll>
    </>
  )
}

export { PLAN_ORDER }
