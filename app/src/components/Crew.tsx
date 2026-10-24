// Crews, fleet plans, certificates and receipts: the parts of NilObs you share with other people.
// - Your crew: a private weekly board with an invite link (worker/crews.js). An owner can make it a fleet plan:
//   seats paid by the company, each a Watchkeeper plan, plus a crew-readiness report.
// - Certificate: what it takes (app/src/cert.ts), and a public page anyone can check (worker/certs.js).
// - Receipts: every payment, each with a printable receipt (worker/pay.js).
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import * as I from "@/components/icons"
import { cn } from "@/lib/utils"
import { Chip, Scroll, Section, TopBar } from "@/components/ui"
import { UNAUTHORIZED_EVENT, useAuth } from "@/auth"
import { useProgress } from "@/progress"
import { useWallet } from "@/credits"
import { FLEET, fleetQuote, fmtPrice, type Cycle } from "@/economy"
import { CERT, CERT_TITLE, certChecks, certReady, cleanCertName } from "@/cert"
import { SignInScreen } from "@/app/AppGate"
import type { AppScreen } from "@/nav"

/* ---------------- talking to the server ---------------- */
type Res<T> = { ok: boolean; status: number; data: (T & { error?: string }) | null }
async function api<T>(path: string, body?: unknown): Promise<Res<T>> {
  try {
    const res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    })
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: "No connection. Try again when you have signal." } as T & { error?: string } }
  }
}
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
const btn = "h-10 rounded-xl px-3.5 text-[13.5px] font-semibold"
const field = "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink outline-none focus:border-primary"

/* ---------------- invite links ---------------- */
const JOIN_KEY = "sr.join"
/** A crew invite from a link (#app/crew/CODE), kept until it's been answered. */
export const pendingJoin = {
  set(code: string) {
    try {
      if (code) localStorage.setItem(JOIN_KEY, code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))
    } catch {
      /* not remembered */
    }
  },
  get(): string {
    try {
      return localStorage.getItem(JOIN_KEY) || ""
    } catch {
      return ""
    }
  },
  clear() {
    try {
      localStorage.removeItem(JOIN_KEY)
    } catch {
      /* ignore */
    }
  },
}
const inviteUrl = (code: string) => `${window.location.origin}/join/${code}`

async function shareLink(url: string, text: string): Promise<string> {
  try {
    if (navigator.share) {
      await navigator.share({ title: "NilObs", text, url })
      return ""
    }
  } catch {
    /* closed: fall back to copying */
  }
  try {
    await navigator.clipboard.writeText(url)
    return "Link copied."
  } catch {
    return url
  }
}

/* ---------------- your crew ---------------- */
interface Fleet { seats: number; used: number; until: number; cycle: Cycle; active: boolean }
interface Crew { id: string; name: string; owner: boolean; code: string; members: number; fleet: Fleet | null; seatUntil: number }
interface BoardRow { key: string; name: string; role: string; xp: number; streak: number; drillToday: boolean; you: boolean; owner: boolean }
interface ReportRow { key: string; name: string; email: string; role: string; lastSeen: number; streak: number; weekXp: number; drills: number; drillToday: boolean; interviews: number; scores: Record<string, number | null>; avg: number | null; covered: number; topics: number; weak: string[]; seat: boolean; owner: boolean }
interface Preview { name: string; members: number; fleet: boolean; by: string; seatsFree: number }

export function CrewScreen({ go }: { go: (s: AppScreen) => void }) {
  const auth = useAuth()
  const signedIn = auth.status === "in" || auth.status === "off"
  const [crews, setCrews] = useState<Crew[] | null>(null)
  const [sel, setSel] = useState("")
  const [code, setCode] = useState(() => pendingJoin.get())
  const [preview, setPreview] = useState<Preview | null>(null)
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await api<{ crews: Crew[] }>("/api/crews")
    if (r.ok && r.data) {
      setCrews(r.data.crews)
      setSel((s) => (r.data!.crews.some((c) => c.id === s) ? s : r.data!.crews[0]?.id || ""))
    } else if (r.status !== 401) setMsg(r.data?.error || "Couldn't load your crews.")
  }, [])
  useEffect(() => {
    if (auth.status === "in") load()
  }, [auth.status, load])
  useEffect(() => {
    if (!code) return setPreview(null)
    let on = true
    api<Preview>(`/api/crews/preview?code=${encodeURIComponent(code)}`).then((r) => {
      if (!on) return
      if (r.ok && r.data) setPreview(r.data)
      else {
        setPreview(null)
        setMsg(r.data?.error || "That invite link isn't valid.")
        pendingJoin.clear()
        setCode("")
      }
    })
    return () => {
      on = false
    }
  }, [code])

  const act = async (body: Record<string, unknown>, done?: string) => {
    setBusy(true)
    setMsg("")
    const r = await api<{ crews: Crew[]; crew?: Crew }>("/api/crews", body)
    setBusy(false)
    if (!r.ok || !r.data) {
      setMsg(r.data?.error || "That didn't work. Try again.")
      return false
    }
    setCrews(r.data.crews)
    if (r.data.crew) setSel(r.data.crew.id)
    else setSel(r.data.crews[0]?.id || "")
    if (done) setMsg(done)
    return true
  }
  const join = async () => {
    if (!signedIn) return auth.prompt(preview ? `Sign in to join ${preview.name}` : "Sign in to join a crew")
    if (await act({ action: "join", code }, preview?.fleet ? "You're in. Your seat on the fleet plan is ready." : "You're in.")) {
      pendingJoin.clear()
      setCode("")
      setPreview(null)
    }
  }
  const crew = crews?.find((c) => c.id === sel) || null

  return (
    <>
      <TopBar title="Your crew" onBack={() => go("today")} />
      <Scroll className="gap-3">
        {preview && (
          <section className="flex flex-col gap-2.5 rounded-[22px] border border-primary/40 bg-primary-soft/60 p-4" aria-label="Crew invite">
            <span className="text-[12px] font-semibold tracking-wide text-primary uppercase">{preview.fleet ? "Fleet plan invite" : "Crew invite"}</span>
            <h2 className="display text-[20px] leading-tight font-bold">Join {preview.name}</h2>
            <p className="text-[13px] text-mute">{preview.members} member{preview.members === 1 ? "" : "s"}{preview.by ? ` · started by ${preview.by}` : ""}</p>
            <p className="text-[13px] leading-snug">Members see your first name, role, weekly XP, streak and whether you did today's drill.</p>
            {preview.fleet && (
              <p className="text-[13px] leading-snug">
                This crew is on a <b>fleet plan</b>: {preview.seatsFree > 0 ? "you get Watchkeeper free while it's paid." : "all seats are taken right now; you'll get one when the owner adds seats."} Its owner sees your name, email, role, streak, drills and practice scores by topic. Never your AI chats, answers or photos.
              </p>
            )}
            <span className="flex gap-2">
              <button type="button" disabled={busy} onClick={join} className={cn(btn, "bg-primary text-on-primary")}>{signedIn ? "Join" : "Sign in and join"}</button>
              <button type="button" onClick={() => { pendingJoin.clear(); setCode(""); setPreview(null) }} className={cn(btn, "text-mute")}>Not now</button>
            </span>
          </section>
        )}
        {!signedIn && (
          <SignInScreen title="Bring your crew" text="A private board for your ship or your class: who's drilling, weekly XP and streaks. Companies can pay for everyone's plan. Sign in to make a crew or join one." />
        )}
        {msg && <p role="status" className="rounded-xl bg-surface-2 px-3 py-2 text-[13px]">{msg}</p>}
        {signedIn && crews && crews.length > 1 && (
          <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5">
            {crews.map((c) => <Chip key={c.id} size="sm" on={c.id === sel} onClick={() => setSel(c.id)}>{c.name}</Chip>)}
          </div>
        )}
        {signedIn && crew && <CrewCard key={crew.id} crew={crew} act={act} busy={busy} reload={load} />}
        {signedIn && crews && <StartOrJoin act={act} busy={busy} first={crews.length === 0} onCode={setCode} />}
      </Scroll>
    </>
  )
}

function StartOrJoin({ act, busy, first, onCode }: { act: (b: Record<string, unknown>, done?: string) => Promise<boolean>; busy: boolean; first: boolean; onCode: (c: string) => void }) {
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (await act({ action: "create", name }, "Crew made. Share the invite link with your shipmates.")) setName("")
  }
  const look = (e: FormEvent) => {
    e.preventDefault()
    const c = code.trim().replace(/^.*\/join\//i, "").toUpperCase().replace(/[^A-Z0-9]/g, "")
    if (c) onCode(c)
  }
  return (
    <Section title={first ? "Start a crew" : "Another crew"}>
      {first && <p className="text-[13.5px] leading-snug text-mute">A private board for your ship, your class or your company's officers: weekly XP, streaks and who's done today's drill. Free. Make one and share the link, or paste an invite you were sent.</p>}
      <form onSubmit={create} className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Crew name, e.g. Bridge team" aria-label="Crew name" className={field} />
        <button type="submit" disabled={busy || name.trim().length < 2} className={cn(btn, "h-11 shrink-0 bg-primary text-on-primary disabled:opacity-50")}>Create</button>
      </form>
      <form onSubmit={look} className="flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Invite link or code" aria-label="Invite link or code" className={field} />
        <button type="submit" disabled={!code.trim()} className={cn(btn, "h-11 shrink-0 border border-line bg-surface disabled:opacity-50")}>Find</button>
      </form>
    </Section>
  )
}

function CrewCard({ crew, act, busy, reload }: { crew: Crew; act: (b: Record<string, unknown>, done?: string) => Promise<boolean>; busy: boolean; reload: () => void }) {
  const [board, setBoard] = useState<BoardRow[] | null>(null)
  const [note, setNote] = useState("")
  const [confirm, setConfirm] = useState<"" | "leave" | "delete">("")
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(crew.name)
  const loadBoard = useCallback(async () => {
    const r = await api<{ members: BoardRow[] }>(`/api/crews/board?id=${crew.id}`)
    if (r.ok && r.data) setBoard(r.data.members)
  }, [crew.id])
  useEffect(() => {
    loadBoard()
    const t = setInterval(() => document.visibilityState === "visible" && loadBoard(), 60000)
    return () => clearInterval(t)
  }, [loadBoard, crew.members])
  const share = async () => setNote(await shareLink(inviteUrl(crew.code), `Join ${crew.name} on NilObs: daily SIRE 2.0 drills and a crew board.`))
  return (
    <>
      <section className="flex flex-col gap-3 rounded-[22px] bg-hero p-4 text-hero-ink" aria-label={crew.name}>
        <span className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 flex-col">
            <span className="text-[12px] text-hero-muted">{crew.fleet?.active ? "Fleet plan" : "Crew"} · {crew.members} member{crew.members === 1 ? "" : "s"}</span>
            <span className="display truncate text-[21px] font-bold">{crew.name}</span>
          </span>
          {crew.seatUntil > 0 && <span className="shrink-0 rounded-full bg-hero-accent px-2.5 py-1 text-[11.5px] font-semibold text-[#1a0a00]">Seat to {day(crew.seatUntil)}</span>}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={share} className="flex h-10 items-center gap-2 rounded-xl bg-hero-accent px-3.5 text-[13.5px] font-semibold text-[#1a0a00]"><I.Users size={16} /> Invite your crew</button>
          <span className="truncate font-mono text-[12px] text-hero-muted">{inviteUrl(crew.code).replace(/^https?:\/\//, "")}</span>
        </span>
        {note && <span role="status" className="text-[12.5px] text-hero-muted">{note}</span>}
      </section>

      <Section title="This week" aside="resets Monday">
        {!board ? (
          <p className="text-[13px] text-mute">Loading…</p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {board.map((m, i) => (
              <li key={m.key} className={cn("flex items-center gap-3 rounded-2xl border px-3 py-2.5", m.you ? "border-primary bg-primary-soft/50" : "border-line bg-surface")}>
                <span className="tnum w-6 text-center font-mono text-[13px] font-bold text-mute">{i + 1}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[14px] font-semibold">{m.name}{m.you ? " (you)" : ""}{m.owner ? <span className="ml-1.5 text-[11px] font-semibold text-mute">owner</span> : null}</span>
                  <span className="truncate text-[12px] text-mute">{m.role}{m.streak ? ` · ${m.streak}-day streak` : ""}{m.drillToday ? " · drilled today" : ""}</span>
                </span>
                <span className="tnum shrink-0 font-mono text-[13px] font-semibold">{m.xp} XP</span>
                {crew.owner && !m.you && (
                  <button type="button" aria-label={`Remove ${m.name}`} onClick={() => act({ action: "remove", id: crew.id, member: m.key }, `${m.name} removed.`).then(loadBoard)} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-mute hover:bg-surface-2"><I.Close size={15} /></button>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>

      {crew.owner && <FleetPanel crew={crew} reload={reload} />}
      {crew.owner && crew.fleet && <ReportPanel crew={crew} />}

      <Section title={crew.owner ? "Crew settings" : "Membership"}>
        <div className="flex flex-wrap gap-2">
          {crew.owner && !renaming && <button type="button" onClick={() => setRenaming(true)} className={cn(btn, "border border-line bg-surface")}>Rename</button>}
          {crew.owner && <button type="button" disabled={busy} onClick={() => act({ action: "newcode", id: crew.id }, "New invite link made. The old one no longer works.")} className={cn(btn, "border border-line bg-surface")}>New invite link</button>}
          {!crew.owner && <button type="button" onClick={() => setConfirm("leave")} className={cn(btn, "border border-line bg-surface")}>Leave crew</button>}
          {crew.owner && <button type="button" onClick={() => setConfirm("delete")} className={cn(btn, "text-signal-ink")}>Delete crew</button>}
        </div>
        {renaming && (
          <form onSubmit={(e) => { e.preventDefault(); act({ action: "rename", id: crew.id, name }, "Renamed.").then((ok) => ok && setRenaming(false)) }} className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="New crew name" className={field} />
            <button type="submit" className={cn(btn, "h-11 shrink-0 bg-primary text-on-primary")}>Save</button>
          </form>
        )}
        {confirm && (
          <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3 text-[13px] leading-snug">
            <span>{confirm === "leave" ? `Leave ${crew.name}? You can rejoin with the invite link.${crew.seatUntil ? ` Your fleet seat stays until ${day(crew.seatUntil)}.` : ""}` : `Delete ${crew.name}? The board and invite link go for good.${crew.fleet?.active ? " People keep their seats to the end of the paid period." : ""}`}</span>
            <span className="flex gap-2">
              <button type="button" onClick={() => act({ action: confirm, id: crew.id }, confirm === "leave" ? "You left the crew." : "Crew deleted.").then(() => setConfirm(""))} className="h-9 rounded-lg bg-ink px-3 text-[13px] font-semibold text-bg">{confirm === "leave" ? "Leave" : "Delete"}</button>
              <button type="button" onClick={() => setConfirm("")} className="h-9 rounded-lg px-3 text-[13px] font-semibold">Cancel</button>
            </span>
          </div>
        )}
      </Section>
    </>
  )
}

/* ---------------- fleet plan (the crew's owner) ---------------- */
function FleetPanel({ crew, reload }: { crew: Crew; reload: () => void }) {
  const w = useWallet()
  const cur = w.currency
  const f = crew.fleet
  const active = !!f?.active
  const [seats, setSeats] = useState(Math.max(FLEET.min, crew.members))
  const [more, setMore] = useState(Math.max(1, crew.members - (f?.seats || 0)))
  useEffect(() => setMore(Math.max(1, crew.members - (f?.seats || 0))), [f?.seats, crew.members])
  const [cycle, setCycle] = useState<Cycle>("monthly")
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)
  const now = Date.now()
  const fleetNow = f && active ? { seats: f.seats, until: f.until, cycle: f.cycle } : null
  const qNew = fleetQuote("new", seats, cycle, cur, null, now)
  const qRenew = fleetNow ? fleetQuote("renew", 0, cycle, cur, fleetNow, now) : null
  const qAdd = fleetNow ? fleetQuote("add", more, cycle, cur, fleetNow, now) : null
  const pay = async (action: "new" | "renew" | "add", n: number) => {
    setBusy(true)
    setMsg("")
    const r = await w.buy(`fleet:${crew.id}:${action}:${n}:${cycle}`)
    setBusy(false)
    if (r.ok) {
      setMsg(r.message || "Paid.")
      reload()
    } else if (!r.cancelled) setMsg(r.error || "The payment didn't go through.")
  }
  const per = FLEET.price[cur]
  return (
    <Section title="Fleet plan" aside={`${fmtPrice(per.monthly, cur)} a seat a month`}>
      {active && f ? (
        <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-3.5 text-[13.5px]">
          <b className="text-[15px]">{f.used} of {f.seats} seats in use</b>
          <span className="text-mute">Paid to {day(f.until)}. Each seat is a Watchkeeper plan ({creditsLine()}). People who leave keep their seat to the end of the period.</span>
          {crew.members > f.seats && <span className="font-medium text-signal-ink">{crew.members - f.seats} member{crew.members - f.seats === 1 ? " is" : "s are"} waiting for a seat.</span>}
        </div>
      ) : (
        <p className="text-[13.5px] leading-snug text-mute">
          Pay for your crew's plans in one go. Every seat is a Watchkeeper plan ({creditsLine()}), and you get a readiness report for the whole crew. From {FLEET.min} seats; a year costs ten months. Members are told what the report shows before they join.
        </p>
      )}
      <div className="flex gap-1.5" role="group" aria-label="Billing period">
        <Chip size="sm" on={cycle === "monthly"} onClick={() => setCycle("monthly")}>Monthly</Chip>
        <Chip size="sm" on={cycle === "annual"} onClick={() => setCycle("annual")}>Yearly (2 months free)</Chip>
      </div>
      {!active ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3.5">
          <Stepper label="Seats" value={seats} min={FLEET.min} max={FLEET.max} onChange={setSeats} />
          <button type="button" disabled={busy || !qNew.ok} onClick={() => pay("new", seats)} className="h-11 rounded-xl bg-primary text-[14px] font-semibold text-on-primary disabled:opacity-50">
            {qNew.ok ? `Pay ${fmtPrice(qNew.amount, cur)} for ${seats} seats, ${cycle === "annual" ? "1 year" : "1 month"}` : qNew.why}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3.5">
          {qRenew?.ok && (
            <button type="button" disabled={busy} onClick={() => pay("renew", 0)} className="h-11 rounded-xl bg-primary text-[14px] font-semibold text-on-primary disabled:opacity-50">
              Renew: {fmtPrice(qRenew.amount, cur)} for {cycle === "annual" ? "a year" : "a month"} more
            </button>
          )}
          <Stepper label="Add seats" value={more} min={1} max={Math.max(1, FLEET.max - (f?.seats || 0))} onChange={setMore} />
          {qAdd && (
            <button type="button" disabled={busy || !qAdd.ok} onClick={() => pay("add", more)} className="h-11 rounded-xl border border-line bg-surface text-[14px] font-semibold disabled:opacity-50">
              {qAdd.ok ? `Add ${more} seat${more === 1 ? "" : "s"} to ${day(f!.until)}: ${fmtPrice(qAdd.amount, cur)}` : qAdd.why}
            </button>
          )}
        </div>
      )}
      {msg && <p role="status" className="text-[13px] font-medium">{msg}</p>}
      <p className="text-[12px] text-mute">Payments go through Razorpay. A receipt for each one is under Plans &amp; credits. Plans don't renew by themselves.</p>
    </Section>
  )
}
const creditsLine = () => "400 credits a month each"

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const set = (n: number) => onChange(Math.max(min, Math.min(max, Math.round(n) || min)))
  return (
    <span className="flex items-center justify-between gap-3">
      <span className="text-[13.5px] font-semibold">{label}</span>
      <span className="flex items-center gap-1.5">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} onClick={() => set(value - 1)} className="flex size-10 items-center justify-center rounded-xl border border-line text-[18px] font-bold">−</button>
        <input aria-label={label} inputMode="numeric" value={value} onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")))} className="tnum h-10 w-16 rounded-xl border border-line bg-surface text-center font-mono text-[15px] font-semibold" />
        <button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={() => set(value + 1)} className="flex size-10 items-center justify-center rounded-xl border border-line text-[18px] font-bold">+</button>
      </span>
    </span>
  )
}

/* ---------------- crew-readiness report (fleet owner) ---------------- */
function ReportPanel({ crew }: { crew: Crew }) {
  const [rows, setRows] = useState<ReportRow[] | null>(null)
  const [err, setErr] = useState("")
  useEffect(() => {
    let on = true
    api<{ members: ReportRow[] }>(`/api/crews/report?id=${crew.id}`).then((r) => {
      if (!on) return
      if (r.ok && r.data) setRows(r.data.members)
      else setErr(r.data?.error || "Couldn't load the report.")
    })
    return () => {
      on = false
    }
  }, [crew.id, crew.members])
  const summary = useMemo(() => {
    if (!rows?.length) return null
    const scored = rows.filter((r) => r.avg != null)
    return {
      avg: scored.length ? Math.round(scored.reduce((a, r) => a + (r.avg || 0), 0) / scored.length) : null,
      today: rows.filter((r) => r.drillToday).length,
      active: rows.filter((r) => Date.now() - r.lastSeen < 7 * 86400000).length,
    }
  }, [rows])
  const csv = () => {
    if (!rows) return
    const topics = [...new Set(rows.flatMap((r) => Object.keys(r.scores)))]
    const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const lines = [["Name", "Email", "Role", "Seat", "Last active", "Streak", "XP this week", "Drills", "AI inspector sessions", "Average score", ...topics].map(q).join(",")]
    for (const r of rows) lines.push([r.name, r.email, r.role, r.seat ? "yes" : "no", r.lastSeen ? new Date(r.lastSeen).toISOString().slice(0, 10) : "", r.streak, r.weekXp, r.drills, r.interviews, r.avg ?? "", ...topics.map((t) => r.scores[t] ?? "")].map(q).join(","))
    const blob = new Blob([lines.join("\n")], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${crew.name.replace(/[^\w-]+/g, "-")}-readiness.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  return (
    <Section title="Crew readiness" aside={rows ? <button type="button" onClick={csv} className="font-sans text-[12.5px] font-semibold text-primary">Download CSV</button> : undefined}>
      {err && <p className="text-[13px] text-signal-ink">{err}</p>}
      {summary && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: summary.avg == null ? "–" : `${summary.avg}%`, l: "average score" },
            { v: `${summary.today}/${rows!.length}`, l: "drilled today" },
            { v: `${summary.active}/${rows!.length}`, l: "active this week" },
          ].map((x) => (
            <span key={x.l} className="flex flex-col rounded-2xl border border-line bg-surface p-3">
              <span className="tnum display text-[20px] font-bold">{x.v}</span>
              <span className="text-[11.5px] text-mute">{x.l}</span>
            </span>
          ))}
        </div>
      )}
      {rows?.map((r) => (
        <div key={r.key} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-3 text-[13px]">
          <span className="flex items-baseline justify-between gap-2">
            <b className="truncate text-[14px]">{r.name}</b>
            <span className="tnum shrink-0 font-mono text-[13px] font-semibold">{r.avg == null ? "no scores yet" : `${r.avg}%`}</span>
          </span>
          <span className="truncate text-mute">{r.role} · {r.email}{r.seat ? "" : " · no seat"}</span>
          <span className="text-mute">{r.streak}-day streak · {r.drills} drills · {r.weekXp} XP this week · topics practised {r.covered}/{r.topics}</span>
          {r.weak.length > 0 && <span>Weakest: <b className="font-semibold">{r.weak.join(", ")}</b></span>}
        </div>
      ))}
      <p className="text-[12px] text-mute">Practice scores come from flashcards, Spot the observation and AI inspector grades in NilObs. They show where to focus, not an assessment of competence.</p>
    </Section>
  )
}

/* ---------------- certificate ---------------- */
interface CertView { id: string; name: string; role: string; issued: number; url: string }

export function CertScreen({ go, rank }: { go: (s: AppScreen) => void; rank: string }) {
  const auth = useAuth()
  const prog = useProgress()
  const checks = certChecks(prog, { rank })
  const ready = certReady(checks)
  const [cert, setCert] = useState<CertView | null | undefined>(undefined)
  const [name, setName] = useState(auth.user?.name || "")
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (auth.status !== "in") return
    api<{ cert: CertView | null }>("/api/cert").then((r) => setCert(r.ok && r.data ? r.data.cert : null))
  }, [auth.status])
  const issue = async (e: FormEvent) => {
    e.preventDefault()
    if (!cleanCertName(name)) return setMsg("Write your name as it should appear: letters only, 2 to 60.")
    setBusy(true)
    setMsg("")
    const r = await api<{ cert: CertView }>("/api/cert", { name })
    setBusy(false)
    if (r.ok && r.data) {
      setCert(r.data.cert)
      setMsg(cert ? "Name updated." : "Your certificate is ready.")
    } else setMsg(r.data?.error || "That didn't work. Try again.")
  }
  const goFor: Record<string, AppScreen> = { role: "me", topics: "train", drills: "daily", interview: "practice" }
  const url = cert ? `${window.location.origin}${cert.url}` : ""
  return (
    <>
      <TopBar title="Certificate" onBack={() => go("me")} />
      <Scroll className="gap-3">
        <section className="flex flex-col gap-2 rounded-[22px] bg-hero p-4 text-hero-ink">
          <I.Award size={26} />
          <h2 className="display text-[20px] leading-tight font-bold">{CERT_TITLE}</h2>
          <p className="text-[13px] leading-snug text-hero-muted">A certificate of completion with your name, role and a number anyone can check at nilobs.com. Good for your CV or your next contract. It records self-study in NilObs; it isn't an official, STCW or OCIMF certificate.</p>
        </section>
        {auth.status === "out" && <SignInScreen title="Sign in to earn it" text="Certificates are kept on your account, so your progress needs to be saved there. Your progress as a guest comes with you when you sign in." />}
        {cert && (
          <section className="flex flex-col gap-2.5 rounded-[22px] border border-sea bg-sea-soft/40 p-4">
            <b className="text-[16px]">Certificate {cert.id}</b>
            <span className="text-[13px] text-mute">{cert.name} · {cert.role} · issued {day(cert.issued)}</span>
            <span className="flex flex-wrap gap-2">
              <a href={cert.url} target="_blank" rel="noreferrer" className={cn(btn, "flex items-center bg-primary text-on-primary no-underline")}>Open and print</a>
              <button type="button" onClick={async () => setMsg(await shareLink(url, `My NilObs certificate: ${CERT_TITLE}`))} className={cn(btn, "border border-line bg-surface")}>Share the link</button>
            </span>
          </section>
        )}
        {!cert && (
          <Section title="What it takes" aside={`${checks.filter((c) => c.done).length}/${checks.length} done`}>
            {checks.map((c) => (
              <button key={c.id} type="button" onClick={() => !c.done && go(goFor[c.id])} className={cn("flex items-center gap-3 rounded-2xl border p-3 text-left", c.done ? "border-sea bg-sea-soft/40" : "border-line bg-surface")}>
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", c.done ? "bg-sea text-white" : "border-2 border-line")}>{c.done && <I.Check size={15} />}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[13.5px] leading-snug font-semibold">{c.label}</span>
                  {!c.done && c.id !== "role" && (
                    <span className="h-1.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (c.have / c.need) * 100)}%` }} /></span>
                  )}
                  {!c.done && c.id !== "role" && <span className="tnum text-[11.5px] text-mute">{c.id === "interview" ? `best so far ${c.have}/10` : `${c.have} of ${c.need}`}</span>}
                </span>
                {!c.done && <I.ChevronRight size={16} className="shrink-0 text-mute" />}
              </button>
            ))}
          </Section>
        )}
        {(ready || cert) && auth.status === "in" && (
          <form onSubmit={issue} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3.5">
            <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-mute">
              Your name, as it should appear
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" className={field} />
            </label>
            <button type="submit" disabled={busy} className="h-11 rounded-xl bg-primary text-[14px] font-semibold text-on-primary disabled:opacity-50">{cert ? "Change the name" : "Get my certificate"}</button>
          </form>
        )}
        {msg && <p role="status" className="text-[13px] font-medium">{msg}</p>}
        <p className="text-[12px] text-mute">Needs: practice in each topic for your role ({CERT.cardsPerTopic}+ cards each), {CERT.drills} daily drills and one AI inspector session scored {CERT.interviewAvg}/10 or more. Progress from other devices can take a minute to sync.</p>
      </Scroll>
    </>
  )
}

/* ---------------- receipts ---------------- */
interface Receipt { id: string; at: number; item: string; amount: number; currency: "INR" | "USD"; provider: string; ref: string }
export function ReceiptsCard({ className }: { className?: string }): ReactNode {
  const auth = useAuth()
  const [list, setList] = useState<Receipt[] | null>(null)
  useEffect(() => {
    if (auth.status !== "in") return
    api<{ receipts: Receipt[] }>("/api/pay/receipts").then((r) => setList(r.ok && r.data ? r.data.receipts : []))
  }, [auth.status])
  if (auth.status !== "in") return null
  return (
    <section className={cn("flex flex-col gap-2", className)} aria-labelledby="receipts-title">
      <h3 id="receipts-title" className="text-[15px] font-bold">Payments and receipts</h3>
      {!list ? (
        <p className="text-[13px] text-mute">Loading…</p>
      ) : !list.length ? (
        <p className="text-[13px] text-mute">No payments yet. Each payment you make shows here with a receipt you can print or save as a PDF.</p>
      ) : (
        list.map((r) => (
          <a key={r.id} href={`/receipt/${r.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5 text-ink no-underline hover:border-mute">
            <I.Receipt size={18} className="shrink-0 text-mute" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13.5px] font-semibold">{r.item}</span>
              <span className="text-[12px] text-mute">{day(r.at)}</span>
            </span>
            <span className="tnum shrink-0 font-mono text-[13px] font-semibold">{fmtPrice(r.amount, r.currency)}</span>
          </a>
        ))
      )}
    </section>
  )
}

/* ---------------- Today: crew and certificate at a glance ---------------- */
export function CrewCertCards({ go, rank }: { go: (s: AppScreen) => void; rank: string }) {
  const auth = useAuth()
  const prog = useProgress()
  const checks = certChecks(prog, { rank })
  const done = checks.filter((c) => c.done).length
  const [crews, setCrews] = useState<Crew[] | null>(null)
  useEffect(() => {
    if (auth.status !== "in") return
    api<{ crews: Crew[] }>("/api/crews").then((r) => r.ok && r.data && setCrews(r.data.crews))
  }, [auth.status])
  const c = crews?.[0]
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      <button type="button" onClick={() => go("crew")} className="flex flex-col gap-2 rounded-[22px] border border-line bg-surface p-4 text-left">
        <span className="flex items-center gap-2 text-[15px] font-bold"><span className="flex size-7 items-center justify-center rounded-lg bg-primary-soft text-primary"><I.Ship size={16} /></span> {c ? c.name : "Your crew"}</span>
        <span className="text-[13px] leading-snug text-mute">{c ? `${c.members} member${c.members === 1 ? "" : "s"}${c.seatUntil ? ` · your seat runs to ${day(c.seatUntil)}` : ""}. See who's drilled this week.` : "Make a private board for your ship or class and see who's keeping up. Companies can pay for the whole crew."}</span>
        <span className="text-[13px] font-semibold text-primary">{c ? "Open the board →" : "Start a crew →"}</span>
      </button>
      <button type="button" onClick={() => go("cert")} className="flex flex-col gap-2 rounded-[22px] border border-line bg-surface p-4 text-left">
        <span className="flex items-center gap-2 text-[15px] font-bold"><span className="flex size-7 items-center justify-center rounded-lg bg-[#fff3d6] text-[#8a6d12]"><I.Award size={16} /></span> Certificate</span>
        <span className="text-[13px] leading-snug text-mute">{done === checks.length ? "You've done everything it takes. Claim your certificate." : `${done} of ${checks.length} steps done towards your certificate of completion.`}</span>
        <span className="h-1.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-[#c9a227]" style={{ width: `${(done / checks.length) * 100}%` }} /></span>
      </button>
    </div>
  )
}
