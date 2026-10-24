// Sign in with Google, and keeping an account's progress and saved screens in step across devices.
// (The account's credits live on the server itself: see credits.tsx and worker/wallet.js.)
//
// Only on the hosted site (nilobs.com), and only when the server has sign-in set up (/api/auth/config).
// A local test build has no sign-in and no AI (the AI only runs through nilobs.com's server).
//
// Sync works like another browser tab: the app keeps writing to localStorage as it always has; this layer
// notices changes and saves them to the account, and writes the account's newer copy back into localStorage
// with a storage event, which progress already listens for.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { EXTRA_KEYS, MAX_EXTRA_CHARS, PROGRESS_KEY, WALLET_ACCOUNT_KEY, WALLET_KEY, mergeAll, type Extras, type Synced } from "@/sync"
import { cn } from "@/lib/utils"

declare const __AI_ENDPOINT__: string
const ON_SITE = typeof __AI_ENDPOINT__ !== "undefined" && !!__AI_ENDPOINT__

export interface User { id: string; email: string; name: string; picture: string }
export type AuthStatus = "off" | "loading" | "out" | "in"
export type SyncState = "idle" | "saving" | "offline" | "error"
interface Auth {
  status: AuthStatus
  user: User | null
  clientId: string | null
  sync: { state: SyncState; at: number }
  error: string
  signIn: (credential: string) => Promise<void>
  signOut: () => Promise<void>
  deleteAccount: () => Promise<void>
  /** Open the sign-in sheet, saying why. */
  prompt: (reason?: string) => void
}
const noop = async () => {}
const Ctx = createContext<Auth>({ status: "off", user: null, clientId: null, sync: { state: "idle", at: 0 }, error: "", signIn: noop, signOut: noop, deleteAccount: noop, prompt: () => {} })
export const useAuth = () => useContext(Ctx)
/** "open" when the AI can be used here, "closed" when it needs a sign-in first, "loading" while checking. */
export function useAiGate(): "open" | "closed" | "loading" {
  const { status } = useContext(Ctx)
  return status === "loading" ? "loading" : status === "out" ? "closed" : "open"
}
/** Tell the app the server said "not signed in" (an expired session). */
export const UNAUTHORIZED_EVENT = "nilobs:unauthorized"

/* ---------------- local storage helpers ---------------- */
const META_KEY = "sr.sync"
const DEVICE_ONLY = ["sr.photos", "sr.interview"]
interface Meta { user: string; who: User | null; version: number; stamps: Record<string, number>; hashes: Record<string, number> }
const ls = {
  get(k: string) {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* full or blocked */
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  },
}
const parse = (s: string | null) => {
  try {
    return s ? JSON.parse(s) : null
  } catch {
    return null
  }
}
function hash(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}
function readMeta(): Meta {
  const m = parse(ls.get(META_KEY)) || {}
  const who = m.who && typeof m.who === "object" && typeof m.who.id === "string" ? (m.who as User) : null
  return { user: typeof m.user === "string" ? m.user : "", who, version: Number.isInteger(m.version) ? m.version : 0, stamps: m.stamps && typeof m.stamps === "object" ? m.stamps : {}, hashes: m.hashes && typeof m.hashes === "object" ? m.hashes : {} }
}
const writeMeta = (m: Meta) => ls.set(META_KEY, JSON.stringify(m))

/** This device's copy. Stamps each saved screen with the time it last changed. */
function readLocal(meta: Meta): Synced {
  const extras: Extras = {}
  const now = Date.now()
  for (const k of EXTRA_KEYS) {
    const raw = ls.get(k)
    if (raw == null || raw.length > MAX_EXTRA_CHARS) continue
    const h = hash(raw)
    if (meta.hashes[k] !== h) {
      meta.hashes[k] = h
      meta.stamps[k] = now
    }
    extras[k] = { v: parse(raw), t: meta.stamps[k] || 0 }
  }
  return { progress: parse(ls.get(PROGRESS_KEY)), extras }
}
/** Put a copy into this browser, telling the open screens (progress, saved screens) through a storage event. */
function writeLocal(s: Synced, meta: Meta) {
  const put = (k: string, v: unknown) => {
    const raw = JSON.stringify(v)
    if (ls.get(k) === raw) return
    ls.set(k, raw)
    window.dispatchEvent(new StorageEvent("storage", { key: k, newValue: raw, storageArea: localStorage }))
  }
  if (s.progress) put(PROGRESS_KEY, s.progress)
  for (const [k, e] of Object.entries(s.extras || {})) {
    if (!EXTRA_KEYS.includes(k)) continue
    put(k, e.v)
    meta.hashes[k] = hash(JSON.stringify(e.v))
    meta.stamps[k] = e.t
  }
}
function clearDevice() {
  for (const k of [WALLET_KEY, WALLET_ACCOUNT_KEY, PROGRESS_KEY, META_KEY, ...EXTRA_KEYS, ...DEVICE_ONLY]) ls.del(k)
}

async function api<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T | null }> {
  const res = await fetch(path, { credentials: "same-origin", ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } })
  let body: T | null = null
  try {
    body = (await res.json()) as T
  } catch {
    /* empty */
  }
  return { status: res.status, body }
}

/* ---------------- provider ---------------- */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(ON_SITE ? "loading" : "off")
  const [user, setUser] = useState<User | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [sync, setSync] = useState<{ state: SyncState; at: number }>({ state: "idle", at: 0 })
  const [error, setError] = useState("")
  const [sheet, setSheet] = useState<string | null>(null)
  const userRef = useRef<User | null>(null)
  const busy = useRef(false)
  const leaving = useRef(false)
  const pushedHash = useRef(0)
  userRef.current = user

  /** Save this device's copy; on a clash, merge with the newer one and save again. */
  const push = useCallback(async (keepalive = false) => {
    if (!userRef.current || busy.current || leaving.current) return
    busy.current = true
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const meta = readMeta()
        const local = readLocal(meta)
        writeMeta(meta)
        const h = hash(JSON.stringify(local))
        if (h === pushedHash.current && attempt === 0) return
        setSync((s) => ({ ...s, state: "saving" }))
        const r = await api<{ version: number; data: Synced | null }>("/api/state", { method: "PUT", body: JSON.stringify({ base: meta.version, data: local }), keepalive })
        if (r.status === 200 && r.body) {
          const m = readMeta()
          m.version = r.body.version
          writeMeta(m)
          pushedHash.current = h
          setSync({ state: "idle", at: Date.now() })
          return
        }
        if (r.status === 409 && r.body) {
          // another device saved first: take its copy into ours, then try again
          const m = readMeta()
          const merged = mergeAll(r.body.data || { progress: null, extras: {} }, readLocal(m), true)
          writeLocal(merged, m)
          m.version = r.body.version
          writeMeta(m)
          continue
        }
        if (r.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
        setSync((s) => ({ ...s, state: r.status === 413 ? "error" : "offline" }))
        return
      }
    } catch {
      setSync((s) => ({ ...s, state: "offline" }))
    } finally {
      busy.current = false
    }
  }, [])

  /** Fetch the account's copy; merge it into this device if it's newer. */
  const pull = useCallback(async (u: User) => {
    if (leaving.current) return
    const r = await api<{ version: number; data: Synced | null }>("/api/state")
    if (r.status !== 200 || !r.body || leaving.current) return
    const meta = readMeta()
    const same = meta.user === u.id
    if (!r.body.data) {
      // a new account: this device's progress becomes the account's
      meta.user = u.id
      meta.who = u
      meta.version = 0
      writeMeta(meta)
      pushedHash.current = 0
      await push()
      return
    }
    meta.who = u
    if (same && r.body.version <= meta.version) {
      writeMeta(meta)
      return
    }
    const merged = mergeAll(r.body.data, readLocal(meta), same)
    writeLocal(merged, meta)
    meta.user = u.id
    meta.version = r.body.version
    writeMeta(meta)
    pushedHash.current = hash(JSON.stringify(r.body.data))
    await push() // saves only if the merge added anything
    setSync({ state: "idle", at: Date.now() })
  }, [push])

  // On load: is sign-in available, and is someone signed in?
  useEffect(() => {
    if (!ON_SITE) return
    let on = true
    ;(async () => {
      try {
        const cfg = await api<{ google: string | null }>("/api/auth/config")
        if (!on) return
        if (cfg.status !== 200 || !cfg.body?.google) {
          setStatus("off")
          return
        }
        setClientId(cfg.body.google)
        const me = await api<{ user: User }>("/api/me")
        if (!on) return
        if (me.status === 200 && me.body?.user) {
          setUser(me.body.user)
          setStatus("in")
          pull(me.body.user).catch(() => setSync((s) => ({ ...s, state: "offline" })))
        } else setStatus("out")
      } catch {
        // offline: keep working with this device's copy as the account it last synced with
        if (!on) return
        const who = readMeta().who
        if (who) setUser(who)
        setStatus(who ? "in" : "out")
      }
    })()
    return () => {
      on = false
    }
  }, [pull])

  // While signed in: save changes a few seconds after they happen, pick up other devices' changes when
  // the app comes back to the front and every minute, and save before the page goes away.
  useEffect(() => {
    if (status !== "in" || !user) return
    let lastPull = Date.now()
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return
      push()
      if (Date.now() - lastPull > 60000) {
        lastPull = Date.now()
        pull(user).catch(() => {})
      }
    }, 4000)
    const vis = () => {
      if (document.visibilityState === "hidden") push(true)
      else {
        lastPull = Date.now()
        pull(user).catch(() => {})
      }
    }
    const hide = () => push(true)
    document.addEventListener("visibilitychange", vis)
    window.addEventListener("pagehide", hide)
    return () => {
      clearInterval(t)
      document.removeEventListener("visibilitychange", vis)
      window.removeEventListener("pagehide", hide)
    }
  }, [status, user, push, pull])

  // The server said "not signed in" (session expired or ended elsewhere)
  useEffect(() => {
    const on = () => {
      if (userRef.current) {
        setUser(null)
        setStatus("out")
      }
    }
    window.addEventListener(UNAUTHORIZED_EVENT, on)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, on)
  }, [])

  const signIn = useCallback(async (credential: string) => {
    setError("")
    try {
      const r = await api<{ user: User; error?: string }>("/api/auth/google", { method: "POST", body: JSON.stringify({ credential }) })
      if (r.status !== 200 || !r.body?.user) {
        setError(r.status === 429 ? "Too many tries. Wait a minute and try again." : "Google sign-in didn't go through. Try again.")
        return
      }
      setUser(r.body.user)
      setStatus("in")
      setSheet(null)
      await pull(r.body.user)
    } catch {
      setError("No connection. Try again when you have signal.")
    }
  }, [pull])

  const leave = useCallback(async (how: "out" | "delete") => {
    if (how === "out") {
      pushedHash.current = 0
      await push().catch(() => {})
    }
    // from here on nothing is saved: this device is about to be wiped
    leaving.current = true
    userRef.current = null
    try {
      await api(how === "out" ? "/api/auth/logout" : "/api/me", { method: how === "out" ? "POST" : "DELETE" })
    } catch {
      /* the cookie is cleared server-side when we can reach it */
    }
    try {
      ;(window as unknown as { google?: GoogleId }).google?.accounts.id.disableAutoSelect()
    } catch {
      /* ignore */
    }
    // this device goes back to a fresh, signed-out start; the account keeps everything (unless deleted)
    clearDevice()
    window.location.hash = "app"
    window.location.reload()
  }, [push])

  const value = useMemo<Auth>(
    () => ({
      status,
      user,
      clientId,
      sync,
      error,
      signIn,
      signOut: () => leave("out"),
      deleteAccount: () => leave("delete"),
      prompt: (reason) => setSheet(reason || "Sign in with Google to use the AI"),
    }),
    [status, user, clientId, sync, error, signIn, leave]
  )
  return (
    <Ctx.Provider value={value}>
      {children}
      <SignInSheet reason={status === "out" ? sheet : null} onClose={() => setSheet(null)} />
    </Ctx.Provider>
  )
}

/* ---------------- Google's button ---------------- */
interface GoogleId {
  accounts: {
    id: {
      initialize: (o: Record<string, unknown>) => void
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void
      disableAutoSelect: () => void
    }
  }
}
let gis: Promise<GoogleId> | null = null
let initFor = ""
let onCredential: (c: string) => void = () => {}
function loadGoogle(): Promise<GoogleId> {
  gis ??= new Promise<GoogleId>((resolve, reject) => {
    const w = window as unknown as { google?: GoogleId }
    if (w.google?.accounts?.id) return resolve(w.google)
    const s = document.createElement("script")
    s.src = "https://accounts.google.com/gsi/client"
    s.async = true
    s.onload = () => (w.google?.accounts?.id ? resolve(w.google) : reject(new Error("no google")))
    s.onerror = () => {
      gis = null
      reject(new Error("blocked"))
    }
    document.head.appendChild(s)
  })
  return gis
}

/** Google's own "Continue with Google" button. */
export function GoogleButton({ className, text = "continue_with" }: { className?: string; text?: "continue_with" | "signin_with" | "signup_with" }) {
  const { clientId, signIn, error } = useAuth()
  const box = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  onCredential = (c) => {
    signIn(c)
  }
  useEffect(() => {
    if (!clientId) return
    let on = true
    loadGoogle()
      .then((g) => {
        if (!on || !box.current) return
        if (initFor !== clientId) {
          g.accounts.id.initialize({ client_id: clientId, callback: (r: { credential?: string }) => r.credential && onCredential(r.credential), auto_select: false, cancel_on_tap_outside: true, use_fedcm_for_button: true, itp_support: true })
          initFor = clientId
        }
        const dark = document.body.classList.contains("night-watch")
        g.accounts.id.renderButton(box.current, { type: "standard", theme: dark ? "filled_black" : "outline", size: "large", shape: "pill", text, logo_alignment: "left", width: Math.max(220, Math.min(360, box.current.offsetWidth || 300)) })
      })
      .catch(() => on && setFailed(true))
    return () => {
      on = false
    }
  }, [clientId, text])
  if (!clientId) return null
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div ref={box} className="min-h-[44px] w-full" data-testid="google-button" />
      {failed && <p className="text-[12px] text-signal-ink">Google's sign-in didn't load. Check your connection or ad blocker, then reload.</p>}
      {error && <p role="alert" className="text-[12px] font-medium text-signal-ink">{error}</p>}
    </div>
  )
}

/* ---------------- sign-in sheet and account card ---------------- */
function SignInSheet({ reason, onClose }: { reason: string | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {reason && (
        <motion.div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="signin-title" onClick={(e) => e.stopPropagation()} initial={{ y: 30 }} animate={{ y: 0 }} exit={{ y: 30 }}
            className="sheet-panel flex w-full max-w-[400px] flex-col gap-3 rounded-[26px] border border-line p-5 text-ink shadow-2xl">
            <h2 id="signin-title" className="display text-[21px] leading-tight font-bold">{reason}</h2>
            <SignInPitch />
            <GoogleButton />
            <button type="button" onClick={onClose} className="h-10 text-[13.5px] font-semibold text-mute">Not now</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SignInPitch() {
  return (
    <ul className="flex flex-col gap-1.5 text-[13.5px] leading-snug text-mute">
      <li>• The AI inspector, Ask NilObs, Photo check and AI plans</li>
      <li>• Credits and plans you can buy, kept safe on your account</li>
      <li>• Your XP, streak and briefs on every phone and laptop</li>
      <li>• Nothing is posted to Google. We keep your name and email only. <a href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-2">Privacy</a></li>
    </ul>
  )
}

/** Signed out: why to sign in, with Google's button. Signed in: who, sync status, sign out and delete. */
export function AccountCard({ className }: { className?: string }) {
  const a = useAuth()
  const [confirm, setConfirm] = useState<"" | "out" | "delete">("")
  if (a.status === "off" || a.status === "loading") return null
  if (a.status === "out" || !a.user)
    return (
      <section className={cn("glass flex flex-col gap-3 rounded-[22px] p-4", className)} aria-labelledby="acct-title">
        <h3 id="acct-title" className="text-[16px] font-bold">Sign in to use the AI and keep your progress</h3>
        <SignInPitch />
        <GoogleButton />
      </section>
    )
  const u = a.user
  const when = a.sync.at ? new Date(a.sync.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""
  const line = a.sync.state === "saving" ? "Saving…" : a.sync.state === "offline" ? "No connection. Saved on this device; it syncs when you're back online." : a.sync.state === "error" ? "Couldn't save to your account. Your progress is safe on this device." : when ? `Synced to your account at ${when}` : "Synced to your account"
  return (
    <section className={cn("glass flex flex-col gap-3 rounded-[22px] p-4", className)} aria-label="Your account">
      <div className="flex items-center gap-3">
        {u.picture ? <img src={u.picture} alt="" referrerPolicy="no-referrer" className="size-11 shrink-0 rounded-full" /> : <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[17px] font-bold text-primary">{(u.name || u.email || "?").slice(0, 1).toUpperCase()}</span>}
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-bold">{u.name || "Signed in"}</span>
          <span className="truncate text-[12.5px] text-mute">{u.email}</span>
        </span>
      </div>
      <p className={cn("text-[12.5px] leading-snug", a.sync.state === "idle" || a.sync.state === "saving" ? "text-sea" : "text-signal-ink")} role="status">{line}</p>
      {confirm === "" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setConfirm("out")} className="h-10 rounded-xl border border-line bg-surface px-3.5 text-[13px] font-semibold">Sign out</button>
          <button type="button" onClick={() => setConfirm("delete")} className="h-10 rounded-xl px-2 text-[12.5px] font-semibold text-mute underline underline-offset-2">Delete account</button>
        </div>
      )}
      {confirm === "out" && (
        <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3 text-[13px] leading-snug">
          <span>Sign out on this device? Everything stays in your account for next time. This device starts fresh.</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => a.signOut()} className="h-9 rounded-lg bg-ink px-3 text-[13px] font-semibold text-bg">Sign out</button>
            <button type="button" onClick={() => setConfirm("")} className="h-9 rounded-lg px-3 text-[13px] font-semibold">Cancel</button>
          </span>
        </div>
      )}
      {confirm === "delete" && (
        <div className="flex flex-col gap-2 rounded-xl bg-signal-soft p-3 text-[13px] leading-snug">
          <span className="font-medium text-signal-ink">Delete your NilObs account? Your credits (including any you paid for), plan, XP, streak and saved briefs are erased for good, on every device. This can't be undone.</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => a.deleteAccount()} className="h-9 rounded-lg bg-signal px-3 text-[13px] font-semibold text-white">Delete for good</button>
            <button type="button" onClick={() => setConfirm("")} className="h-9 rounded-lg px-3 text-[13px] font-semibold">Keep my account</button>
          </span>
        </div>
      )}
    </section>
  )
}

/** A compact "Sign in to use the AI" block, for screens whose AI parts are locked. */
export function SignInForAi({ title = "Sign in with Google to use the AI", children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-dashed border-line bg-surface p-4 text-[13.5px] leading-snug">
      <b className="font-semibold">{title}</b>
      <span className="text-mute">{children ?? "It's free, and a new account starts with 80 credits. Signing in also keeps your progress on every device."}</span>
      <GoogleButton />
    </div>
  )
}

/** The account button for the top of the app: "Sign in" when signed out; your Google photo and a small menu when signed in. */
export function AccountChip({ role, onProfile, onPlans }: { role?: string; onProfile: () => void; onPlans: () => void }) {
  const a = useAuth()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", out)
    document.addEventListener("keydown", key)
    return () => {
      document.removeEventListener("mousedown", out)
      document.removeEventListener("keydown", key)
    }
  }, [open])
  if (a.status === "off" || a.status === "loading") return null
  if (a.status === "out" || !a.user)
    return (
      <button type="button" onClick={() => a.prompt("Sign in with Google")} className="h-9 shrink-0 rounded-full bg-primary px-3.5 text-[13px] font-semibold text-on-primary">
        Sign in
      </button>
    )
  const u = a.user
  const initial = (u.name || u.email || "?").slice(0, 1).toUpperCase()
  const item = "flex h-10 w-full items-center rounded-xl px-2.5 text-left text-[13.5px] font-semibold hover:bg-surface-2"
  return (
    <div ref={box} className="relative shrink-0">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Your account: ${u.name || u.email}`} onClick={() => setOpen((o) => !o)} className="flex size-10 items-center justify-center overflow-hidden rounded-full border border-line bg-surface">
        {u.picture ? <img src={u.picture} alt="" referrerPolicy="no-referrer" className="size-full object-cover" /> : <span className="text-[15px] font-bold text-primary">{initial}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" aria-label="Your account" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="sheet-panel absolute top-12 right-0 z-[70] flex w-[250px] max-w-[calc(100vw-24px)] flex-col gap-0.5 rounded-2xl border border-line p-2 text-ink shadow-2xl">
            <span className="flex flex-col px-2.5 pt-1.5 pb-2">
              <span className="truncate text-[14px] font-bold">{u.name || "Signed in"}</span>
              <span className="truncate text-[12px] text-mute">{u.email}</span>
              {role && <span className="mt-1 text-[12px] font-semibold text-primary">{role}</span>}
            </span>
            <button type="button" role="menuitem" onClick={() => (setOpen(false), onProfile())} className={item}>Your profile</button>
            <button type="button" role="menuitem" onClick={() => (setOpen(false), onPlans())} className={item}>Plans & credits</button>
            <button type="button" role="menuitem" onClick={() => (setOpen(false), a.signOut())} className={cn(item, "text-signal-ink")}>Sign out</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
