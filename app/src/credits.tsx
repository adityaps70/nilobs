// Wallet: the React side of the credit economy in economy.ts. Two homes for the credits:
// - Signed in on nilobs.com ("account"): the server keeps the wallet (worker/wallet.js). Prices, balances,
//   purchases and refunds are worked out there; this browser only shows a copy. A charge appears on screen
//   at once and the server confirms it a moment later; the AI or voice call it pays for carries its ticket.
//   Editing this browser's storage changes nothing the server will accept.
// - Signed out, or in the Claude artifact ("local"): a wallet kept in this browser. In the artifact the AI
//   runs on the viewer's own Claude access, so these are practice credits and purchases are simulated.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { motion } from "motion/react"

import * as I from "@/components/icons"
import { cn } from "@/lib/utils"
import { STORIES } from "@/stories"
import { HOSTED } from "@/ai"
import { UNAUTHORIZED_EVENT, useAuth } from "@/auth"
import { trackTicket, readyTicket } from "@/tickets"
import {
  COSTS, EARN, ITEMS, PASS, PLANS, TOPUPS, WELCOME, balance as balanceOf, breakdown, defaultCurrency, earn as ecoEarn, expiringSoon, fmtPrice,
  grantPurchase, itemCost, migrate, perks as perksOf, product, recordShare, refund as ecoRefund, settle as ecoSettle, shareStatus,
  spend as ecoSpend, tick, type Currency, type Cycle, type Entry, type Item, type ItemKind, type Plan, type PlanId, type Usage, type WalletState,
} from "@/economy"

export { COSTS, EARN, PASS, PLANS, TOPUPS, WELCOME, fmtPrice }
export type { Currency, Cycle, Item, PlanId }
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
  /** Show the sheet already finished, with this message (after coming back from a card payment). */
  done?: string
}
export type WalletMode = "account" | "local"
/** How a currency is paid on the server: Cashfree, a test switch, or not open yet. */
export type CheckoutMode = "cashfree" | "simulated" | null
export type EarnKind = "badge" | "level" | "streak" | "chest"
export type BuyResult = { ok: true; message: string } | { ok: false; cancelled?: boolean; error?: string } | { redirect: true }

/** One id per page load, so charges held by a page that has closed can be refunded. */
const PAGE = Math.random().toString(36).slice(2, 10)
const newRef = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, "").slice(0, 24)

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
  /** "account": the server keeps this wallet; "local": this browser does. */
  mode: WalletMode
  /** False until the account's wallet has loaded from the server at least once. */
  ready: boolean
  /** Account mode: how each currency can be paid. Null in local mode. */
  checkout: Record<Currency, CheckoutMode> | null
  /** What an item costs this wallet now (null: not available, e.g. Expert without Command). */
  price: (item: Item) => number | null
  /**
   * Pay for something. Returns a receipt (in account mode, the ticket the AI call sends), or null when
   * there aren't enough credits (the plans sheet opens). AI charges are given back if no answer arrives.
   */
  charge: (item: Item, opts?: { note?: string }) => string | null
  /** The AI call behind a charge finished: keep it. */
  settle: (receipt: string | null) => void
  /** Give back a charge whose AI call failed (refused by the server once anything was delivered). */
  refund: (receipt: string | null) => void
  /** Credits earned by learning: each badge, level and streak milestone once, a chest a day. */
  earn: (kind: EarnKind, key: string | number, label: string) => void
  /** After signing in: pay out badges, levels and streaks reached on this device before. */
  claimAll: (c: { badges: string[]; level: number; streakBest: number }) => void
  /** Buy a product ("topup:t500", "pass", "plan:watch:monthly"). Cashfree needs the buyer's mobile number. */
  buy: (key: string, opts?: { phone?: string }) => Promise<BuyResult>
  unlock: (storyId: number) => boolean
  isUnlocked: (storyId: number) => boolean
  hasDeck: (id: string, cost: number) => boolean
  unlockDeck: (id: string, cost: number, name: string) => boolean
  share: (text?: string) => ReturnType<typeof shareStatus>
  recordShare: (text: string) => boolean
  refresh: () => void
  sheet: Sheet | null
  openPlans: (o?: Partial<Sheet>) => void
  /** Older name, kept for callers that only want to open the sheet. */
  openTopUp: (reason?: string, select?: string) => void
  closePlans: () => void
}

const KEY = "sr.wallet"
const ACCT_KEY = "sr.wallet.acct"
const CUR_KEY = "sr.currency"
function load(now: number): WalletState {
  try {
    const raw = localStorage.getItem(KEY)
    return tick(migrate(raw ? JSON.parse(raw) : null, now), now, PAGE)
  } catch {
    return migrate(null, now)
  }
}

/* ---------------- the account's wallet on the server ---------------- */
interface AcctView {
  wallet: WalletState
  version: number
  claims: string[]
  checkout: Record<Currency, CheckoutMode>
}
type ApiErr = { status: number; code: string; message: string; need?: number; have?: number }
async function walletApi<T>(path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw { status: 0, code: "offline", message: "No connection. Try again when you have signal." } satisfies ApiErr
  }
  let j: Record<string, unknown> | null = null
  try {
    j = (await res.json()) as Record<string, unknown>
  } catch {
    /* empty */
  }
  if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  if (!res.ok) throw { status: res.status, code: String(j?.code || "error"), message: String(j?.error || "Something went wrong. Try again."), need: Number(j?.need) || undefined, have: Number(j?.have) || undefined } satisfies ApiErr
  return j as T
}
const okView = (v: unknown): v is AcctView => !!v && typeof v === "object" && !!(v as AcctView).wallet && Array.isArray((v as AcctView).wallet.buckets)
function readAcct(user: string): AcctView | null {
  try {
    const c = JSON.parse(localStorage.getItem(ACCT_KEY) || "null")
    return c && c.user === user && okView(c.view) ? { ...c.view, wallet: migrate(c.view.wallet, Date.now()) } : null
  } catch {
    return null
  }
}
function writeAcct(user: string, view: AcctView) {
  try {
    localStorage.setItem(ACCT_KEY, JSON.stringify({ user, view }))
  } catch {
    /* storage full or blocked: the copy lives in memory */
  }
}

/* ---------------- Cashfree Checkout ---------------- */
type CashfreeResult = { error?: { message?: string }; redirect?: boolean; paymentDetails?: { paymentMessage?: string } }
type CashfreeInstance = { checkout: (o: { paymentSessionId: string; redirectTarget?: string }) => Promise<CashfreeResult | undefined> }
type CashfreeFactory = (o: { mode: "sandbox" | "production" }) => CashfreeInstance
let cfSdk: Promise<CashfreeFactory> | null = null
function loadCashfree(): Promise<CashfreeFactory> {
  cfSdk ??= new Promise<CashfreeFactory>((resolve, reject) => {
    const w = window as unknown as { Cashfree?: CashfreeFactory }
    if (w.Cashfree) return resolve(w.Cashfree)
    const s = document.createElement("script")
    s.src = "https://sdk.cashfree.com/js/v3/cashfree.js"
    s.async = true
    s.onload = () => (w.Cashfree ? resolve(w.Cashfree) : reject(new Error("no cashfree")))
    s.onerror = () => {
      cfSdk = null
      reject(new Error("blocked"))
    }
    document.head.appendChild(s)
  })
  return cfSdk
}
type Confirmed = { status: "paid" | "pending" | "failed" | "gone"; view?: unknown }
/** Ask the server (which asks Cashfree) whether an order is paid, a few times while it's still pending. */
async function confirmOrder(orderId: string, tries: number): Promise<Confirmed> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await walletApi<{ status: string } & Record<string, unknown>>("/api/pay/cashfree/confirm", { orderId })
      if (r.status === "paid") return { status: "paid", view: r }
      if (r.status === "failed") return { status: "failed" }
    } catch (e) {
      if ((e as ApiErr).status === 404 || (e as ApiErr).status === 409) return { status: "gone" }
    }
    if (i < tries - 1) await new Promise((res) => setTimeout(res, 2000))
  }
  return { status: "pending" }
}
const STILL_CONFIRMING = "Your payment is still being confirmed. Your credits arrive as soon as Cashfree confirms it; there's no need to pay again."

/** What a purchase gave, for the sheet's "done" message. */
function boughtMessage(key: string): string {
  const p = product(key)
  if (!p) return "Done."
  if (p.kind === "topup") return `${p.credits.toLocaleString("en-IN")} credits added. Top-ups never expire.`
  if (p.kind === "pass") return `Your Voyage pass is active: ${PASS.credits.toLocaleString("en-IN")} credits and Watchkeeper perks for ${PASS.days} days.`
  return `${p.name} is yours. ${p.credits.toLocaleString("en-IN")} credits now, and again every 30 days while it runs.`
}

const Ctx = createContext<Wallet | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const account = HOSTED && auth.status === "in" && auth.user ? auth.user.id : ""
  const mode: WalletMode = account ? "account" : "local"

  const [local, setLocal] = useState<WalletState>(() => load(Date.now()))
  const [acct, setAcct] = useState<AcctView | null>(null)
  const [acctFor, setAcctFor] = useState("")
  const [ready, setReady] = useState(false)
  // until the account's wallet arrives, show a new account's (never this browser's signed-out one)
  const placeholder = useMemo(() => migrate(null, Date.now()), [])
  const shown = mode === "account" ? (acctFor === account && acct ? acct.wallet : placeholder) : local
  const ref = useRef<WalletState>(shown)
  const [flash, setFlash] = useState(0)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const inflight = useRef(0)
  const acctRef = useRef(account)
  acctRef.current = account
  const kinds = useRef(new Map<string, ItemKind>())
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

  // Switching between this browser's wallet and the account's (sign in, sign out)
  useEffect(() => {
    if (!account) {
      setAcct(null)
      setAcctFor("")
      setReady(false)
      ref.current = local
      return
    }
    const cached = readAcct(account)
    setAcct(cached)
    setAcctFor(account)
    setReady(false)
    ref.current = cached ? cached.wallet : placeholder
  }, [account]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Every local change goes through here, so rapid double taps always see the latest balance. */
  const commit = useCallback((next: WalletState, bump = true) => {
    ref.current = next
    if (acctRef.current) setAcct((a) => (a ? { ...a, wallet: next } : { wallet: next, version: -1, claims: [], checkout: { INR: null, USD: null } }))
    else setLocal(next)
    if (bump) setFlash((f) => f + 1)
  }, [])

  /** The server's copy arrived: it replaces whatever this browser showed. */
  const apply = useCallback((v: unknown, user: string, bump = false) => {
    if (!okView(v) || user !== acctRef.current) return
    const view: AcctView = { wallet: v.wallet, version: v.version, claims: v.claims || [], checkout: v.checkout || { INR: null, USD: null } }
    ref.current = view.wallet
    setAcct(view)
    setReady(true)
    writeAcct(user, view)
    if (bump) setFlash((f) => f + 1)
  }, [])

  const refresh = useCallback(() => {
    const user = acctRef.current
    if (!user) return
    walletApi<AcctView>("/api/wallet")
      .then((v) => {
        // a charge on its way would be undone on screen by an older copy: its own reply brings the news
        if (!inflight.current) apply(v, user)
      })
      .catch(() => {})
  }, [apply])

  // This browser's wallet: save it, follow other tabs, expire credits while open
  const written = useRef("")
  useEffect(() => {
    try {
      const json = JSON.stringify(local)
      if (json !== written.current) {
        written.current = json
        localStorage.setItem(KEY, json)
      }
    } catch {
      /* storage unavailable: the wallet lives in memory */
    }
  }, [local])
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue || e.newValue === written.current) return
      try {
        written.current = e.newValue
        const next = tick(migrate(JSON.parse(e.newValue), Date.now()), Date.now(), PAGE)
        setLocal(next)
        if (!acctRef.current) ref.current = next
      } catch {
        /* ignore a bad write */
      }
    }
    window.addEventListener("storage", on)
    return () => window.removeEventListener("storage", on)
  }, [])
  useEffect(() => {
    if (mode !== "local") return
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
  }, [mode, commit])

  // The account's wallet: load it, and look again when the app comes back to the front and every minute
  useEffect(() => {
    if (mode !== "account") return
    refresh()
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), 60000)
    const vis = () => document.visibilityState === "visible" && refresh()
    document.addEventListener("visibilitychange", vis)
    window.addEventListener("focus", vis)
    return () => {
      clearInterval(t)
      document.removeEventListener("visibilitychange", vis)
      window.removeEventListener("focus", vis)
    }
  }, [mode, account, refresh])

  // Back from Cashfree's payment page (in-app browsers can't show the pop-up): did the payment go through?
  useEffect(() => {
    if (mode !== "account" || !ready) return
    const q = new URLSearchParams(window.location.search)
    const how = q.get("checkout")
    if (!how) return
    const orderId = q.get("order_id") || ""
    const u = new URL(window.location.href)
    u.searchParams.delete("checkout")
    u.searchParams.delete("order_id")
    window.history.replaceState(null, "", u.pathname + u.search + u.hash)
    if (how !== "cashfree" || !/^pay_[A-Za-z0-9]+$/.test(orderId)) return
    const user = account
    let on = true
    confirmOrder(orderId, 6).then((r) => {
      if (!on) return
      if (r.status === "paid") {
        apply(r.view, user, true)
        setSheet({ tab: "plans", done: "Payment received. Thank you!" })
      } else if (r.status === "pending") setSheet({ tab: "plans", reason: STILL_CONFIRMING })
      else if (r.status === "failed") setSheet({ tab: "plans", reason: "That payment didn't go through, so nothing was charged. You can try again." })
    })
    return () => {
      on = false
    }
  }, [mode, ready, account, apply])

  const value = useMemo<Wallet>(() => {
    const now = Date.now()
    const state = shown
    const perks = perksOf(state, now)
    const bal = balanceOf(state, now)
    const user = account
    const short = (cost: number, have: number) =>
      setSheet({ tab: ref.current.plan.id === "free" ? "plans" : "topup", reason: `This needs ${cost} credit${cost === 1 ? "" : "s"} and you have ${have}.` })
    const labelOf = (item: Item, note?: string) => `${ITEMS[item.kind].label(item)}${note ? ` · ${note}` : ""}`

    /** Ask the server; on any refusal, show what it says and take its copy again. */
    const send = (path: string, body: unknown) => {
      inflight.current++
      const p = walletApi<AcctView & Record<string, unknown>>(path, body)
        .then((v) => {
          inflight.current--
          apply(v, user)
          return v
        })
        .catch((e: ApiErr) => {
          inflight.current--
          // not accepted: go back to the last copy the server confirmed, then ask for a fresh one
          const last = readAcct(user)
          if (last && user === acctRef.current) {
            ref.current = last.wallet
            setAcct(last)
          }
          if (e.code === "short") short(e.need ?? 0, e.have ?? 0)
          refresh()
          throw e
        })
      p.catch(() => {})
      return p
    }

    const charge: Wallet["charge"] = (item, opts) => {
      const cur = ref.current
      const t = Date.now()
      const cost = itemCost(item, perksOf(cur, t))
      if (cost == null) {
        if (item.kind === "askExpert") setSheet({ tab: "plans", select: "command", reason: "Expert answers come with the Command plan." })
        return null
      }
      const rule = ITEMS[item.kind]
      if (user) {
        if (balanceOf(cur, t) < cost) {
          short(cost, balanceOf(cur, t))
          return null
        }
        const id = newRef()
        let next = cur
        if (cost > 0) {
          const r = ecoSpend(cur, cost, labelOf(item, opts?.note), t, rule.usage)
          if (r.ok) next = r.state
        }
        if (item.kind === "story") next = { ...next, unlocked: [...next.unlocked, Number(item.id)] }
        if (item.kind === "deck") next = { ...next, decks: [...next.decks, String(item.id)] }
        commit(next, cost > 0)
        trackTicket(id, send("/api/wallet/spend", { item, ref: id, note: opts?.note || "" }))
        return id
      }
      const r = ecoSpend(cur, cost, labelOf(item, opts?.note), t, rule.usage, rule.ai?.hold ? PAGE : undefined)
      if (!r.ok) {
        commit(r.state, false)
        short(cost, balanceOf(r.state, t))
        return null
      }
      let next = r.state
      if (item.kind === "story") next = { ...next, unlocked: [...next.unlocked, Number(item.id)] }
      if (item.kind === "deck") next = { ...next, decks: [...next.decks, String(item.id)] }
      commit(next, cost > 0)
      kinds.current.set(r.entry, item.kind)
      return r.entry
    }

    const isUnlocked = (id: number) => perks.allStories || ref.current.unlocked.includes(id) || isFreeStory(id)
    const hasDeck = (id: string, cost: number) => cost === 0 || perksOf(ref.current, Date.now()).allDecks || ref.current.decks.includes(id)
    const earnAmount = (kind: EarnKind, key: string | number) =>
      kind === "badge" ? EARN.badge : kind === "chest" ? EARN.chest : kind === "level" ? EARN.level[Number(key)] || 0 : EARN.streak[Number(key)] || 0

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
      mode,
      ready: mode === "local" || ready,
      checkout: mode === "account" ? acct?.checkout ?? null : null,
      price: (item) => itemCost(item, perks),
      charge,
      settle: (receipt) => {
        if (!receipt) return
        // the server keeps a charge the moment the answer starts arriving; just show its copy
        if (user) setTimeout(refresh, 400)
        else commit(ecoSettle(ref.current, receipt), false)
      },
      refund: (receipt) => {
        if (!receipt) return
        if (user) {
          readyTicket(receipt)
            .then(() => send("/api/wallet/refund", { ticket: receipt }))
            .catch(() => refresh())
          return
        }
        const kind = kinds.current.get(receipt)
        commit(ecoRefund(ref.current, receipt, Date.now(), kind ? ITEMS[kind].usage : undefined))
      },
      earn: (kind, key, label) => {
        const n = earnAmount(kind, key)
        if (!n) return
        commit(ecoEarn(ref.current, n, label, Date.now()))
        if (user) send("/api/wallet/earn", { kind, key, label }).catch(() => {})
      },
      claimAll: (c) => {
        if (user) send("/api/wallet/claims", c).catch(() => {})
      },
      buy: async (key, opts) => {
        const p = product(key)
        if (!p) return { ok: false, error: "Unknown product" }
        if (!user) {
          // this browser's practice wallet: nothing is charged
          const r = grantPurchase(ref.current, key, currency, Date.now(), `${fmtPrice(p.price[currency], currency)} (prototype, no charge)`)
          if (!r.ok) return { ok: false, error: r.why }
          commit(r.state)
          return { ok: true, message: boughtMessage(key) }
        }
        try {
          const o = await walletApi<Record<string, unknown>>("/api/pay/order", { product: key, currency, phone: opts?.phone || "" })
          if (o.provider === "simulated") {
            apply(o, user, true)
            return { ok: true, message: boughtMessage(key) }
          }
          if (o.provider !== "cashfree" || typeof o.sessionId !== "string" || typeof o.orderId !== "string") return { ok: false, error: "Payments aren't open yet." }
          const orderId = o.orderId
          const Cashfree = await loadCashfree()
          const result = await Cashfree({ mode: o.mode === "production" ? "production" : "sandbox" }).checkout({ paymentSessionId: o.sessionId, redirectTarget: "_modal" })
          // the pop-up couldn't open here (an in-app browser): Cashfree's page brings the buyer back to us
          if (result?.redirect) return { redirect: true }
          // paid, failed or closed: the server asks Cashfree which
          const r = await confirmOrder(orderId, result?.error ? 2 : 5)
          if (r.status === "paid") {
            apply(r.view, user, true)
            return { ok: true, message: boughtMessage(key) }
          }
          // a UPI payment finished on the phone can still arrive after the pop-up closes
          setTimeout(refresh, 20000)
          if (r.status === "failed") return { ok: false, error: "That payment didn't go through, so nothing was charged. Try again." }
          if (result?.error) return { ok: false, cancelled: true }
          return { ok: false, error: STILL_CONFIRMING }
        } catch (e) {
          const er = e as ApiErr
          return { ok: false, error: er.code === "offline" ? er.message : er.message || "The payment couldn't start. Try again." }
        }
      },
      unlock: (id) => {
        if (isUnlocked(id)) return true
        return !!charge({ kind: "story", id })
      },
      isUnlocked,
      hasDeck,
      unlockDeck: (id, cost, name) => {
        if (hasDeck(id, cost)) return true
        return !!charge({ kind: "deck", id }, { note: name })
      },
      share: (text) => shareStatus(ref.current, Date.now(), text),
      recordShare: (text) => {
        const t = text.trim()
        if (!shareStatus(ref.current, Date.now(), t).ok || (user && t.length < 40)) return false
        commit(recordShare(ref.current, Date.now(), t))
        if (user) send("/api/wallet/earn", { kind: "share", text: t }).catch(() => {})
        return true
      },
      refresh,
      sheet,
      openPlans: (o = {}) => setSheet({ tab: o.tab ?? "plans", reason: o.reason, select: o.select, cycle: o.cycle }),
      openTopUp: (reason, select) => setSheet({ tab: select && select.startsWith("t") ? "topup" : "plans", reason, select }),
      closePlans: () => setSheet(null),
    }
  }, [shown, acct, ready, mode, account, flash, sheet, currency, setCurrency, commit, apply, refresh])

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
        !w.ready && "opacity-60",
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
  if (!w.ready) return null
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
