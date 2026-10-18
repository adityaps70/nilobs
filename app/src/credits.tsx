import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import confetti from "canvas-confetti"

import { BorderBeam } from "@/components/magicui/border-beam"
import * as I from "@/components/icons"
import { cn } from "@/lib/utils"

// Prototype pricing: roughly 1 credit = ₹1
export const WELCOME_CREDITS = 100
export const COSTS = { brief: 50, interview: 20, story: 10 } as const
export const EARN = { share: 100 } as const
export const FREE_FEATURES = ["Daily 5-minute drill", "Question bank and self-rating", "Field lessons", "Story previews"]

export interface Pack {
  id: string
  name: string
  credits: number
  price: number
  note: string
  popular?: boolean
}
export const PACKS: Pack[] = [
  { id: "starter", name: "Starter", credits: 300, price: 299, note: "About 6 briefs" },
  { id: "voyage", name: "Voyage", credits: 1000, price: 899, note: "Save 10%. Covers a full contract", popular: true },
  { id: "career", name: "Career", credits: 3000, price: 2399, note: "Save 20%. For the whole rank" },
]
export const inr = (n: number) => "₹" + n.toLocaleString("en-IN")

export interface Entry {
  id: string
  at: string
  delta: number
  label: string
}
interface WalletState {
  balance: number
  ledger: Entry[]
  unlocked: number[]
}
interface Wallet extends WalletState {
  spend: (cost: number, label: string) => boolean
  earn: (n: number, label: string) => void
  buy: (pack: Pack) => void
  unlock: (storyId: number) => boolean
  isUnlocked: (storyId: number) => boolean
  openTopUp: (reason?: string, packId?: string) => void
  reset: () => void
  flash: number
}

const KEY = "sr.wallet"
const fresh = (): WalletState => ({
  balance: WELCOME_CREDITS,
  ledger: [{ id: "welcome", at: new Date().toISOString(), delta: WELCOME_CREDITS, label: "Welcome credits" }],
  unlocked: [],
})
function load(): WalletState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as WalletState
  } catch {
    /* storage blocked: start fresh in memory */
  }
  return fresh()
}

const Ctx = createContext<Wallet | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(load)
  const [topUp, setTopUp] = useState<{ reason?: string; packId?: string } | null>(null)
  const [flash, setFlash] = useState(0)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  }, [state])

  const add = useCallback((delta: number, label: string) => {
    setState((s) => ({
      ...s,
      balance: s.balance + delta,
      ledger: [{ id: Math.random().toString(36).slice(2), at: new Date().toISOString(), delta, label }, ...s.ledger].slice(0, 60),
    }))
    setFlash((f) => f + 1)
  }, [])

  const stateRef = useRef(state)
  stateRef.current = state

  const value = useMemo<Wallet>(
    () => ({
      ...state,
      flash,
      spend: (cost, label) => {
        if (stateRef.current.balance < cost) {
          setTopUp({ reason: `${label} needs ${cost} credits. You have ${stateRef.current.balance}.` })
          return false
        }
        add(-cost, label)
        return true
      },
      earn: (n, label) => add(n, label),
      buy: (pack) => add(pack.credits, `Bought ${pack.name} pack (${inr(pack.price)})`),
      unlock: (storyId) => {
        if (stateRef.current.unlocked.includes(storyId)) return true
        if (stateRef.current.balance < COSTS.story) {
          setTopUp({ reason: `A full story needs ${COSTS.story} credits. You have ${stateRef.current.balance}.` })
          return false
        }
        setState((s) => ({ ...s, unlocked: [...s.unlocked, storyId] }))
        add(-COSTS.story, "Unlocked an inspection story")
        return true
      },
      isUnlocked: (storyId) => state.unlocked.includes(storyId),
      openTopUp: (reason, packId) => setTopUp({ reason, packId }),
      reset: () => setState(fresh()),
    }),
    [state, flash, add]
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      <TopUpSheet open={!!topUp} reason={topUp?.reason} preselect={topUp?.packId} onClose={() => setTopUp(null)} />
    </Ctx.Provider>
  )
}

export function useWallet() {
  const w = useContext(Ctx)
  if (!w) throw new Error("useWallet outside WalletProvider")
  return w
}

export function CreditPill({ onClick, className }: { onClick?: () => void; className?: string }) {
  const w = useWallet()
  const low = w.balance < COSTS.interview
  return (
    <button
      type="button"
      onClick={onClick ?? (() => w.openTopUp())}
      aria-label={`${w.balance} credits. Get more credits`}
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

export function CostTag({ cost, className }: { cost: number; className?: string }) {
  return (
    <span className={cn("tnum inline-flex items-center gap-1 font-mono text-[11.5px] font-semibold", className)}>
      <I.Coin size={13} />
      {cost}
    </span>
  )
}

function TopUpSheet({ open, reason, preselect, onClose }: { open: boolean; reason?: string; preselect?: string; onClose: () => void }) {
  const w = useContext(Ctx)!
  const [sel, setSel] = useState("voyage")
  const [stage, setStage] = useState<"pick" | "pay" | "done">("pick")
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (open) {
      setStage("pick")
      setSel(preselect || "voyage")
    }
  }, [open, preselect])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])
  const pack = PACKS.find((p) => p.id === sel)!
  const pay = () => {
    setStage("pay")
    setTimeout(() => {
      w.buy(pack)
      setStage("done")
      const r = btn.current?.getBoundingClientRect()
      confetti({
        particleCount: 110, spread: 80, startVelocity: 34, disableForReducedMotion: true,
        colors: ["#0b6bcb", "#f26b1d", "#0b7d64", "#ffcf70", "#7cc4ff"],
        origin: r ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight } : undefined,
      })
    }, 1100)
  }
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[rgba(6,16,27,0.55)] backdrop-blur-[2px]" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="topup-title"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="relative m-0 w-full max-w-[460px] rounded-t-[28px] border border-line bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] font-sans text-ink shadow-2xl sm:m-4 sm:rounded-[28px]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="topup-title" className="display text-[22px] font-bold">
                  {stage === "done" ? "Credits added" : "Get more credits"}
                </h2>
                <p className="text-[13.5px] leading-snug text-mute">
                  {stage === "done" ? `${pack.credits} credits are in your wallet. New balance: ${w.balance}.` : reason || `You have ${w.balance} credits.`}
                </p>
              </div>
              <button type="button" aria-label="Close" onClick={onClose} className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-surface-2">
                <I.Close size={18} />
              </button>
            </div>

            {stage !== "done" && (
              <div role="radiogroup" aria-label="Credit packs" className="mt-4 flex flex-col gap-2">
                {PACKS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={sel === p.id}
                    onClick={() => setSel(p.id)}
                    className={cn("relative flex items-center gap-3 overflow-hidden rounded-2xl border p-3.5 text-left transition-colors", sel === p.id ? "border-primary bg-surface-2" : "border-line hover:border-mute")}
                  >
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", sel === p.id ? "border-signal" : "border-line")}>
                      {sel === p.id && <span className="size-2.5 rounded-full bg-signal" />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-2 text-[15px] font-bold">
                        {p.name}
                        {p.popular && <span className="rounded-full bg-signal-soft px-2 py-0.5 font-mono text-[10px] font-semibold text-signal-ink">POPULAR</span>}
                      </span>
                      <span className="text-[12.5px] text-mute">{p.note}</span>
                    </span>
                    <span className="flex flex-col items-end">
                      <span className="tnum text-[16px] font-bold">{inr(p.price)}</span>
                      <span className="tnum font-mono text-[11.5px] text-mute">{p.credits.toLocaleString("en-IN")} credits</span>
                    </span>
                    {p.popular && sel === p.id && <BorderBeam size={80} duration={6} colorFrom="#0b6bcb" colorTo="#f26b1d" borderWidth={1.5} />}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2">
              {stage === "done" ? (
                <button type="button" onClick={onClose} className="h-12 rounded-xl bg-primary text-[15px] font-semibold text-on-primary">
                  Continue
                </button>
              ) : (
                <button ref={btn} type="button" onClick={pay} disabled={stage === "pay"} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-signal text-[15px] font-semibold text-white disabled:opacity-70">
                  {stage === "pay" ? (
                    <>
                      <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }} className="size-4 rounded-full border-2 border-white/40 border-t-white" />
                      Processing…
                    </>
                  ) : (
                    <>Pay {inr(pack.price)} with UPI or card</>
                  )}
                </button>
              )}
              <p className="text-center text-[11.5px] text-mute">Prototype: no payment is taken. The live app uses Cashfree checkout.</p>
              {stage !== "done" && (
                <p className="text-center text-[12px] text-mute">
                  Or share a debrief and earn <b className="font-semibold text-ink">{EARN.share} free credits</b>.
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
