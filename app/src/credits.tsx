// Wallet: the React side of the credit economy in economy.ts. Kept per browser in localStorage
// for this prototype; the same rules can run on a server once there are real accounts.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { motion } from "motion/react"

import * as I from "@/components/icons"
import { cn } from "@/lib/utils"
import { STORIES } from "@/stories"
import {
  COSTS, EARN, PASS, PLANS, TOPUPS, WELCOME, balance as balanceOf, breakdown, buyPass as ecoPass, buyTopUp as ecoTopUp, cancelPlan as ecoCancel,
  changeKind as ecoChangeKind, defaultCurrency, earn as ecoEarn, expiringSoon, fmtPrice, migrate, perks as perksOf, recordShare, refund as ecoRefund,
  settle as ecoSettle, shareStatus, spend as ecoSpend, subscribe as ecoSubscribe, tick, type Currency, type Cycle, type Entry, type Plan, type PlanId,
  type Usage, type UsageKey, type WalletState,
} from "@/economy"

export { COSTS, EARN, PASS, PLANS, TOPUPS, WELCOME, fmtPrice }
export type { Currency, Cycle, PlanId }
/** Free credits a new user starts with (welcome + first month on Free). */
export const WELCOME_CREDITS = WELCOME.credits + PLANS.free.credits

/** Stories anyone can read in full: the three featured ones, plus a different one each week. */
const FEATURED = STORIES.filter((s) => s.featured).map((s) => s.d.id)
export function storyOfTheWeek(now = Date.now()) {
  const pool = STORIES.filter((s) => !s.featured)
  const week = Math.floor(now / (7 * 86400000))
  return pool[week % pool.length].d.id
}
export const isFreeStory = (id: number) => FEATURED.includes(id) || id === storyOfTheWeek()

export type SheetTab = "plans" | "topup"
interface Sheet {
  reason?: string
  tab: SheetTab
  select?: string
  cycle?: Cycle
}
/** One id per page load, so charges held by a page that has closed can be refunded. */
const PAGE = Math.random().toString(36).slice(2, 10)

export interface Wallet {
  state: WalletState
  balance: number
  plan: Plan
  perks: ReturnType<typeof perksOf>
  expiring: ReturnType<typeof expiringSoon>
  parts: ReturnType<typeof breakdown>
  ledger: Entry[]
  usage: Usage
  currency: Currency
  setCurrency: (c: Currency) => void
  flash: number
  /**
   * Take credits for something. Returns a receipt id, or null (and opens the plans sheet) if short.
   * With `hold`, the charge is refunded automatically unless `settle` is called (for AI calls).
   */
  charge: (cost: number, label: string, usage?: UsageKey, opts?: { hold?: boolean }) => string | null
  /** The AI call behind a held charge finished: keep the charge. */
  settle: (receipt: string | null) => void
  /** Give back a charge whose AI call failed. */
  refund: (receipt: string | null, usage?: UsageKey) => void
  changeKind: (id: PlanId, cycle: Cycle) => ReturnType<typeof ecoChangeKind>
  /** Credits earned by learning. */
  earn: (n: number, label: string) => void
  buyTopUp: (id: string) => void
  buyPass: () => void
  subscribe: (id: PlanId, cycle: Cycle) => void
  cancelPlan: () => void
  unlock: (storyId: number) => boolean
  isUnlocked: (storyId: number) => boolean
  hasDeck: (id: string, cost: number) => boolean
  unlockDeck: (id: string, cost: number, name: string) => boolean
  share: (text?: string) => ReturnType<typeof shareStatus>
  recordShare: (text: string) => boolean
  sheet: Sheet | null
  openPlans: (o?: Partial<Sheet>) => void
  /** Older name, kept for callers that only want to open the sheet. */
  openTopUp: (reason?: string, select?: string) => void
  closePlans: () => void
}

const KEY = "sr.wallet"
const CUR_KEY = "sr.currency"
function load(now: number): WalletState {
  try {
    const raw = localStorage.getItem(KEY)
    return tick(migrate(raw ? JSON.parse(raw) : null, now), now, PAGE)
  } catch {
    return migrate(null, now)
  }
}

const Ctx = createContext<Wallet | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(() => load(Date.now()))
  const ref = useRef(state)
  const [flash, setFlash] = useState(0)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [currency, setCur] = useState<Currency>(() => {
    try {
      const c = localStorage.getItem(CUR_KEY)
      if (c === "INR" || c === "USD") return c
    } catch {
      /* ignore */
    }
    return defaultCurrency()
  })
  const setCurrency = useCallback((c: Currency) => {
    setCur(c)
    try {
      localStorage.setItem(CUR_KEY, c)
    } catch {
      /* ignore */
    }
  }, [])

  /** Every change goes through here, so rapid double taps always see the latest balance. */
  const commit = useCallback((next: WalletState, bump = true) => {
    ref.current = next
    setState(next)
    if (bump) setFlash((f) => f + 1)
  }, [])

  const written = useRef("")
  useEffect(() => {
    try {
      const json = JSON.stringify(state)
      if (json !== written.current) {
        written.current = json
        localStorage.setItem(KEY, json)
      }
    } catch {
      /* storage unavailable: the wallet lives in memory */
    }
  }, [state])

  // Another tab changed the wallet: take its version, so two tabs never overwrite each other
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue || e.newValue === written.current) return
      try {
        written.current = e.newValue
        commit(tick(migrate(JSON.parse(e.newValue), Date.now()), Date.now(), PAGE), false)
      } catch {
        /* ignore a bad write */
      }
    }
    window.addEventListener("storage", on)
    return () => window.removeEventListener("storage", on)
  }, [commit])

  // Expire credits and renew plans while the app is open
  useEffect(() => {
    const run = () => {
      const cur = ref.current, now = Date.now()
      const next = tick(cur, now, PAGE)
      if (next.ledger.length !== cur.ledger.length || next.plan.renews !== cur.plan.renews || (next.pass?.until ?? 0) !== (cur.pass?.until ?? 0) || next.holds.length !== cur.holds.length) commit(next, false)
    }
    run()
    const t = setInterval(run, 30000)
    window.addEventListener("focus", run)
    return () => {
      clearInterval(t)
      window.removeEventListener("focus", run)
    }
  }, [commit])

  const value = useMemo<Wallet>(() => {
    const now = Date.now()
    const perks = perksOf(state, now)
    const bal = balanceOf(state, now)
    const charge: Wallet["charge"] = (cost, label, usage, opts) => {
      const r = ecoSpend(ref.current, cost, label, Date.now(), usage, opts?.hold ? PAGE : undefined)
      if (!r.ok) {
        commit(r.state, false)
        const have = balanceOf(r.state, Date.now())
        setSheet({ tab: r.state.plan.id === "free" ? "plans" : "topup", reason: `This needs ${cost} credit${cost === 1 ? "" : "s"} and you have ${have}.` })
        return null
      }
      commit(r.state)
      return r.entry
    }
    const isUnlocked = (id: number) => perks.allStories || ref.current.unlocked.includes(id) || isFreeStory(id)
    return {
      state,
      balance: bal,
      plan: PLANS[state.plan.id],
      perks,
      expiring: expiringSoon(state, now),
      parts: breakdown(state, now),
      ledger: state.ledger,
      usage: state.usage,
      currency,
      setCurrency,
      flash,
      charge,
      settle: (receipt) => {
        if (receipt) commit(ecoSettle(ref.current, receipt), false)
      },
      refund: (receipt, usage) => {
        if (receipt) commit(ecoRefund(ref.current, receipt, Date.now(), usage))
      },
      changeKind: (id, cycle) => ecoChangeKind(ref.current, id, cycle),
      earn: (n, label) => commit(ecoEarn(ref.current, n, label, Date.now())),
      buyTopUp: (id) => {
        const t = TOPUPS.find((x) => x.id === id)
        if (t) commit(ecoTopUp(ref.current, t, currency, Date.now()))
      },
      buyPass: () => commit(ecoPass(ref.current, currency, Date.now())),
      subscribe: (id, cycle) => commit(ecoSubscribe(ref.current, id, cycle, currency, Date.now())),
      cancelPlan: () => commit(ecoCancel(ref.current, Date.now()), false),
      unlock: (id) => {
        if (isUnlocked(id)) return true
        const rec = charge(COSTS.story, "Unlocked an inspection story", "stories")
        if (!rec) return false
        const next = { ...ref.current, unlocked: [...ref.current.unlocked, id] }
        commit(next, false)
        return true
      },
      isUnlocked,
      hasDeck: (id, cost) => cost === 0 || perks.allDecks || ref.current.decks.includes(id),
      unlockDeck: (id, cost, name) => {
        if (cost === 0 || perks.allDecks || ref.current.decks.includes(id)) return true
        const rec = charge(cost, `Unlocked deck: ${name}`, "decks")
        if (!rec) return false
        commit({ ...ref.current, decks: [...ref.current.decks, id] }, false)
        return true
      },
      share: (text) => shareStatus(ref.current, Date.now(), text),
      recordShare: (text) => {
        if (!shareStatus(ref.current, Date.now(), text).ok) return false
        commit(recordShare(ref.current, Date.now(), text))
        return true
      },
      sheet,
      openPlans: (o = {}) => setSheet({ tab: o.tab ?? "plans", reason: o.reason, select: o.select, cycle: o.cycle }),
      openTopUp: (reason, select) => setSheet({ tab: select && select.startsWith("t") ? "topup" : "plans", reason, select }),
      closePlans: () => setSheet(null),
    }
  }, [state, flash, sheet, currency, setCurrency, commit])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWallet() {
  const w = useContext(Ctx)
  if (!w) throw new Error("useWallet outside WalletProvider")
  return w
}

export function CreditPill({ onClick, className }: { onClick?: () => void; className?: string }) {
  const w = useWallet()
  const low = w.balance < 10
  return (
    <button
      type="button"
      onClick={onClick ?? (() => w.openPlans())}
      aria-label={`${w.balance} credits. Plans and credits`}
      className={cn(
        "tnum flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 font-mono text-[12px] font-semibold whitespace-nowrap",
        low ? "border-signal bg-signal-soft text-signal-ink" : "border-line bg-surface text-ink",
        className
      )}
    >
      <I.Coin size={15} />
      <motion.span key={w.flash} initial={{ scale: 1.3 }} animate={{ scale: 1 }}>
        {w.balance}
      </motion.span>
    </button>
  )
}

export function CostTag({ cost, className, free }: { cost: number; className?: string; free?: boolean }) {
  if (free) return <span className={cn("rounded-full bg-sea-soft px-2 py-0.5 text-[11px] font-semibold text-sea", className)}>Included</span>
  return (
    <span className={cn("tnum inline-flex items-center gap-1 font-mono text-[11.5px] font-semibold", className)}>
      <I.Coin size={13} />
      {cost}
    </span>
  )
}

/** Shown on Today when credits run low or are about to expire. */
export function WalletNudge({ onOpen }: { onOpen: () => void }) {
  const w = useWallet()
  const days = (t: number) => Math.max(0, Math.ceil((t - Date.now()) / 86400000))
  let msg: ReactNode = null
  if (w.expiring) msg = <><b className="font-semibold">{w.expiring.n} credits expire {days(w.expiring.at) <= 1 ? "tomorrow" : `in ${days(w.expiring.at)} days`}.</b> Use them on a mock interview or a brief.</>
  else if (w.balance < 10 && w.plan.id === "free") msg = <><b className="font-semibold">{w.balance} credits left.</b> Watchkeeper gives you {PLANS.watch.credits} a month for {fmtPrice(PLANS.watch.price[w.currency].monthly, w.currency)}.</>
  else if (w.balance < 10) msg = <><b className="font-semibold">{w.balance} credits left</b> until your plan refills. Top-ups never expire.</>
  if (!msg) return null
  return (
    <button type="button" onClick={onOpen} className="flex items-center gap-3 rounded-2xl border border-[#ffd2b0] bg-[#fff6ee]/85 px-3.5 py-3 text-left text-[13px] leading-snug text-[#7a2e05]">
      <I.Coin size={18} className="shrink-0" />
      <span className="min-w-0 flex-1">{msg}</span>
      <I.ArrowRight size={16} className="shrink-0" />
    </button>
  )
}
