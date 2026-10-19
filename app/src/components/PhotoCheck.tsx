// Photo check: the crew photographs an area, a piece of equipment or a record, and Claude looks at it the
// way a SIRE 2.0 inspector would: what would be flagged, why, and how to fix it before the day.
// Photos are shrunk on the device first (which also drops GPS and other metadata), sent for this one check
// and never stored. Only a small thumbnail and the findings are kept, on this device.
// A check keeps running if you leave the screen; its result is waiting when you come back.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"

import * as I from "@/components/icons"
import { cn } from "@/lib/utils"
import { Scroll, TopBar } from "@/components/ui"
import { IconTile, type TileColor } from "@/components/topicIcons"
import { AiChip, AiOff } from "@/components/AiFeatures"
import { COSTS, CreditPill, useWallet } from "@/credits"
import { useProgress } from "@/progress"
import { CHAPTER_NAMES, OBS, TYPE_NAME } from "@/fleet"
import { HIDE_CODES, aiErrorCopy, imageLimits, useSample, type AiErr, type ImageLimits } from "@/ai"
import { AREAS, areaById, examplesFor, normalize, photoPrompt, similarObs, str, type Area, type AreaId, type Box, type Result, type Sev } from "@/photo"

type Ico = (p: { size?: number; className?: string }) => ReactNode

/* ---------------- areas (look) ---------------- */
const AREA_LOOK: Record<AreaId, { icon: Ico; color: TileColor }> = {
  deck: { icon: I.Ship, color: "blue" },
  mooring: { icon: I.Anchor, color: "teal" },
  cargo: { icon: I.Droplet, color: "orange" },
  bridge: { icon: I.Compass, color: "indigo" },
  engine: { icon: I.Cog, color: "slate" },
  lsa: { icon: I.LifeBuoy, color: "rose" },
  accom: { icon: I.Home, color: "amber" },
  record: { icon: I.FileText, color: "sky" },
  any: { icon: I.Search, color: "violet" },
}

/* ---------------- photos on the device ---------------- */
interface Shot { id: string; blob: Blob; url: string; thumb: string }
const rid = () => Math.random().toString(36).slice(2, 10)
const MAX_SIDE = 1280
const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(String(fr.result))
    fr.onerror = () => rej(fr.error)
    fr.readAsDataURL(b)
  })

/** Decode, shrink to at most 1280 px and re-encode as JPEG. Re-encoding drops GPS and other metadata. */
async function prepare(file: Blob, maxBytes: number): Promise<Shot> {
  if (file.size > 40_000_000) throw new Error("too big")
  const src = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = src
    await img.decode()
    const w0 = img.naturalWidth, h0 = img.naturalHeight
    if (!w0 || !h0) throw new Error("empty")
    const draw = (max: number, q: number) =>
      new Promise<Blob>((res, rej) => {
        const s = Math.min(1, max / Math.max(w0, h0))
        const c = document.createElement("canvas")
        c.width = Math.max(1, Math.round(w0 * s))
        c.height = Math.max(1, Math.round(h0 * s))
        const g = c.getContext("2d")
        if (!g) return rej(new Error("canvas"))
        g.fillStyle = "#ffffff"
        g.fillRect(0, 0, c.width, c.height)
        g.drawImage(img, 0, 0, c.width, c.height)
        c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", q)
      })
    let blob = await draw(MAX_SIDE, 0.82)
    if (blob.size > maxBytes) blob = await draw(1024, 0.62)
    if (blob.size > maxBytes) throw new Error("too big")
    const thumb = await blobToDataUrl(await draw(320, 0.6))
    return { id: rid(), blob, url: URL.createObjectURL(blob), thumb }
  } finally {
    URL.revokeObjectURL(src)
  }
}

/* ---------------- a check in progress (survives leaving the screen) ---------------- */
interface Job { id: string; area: AreaId; note: string; shots: Shot[]; status: "busy" | "done" | "error" | "stopped"; result?: Result; err?: string; hide?: boolean; xp?: number; ctl: AbortController }
let job: Job | null = null
const jobSubs = new Set<() => void>()
const setJob = (j: Job | null) => {
  job = j
  jobSubs.forEach((f) => f())
}
const useJob = () => useSyncExternalStore((f: () => void) => { jobSubs.add(f); return () => { jobSubs.delete(f) } }, () => job)

/* ---------------- recent checks (thumbnails + findings, this device only) ---------------- */
const HIST_KEY = "sr.photos"
const HIST_MAX = 10
export interface Saved { id: string; at: number; area: AreaId; note: string; thumbs: string[]; result: Result }
function loadHistory(): Saved[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HIST_KEY) || "[]")
    if (!Array.isArray(raw)) return []
    return raw
      .filter((s) => s && typeof s.id === "string" && Array.isArray(s.thumbs) && s.result && typeof s.result === "object")
      .map((s) => {
        const thumbs = (s.thumbs as unknown[]).filter((t): t is string => typeof t === "string" && t.startsWith("data:image/")).slice(0, 3)
        return { id: s.id, at: Number(s.at) || 0, area: areaById(String(s.area)).id, note: str(s.note, 300), thumbs, result: normalize(s.result, thumbs.length || 1) }
      })
      .slice(0, HIST_MAX)
  } catch {
    return []
  }
}
let hist: Saved[] | null = null
const histSubs = new Set<() => void>()
const getHist = () => (hist ??= loadHistory())
function writeHist(list: Saved[]) {
  hist = list.slice(0, HIST_MAX)
  // thumbnails are small, but storage can still be full: drop the oldest until it fits
  for (let keep = hist.length; keep >= 0; keep--) {
    try {
      if (keep) localStorage.setItem(HIST_KEY, JSON.stringify(hist.slice(0, keep)))
      else localStorage.removeItem(HIST_KEY)
      break
    } catch {
      /* try with fewer */
    }
  }
  histSubs.forEach((f) => f())
}
const useHist = () => useSyncExternalStore((f: () => void) => { histSubs.add(f); return () => { histSubs.delete(f) } }, getHist)

/* ---------------- the screen ---------------- */
export function PhotoCheck({ rank, ship, onAsk }: { rank: string; ship: string; onAsk: (q: string) => void }) {
  const sample = useSample()
  const wallet = useWallet()
  const prog = useProgress()
  const cur = useJob()
  const history = useHist()
  const [lim, setLim] = useState<ImageLimits | null | undefined>(undefined)
  const [areaId, setAreaId] = useState<AreaId>(() => (job?.area ?? "deck"))
  const [shots, setShots] = useState<Shot[]>([])
  const [note, setNote] = useState("")
  const [busyPick, setBusyPick] = useState(false)
  const [pickErr, setPickErr] = useState("")
  const [view, setView] = useState<Saved | null>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const libRef = useRef<HTMLInputElement>(null)
  const shotsRef = useRef(shots)
  shotsRef.current = shots

  useEffect(() => {
    let on = true
    if (sample === undefined) return
    imageLimits(sample).then((l) => on && setLim(l))
    return () => {
      on = false
    }
  }, [sample])
  // photos picked but never sent are let go when you leave
  useEffect(() => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url)), [])
  // a stopped check hands its photos, note and area back to the picker
  useEffect(() => {
    if (cur?.status !== "stopped") return
    setShots(cur.shots)
    setNote(cur.note)
    setAreaId(cur.area)
    setJob(null)
  }, [cur])

  const area = areaById(areaId)
  const max = Math.min(3, lim?.maxCount ?? 3)
  const cost = COSTS.photo * Math.max(1, shots.length)

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || !lim) return
    setPickErr("")
    setBusyPick(true)
    const room = max - shotsRef.current.length
    const list = [...files].slice(0, Math.max(0, room))
    const added: Shot[] = []
    let failed = 0
    for (const f of list) {
      try {
        added.push(await prepare(f, lim.maxInputBytes))
      } catch {
        failed++
      }
    }
    setShots((s) => [...s, ...added].slice(0, max))
    setBusyPick(false)
    if (failed) setPickErr(failed === 1 ? "One photo couldn't be read. Try a JPEG or PNG." : `${failed} photos couldn't be read. Try JPEG or PNG.`)
    else if (files.length > room) setPickErr(`Up to ${max} photos per check.`)
  }
  const removeShot = (id: string) =>
    setShots((s) => {
      const gone = s.find((x) => x.id === id)
      if (gone) URL.revokeObjectURL(gone.url)
      return s.filter((x) => x.id !== id)
    })

  const run = async (from?: Job) => {
    const pics = from ? from.shots : shots
    const a = from ? areaById(from.area) : area
    const nt = from ? from.note : note.trim()
    if (!sample || !lim || !pics.length || job?.status === "busy") return
    const n = pics.length
    const receipt = wallet.charge(COSTS.photo * n, `Photo check · ${a.label} · ${n} photo${n === 1 ? "" : "s"}`, "photos", { hold: true })
    if (!receipt) return
    const ex = examplesFor(a)
    const ids = new Set(ex.map((e) => e.id))
    const j: Job = { id: rid(), area: a.id, note: nt, shots: pics, status: "busy", ctl: new AbortController() }
    setJob(j)
    if (!from) {
      setShots([])
      setNote("")
    }
    const still = () => job?.id === j.id
    try {
      const raw = await sample.json(photoPrompt(a, n, nt, rank, ship, ex), {
        images: pics.map((p) => p.blob),
        signal: j.ctl.signal,
        cache: false,
        modelTier: wallet.perks.expert ? "complex" : "default",
      })
      const r = normalize(raw, n, (id) => ids.has(id))
      if (!r.relevant) {
        wallet.refund(receipt, "photos")
        if (still()) setJob({ ...j, status: "error", err: "That doesn't look like part of a ship, its equipment or a shipboard record, so your credits were refunded. Try a closer photo of the area." })
        return
      }
      wallet.settle(receipt)
      const xp = prog.aiXp("photo")
      writeHist([{ id: j.id, at: Date.now(), area: a.id, note: nt, thumbs: pics.map((p) => p.thumb), result: r }, ...getHist().filter((h) => h.id !== j.id)])
      if (still()) setJob({ ...j, status: "done", result: r, xp })
    } catch (e) {
      const er = e as AiErr
      wallet.refund(receipt, "photos")
      if (!still()) return
      // stopped: the screen puts the photos back so they can be sent again
      if (er.code === "cancelled") setJob({ ...j, status: "stopped" })
      else setJob({ ...j, status: "error", err: `${aiErrorCopy(er)} Your credits were refunded.`, hide: HIDE_CODES.includes(er.code || "") || er.code === "images_unavailable" })
    }
  }
  const startOver = () => {
    job?.shots.forEach((s) => URL.revokeObjectURL(s.url))
    setJob(null)
  }

  const right = <CreditPill className="h-9" />

  // a saved check from the list
  if (view)
    return (
      <>
        <TopBar title="Photo check" onBack={() => setView(null)} right={right} />
        <Scroll className="pt-1">
          <ResultView result={view.result} images={view.thumbs} area={areaById(view.area)} at={view.at} note={view.note} onAsk={onAsk} />
          <button type="button" onClick={() => setView(null)} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-[14px] font-semibold">
            <I.ChevronLeft size={16} /> All photo checks
          </button>
        </Scroll>
      </>
    )

  if (cur && cur.status !== "stopped")
    return (
      <>
        <TopBar title="Photo check" right={right} />
        <Scroll className="pt-1">
          {cur.status === "busy" && (
            <section className="glass flex flex-col gap-3 rounded-[22px] p-4" aria-live="polite">
              <div className="flex gap-2 overflow-x-auto">
                {cur.shots.map((s) => (
                  <span key={s.id} className="relative size-24 shrink-0 overflow-hidden rounded-xl">
                    <img src={s.url} alt="" className="size-full object-cover opacity-80" />
                    <motion.span className="absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-[#7b5cff]/45 to-transparent" animate={{ top: ["-30%", "100%"] }} transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }} />
                  </span>
                ))}
              </div>
              <Scanning />
              <p className="text-[12.5px] leading-snug text-mute">Usually 10 to 40 seconds. You can leave this screen: the result will be waiting here.</p>
              <button type="button" onClick={() => cur.ctl.abort()} className="self-start text-[12.5px] font-semibold text-mute underline underline-offset-2">Stop and refund</button>
            </section>
          )}
          {cur.status === "error" && (
            <section className="flex flex-col gap-3 rounded-[22px] border border-signal/40 bg-signal-soft p-4" role="alert">
              <div className="flex gap-2">
                {cur.shots.map((s) => <img key={s.id} src={s.url} alt="" className="size-16 shrink-0 rounded-lg object-cover" />)}
              </div>
              <p className="text-[13.5px] leading-snug font-medium text-signal-ink">{cur.err}</p>
              <div className="flex flex-wrap gap-2">
                {!cur.hide && (
                  <button type="button" onClick={() => run(cur)} className="flex h-10 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-bg">
                    <I.Refresh size={15} /> Try again · {COSTS.photo * cur.shots.length} credits
                  </button>
                )}
                <button type="button" onClick={startOver} className="flex h-10 items-center rounded-xl border border-line bg-surface px-3.5 text-[13px] font-semibold">Start over</button>
              </div>
            </section>
          )}
          {cur.status === "done" && cur.result && (
            <>
              <ResultView result={cur.result} images={cur.shots.map((s) => s.url)} area={areaById(cur.area)} at={Date.now()} note={cur.note} onAsk={onAsk} xp={cur.xp} />
              <button type="button" onClick={startOver} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7b5cff] to-[#1660d6] text-[14.5px] font-semibold text-white">
                <I.Camera size={17} /> Check another photo
              </button>
            </>
          )}
        </Scroll>
      </>
    )

  return (
    <>
      <TopBar title="Photo check" right={right} />
      <Scroll className="pt-1">
        <section className="flex flex-col gap-1.5">
          <span className="flex items-center gap-2"><AiChip /><span className="text-[12px] font-semibold text-mute">Before the inspector sees it</span></span>
          <h2 className="display text-[23px] leading-tight font-bold">Snap it. See what an inspector would flag.</h2>
          <p className="text-[13.5px] leading-snug text-mute">Photograph an area, a piece of equipment or a record. Claude looks at it like a SIRE 2.0 inspector: what would be raised, why, and how to fix it first, with similar findings from real inspections.</p>
        </section>

        {sample === null ? (
          <AiOff>Sign in to Claude at the top right, then reload, to check photos. The AI runs on your own Claude account.</AiOff>
        ) : lim === null ? (
          <div className="flex gap-3 rounded-2xl border border-dashed border-line bg-surface p-4 text-[13.5px] leading-snug">
            <IconTile icon={I.Camera} color="sky" size={34} />
            <span className="flex flex-col gap-1">
              <b className="font-semibold">Photos can't be sent from this view</b>
              <span className="text-mute">Open NilObs in the Claude app or on the NilObs site to use Photo check. Ask NilObs and the AI inspector still work here.</span>
            </span>
          </div>
        ) : (
          <>
            <section className="flex flex-col gap-2.5" aria-labelledby="pc-area">
              <h3 id="pc-area" className="text-[15px] font-bold">1. What are you checking?</h3>
              <div role="radiogroup" aria-labelledby="pc-area" className="grid grid-cols-2 gap-2">
                {AREAS.map((a) => {
                  const on = a.id === areaId
                  return (
                    <button key={a.id} type="button" role="radio" aria-checked={on} onClick={() => setAreaId(a.id)}
                      className={cn("flex min-h-[56px] items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-colors", on ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-mute")}>
                      <IconTile icon={AREA_LOOK[a.id].icon} color={AREA_LOOK[a.id].color} size={32} />
                      <span className="min-w-0 text-[13px] leading-tight font-semibold">{a.label}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[12px] text-mute"><b className="font-semibold text-ink">{area.label}:</b> {area.sub}.</p>
            </section>

            <section className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[15px] font-bold">2. Add photos</h3>
                <span className="font-mono text-[11px] text-mute">{shots.length} of {max} · {COSTS.photo} credits each</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {shots.map((s, i) => (
                  <span key={s.id} className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-surface-2">
                    <img src={s.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />
                    <span className="absolute top-1.5 left-1.5 rounded-full bg-black/60 px-1.5 font-mono text-[10.5px] font-bold text-white">{i + 1}</span>
                    <button type="button" onClick={() => removeShot(s.id)} aria-label={`Remove photo ${i + 1}`} className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-white">
                      <I.Close size={14} />
                    </button>
                  </span>
                ))}
                {max - shots.length >= 2 && (
                  <button type="button" disabled={busyPick} onClick={() => camRef.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-primary/40 bg-primary-soft/50 text-primary disabled:opacity-60">
                    <I.Camera size={22} />
                    <span className="text-[12px] font-semibold">{busyPick ? "Reading…" : "Take photo"}</span>
                  </button>
                )}
                {shots.length < max && (
                  <button type="button" disabled={busyPick} onClick={() => libRef.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line bg-surface text-ink disabled:opacity-60">
                    {max - shots.length >= 2 ? <I.Download size={20} className="rotate-180" /> : <I.Plus size={20} />}
                    <span className="text-[12px] font-semibold">{max - shots.length >= 2 ? "Upload" : busyPick ? "Reading…" : "Add photo"}</span>
                  </button>
                )}
              </div>
              <input ref={camRef} type="file" accept="image/*" capture="environment" aria-label="Take a photo" className="sr-only" tabIndex={-1}
                onChange={(e) => { addFiles(e.currentTarget.files); e.currentTarget.value = "" }} />
              <input ref={libRef} type="file" accept="image/*" multiple aria-label="Upload photos" data-testid="photo-upload" className="sr-only" tabIndex={-1}
                onChange={(e) => { addFiles(e.currentTarget.files); e.currentTarget.value = "" }} />
              {pickErr && <p role="alert" className="text-[12.5px] font-medium text-signal-ink">{pickErr}</p>}
              <p className="flex gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[12px] leading-snug text-mute">
                <I.Shield size={15} className="mt-px shrink-0 text-sea" />
                <span>Keep faces, the ship's name and the IMO number out of the frame. Photos are shrunk on your phone, sent for this check only and not stored. NilObs keeps a small thumbnail on this device.</span>
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <label htmlFor="pc-note" className="text-[15px] font-bold">3. Anything to focus on? <span className="text-[12px] font-normal text-mute">Optional</span></label>
              <input id="pc-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. the extinguisher by the galley door"
                className="h-11 rounded-xl border border-line bg-surface px-3 text-[14px] outline-none focus:border-primary" />
            </section>

            <button type="button" disabled={!shots.length || !sample || busyPick} onClick={() => run()}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7b5cff] to-[#1660d6] text-[14.5px] font-semibold text-white disabled:opacity-45">
              <I.Sparkle size={17} /> {shots.length ? `Check ${shots.length === 1 ? "this photo" : `${shots.length} photos`} · ${cost} credits` : "Add a photo to check"}
            </button>
            {wallet.balance < cost && shots.length > 0 && (
              <p className="-mt-2 text-center text-[12px] text-mute">You have {wallet.balance} credits. <button type="button" onClick={() => wallet.openPlans({ reason: `A photo check needs ${cost} credits.` })} className="font-semibold text-primary">Get more</button></p>
            )}
          </>
        )}

        {history.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[15px] font-bold">Your recent checks</h3>
              <span className="font-mono text-[11px] text-mute">On this device</span>
            </div>
            {history.map((h) => {
              const a = areaById(h.area)
              const top = topSev(h.result)
              return (
                <button key={h.id} type="button" onClick={() => setView(h)} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5 text-left hover:border-mute">
                  {h.thumbs[0] ? <img src={h.thumbs[0]} alt="" className="size-14 shrink-0 rounded-xl object-cover" /> : <IconTile icon={AREA_LOOK[a.id].icon} color={AREA_LOOK[a.id].color} size={56} />}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[13.5px] font-semibold">{h.result.area || a.label}</span>
                    <span className="text-[11.5px] text-mute">{a.label} · {fmtDate(h.at)}</span>
                    <span className="text-[12px] font-medium">{h.result.findings.length ? `${h.result.findings.length} to fix` : "Nothing flagged"}</span>
                  </span>
                  <SevDot sev={top} />
                </button>
              )
            })}
          </section>
        )}
      </Scroll>
    </>
  )
}

/* ---------------- result ---------------- */
const SEV: Record<Sev | "none", { label: string; sub: string; dot: string; pill: string; box: string }> = {
  high: { label: "Likely to be raised", sub: "Fix these before the inspector walks past.", dot: "bg-signal", pill: "bg-signal-soft text-signal-ink", box: "border-signal" },
  medium: { label: "Could be raised", sub: "Worth sorting out; an inspector may ask about it.", dot: "bg-[#e08a00]", pill: "bg-amber-soft text-amber-ink", box: "border-[#e08a00]" },
  low: { label: "Minor points", sub: "Housekeeping. Quick wins before the day.", dot: "bg-primary", pill: "bg-primary-soft text-primary", box: "border-primary" },
  none: { label: "Nothing an inspector would flag", sub: "From what the photo shows. See what else they'll check below.", dot: "bg-sea", pill: "bg-sea-soft text-sea", box: "border-sea" },
}
const SEV_WORD: Record<Sev, string> = { high: "Likely", medium: "Could be raised", low: "Minor" }
function topSev(r: Result): Sev | "none" {
  return r.findings.some((f) => f.severity === "high") ? "high" : r.findings.some((f) => f.severity === "medium") ? "medium" : r.findings.length ? "low" : "none"
}
function SevDot({ sev }: { sev: Sev | "none" }) {
  return <span className={cn("size-3 shrink-0 rounded-full", SEV[sev].dot)} aria-label={SEV[sev].label} />
}
const fmtDate = (t: number) => (t ? new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "")

function defectList(r: Result, area: Area, at: number, note: string) {
  const lines = [`Photo check · ${r.area || area.label} · ${new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`]
  if (note) lines.push(`Focus: ${note}`)
  if (r.summary) lines.push(r.summary)
  lines.push("")
  r.findings.forEach((f, i) => {
    lines.push(`${i + 1}. [${SEV_WORD[f.severity]}] ${f.title}${f.chapter ? ` (ch ${f.chapter} ${CHAPTER_NAMES[f.chapter]})` : ""}`)
    if (f.what) lines.push(`   Seen: ${f.what}`)
    if (f.fix) lines.push(`   Fix: ${f.fix}`)
  })
  if (!r.findings.length) lines.push("Nothing flagged from the photo.")
  if (r.checkNext.length) lines.push("", "Also check:", ...r.checkNext.map((c) => `- ${c}`))
  lines.push("", "From NilObs Photo check. Based on the photo only.")
  return lines.join("\n")
}

function ResultView({ result: r, images, area, at, note, onAsk, xp }: { result: Result; images: string[]; area: Area; at: number; note: string; onAsk: (q: string) => void; xp?: number }) {
  const top = topSev(r)
  const [marks, setMarks] = useState(true)
  const [open, setOpen] = useState<number | null>(r.findings.length ? 0 : null)
  const [copied, setCopied] = useState(false)
  const related = useMemo(
    () =>
      r.findings.map((f) => {
        const ids = f.related.length ? f.related : similarObs(`${f.title} ${f.what}`, area).map((x) => x.id)
        return ids.map((id) => OBS[Number(id.slice(1))]).filter(Boolean).slice(0, 2)
      }),
    [r, area]
  )
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(defectList(r, area, at, note))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }
  const s = SEV[top]
  return (
    <div className="flex flex-col gap-4">
      <section className="glass flex flex-col gap-2 rounded-[22px] p-4" aria-live="polite">
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold", s.pill)}><SevDot sev={top} /> {s.label}</span>
          {!!xp && <span className="rounded-full bg-primary-soft px-2 py-0.5 font-mono text-[11px] font-bold text-primary">+{xp} XP</span>}
          <span className="ml-auto text-[11.5px] text-mute">{area.label}</span>
        </span>
        <h2 className="text-[18px] leading-snug font-bold">{r.area || area.label}</h2>
        {r.summary && <p className="text-[14px] leading-relaxed">{r.summary}</p>}
        <p className="text-[12px] text-mute">{s.sub}{r.confidence === "low" ? " The photo was hard to read: a closer, brighter shot will give a better check." : ""}</p>
      </section>

      <section className="flex flex-col gap-2">
        {images.map((src, pi) => {
          const here = r.findings.map((f, i) => ({ f, i })).filter(({ f }) => f.photo === pi + 1 && f.box)
          return (
            <figure key={pi} className="relative overflow-hidden rounded-2xl border border-line bg-black">
              <img src={src} alt={`Photo ${pi + 1}`} className="block w-full" />
              {marks &&
                here.map(({ f, i }) => {
                  const [x, y, w, h] = f.box as Box
                  return (
                    <button key={i} type="button" onClick={() => setOpen(i)} aria-label={`Finding ${i + 1}: ${f.title}`}
                      className={cn("absolute rounded-md border-2 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]", SEV[f.severity].box, open === i && "ring-2 ring-white")}
                      style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }}>
                      <span className={cn("absolute -top-2.5 -left-2.5 flex size-5 items-center justify-center rounded-full font-mono text-[10.5px] font-bold text-white shadow", SEV[f.severity].dot)}>{i + 1}</span>
                    </button>
                  )
                })}
              {images.length > 1 && <figcaption className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 font-mono text-[10.5px] font-bold text-white">Photo {pi + 1}</figcaption>}
            </figure>
          )
        })}
        {r.findings.some((f) => f.box) && (
          <button type="button" onClick={() => setMarks((m) => !m)} className="self-start text-[12px] font-semibold text-mute underline underline-offset-2">
            {marks ? "Hide the markers" : "Show the markers"}
          </button>
        )}
      </section>

      {r.findings.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[15px] font-bold">What the inspector would flag</h3>
          {r.findings.map((f, i) => {
            const on = open === i
            return (
              <div key={i} className={cn("flex flex-col rounded-2xl border bg-surface", on ? "border-mute" : "border-line")}>
                <button type="button" onClick={() => setOpen(on ? null : i)} aria-expanded={on} className="flex items-start gap-2.5 p-3 text-left">
                  <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold text-white", SEV[f.severity].dot)}>{i + 1}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[14px] leading-snug font-semibold">{f.title}</span>
                    <span className="flex flex-wrap gap-1.5 text-[10.5px]">
                      <span className={cn("rounded-full px-1.5 py-px font-bold", SEV[f.severity].pill)}>{SEV_WORD[f.severity]}</span>
                      {f.type && <span className="rounded-full bg-surface-2 px-1.5 py-px font-semibold text-mute">{f.type}</span>}
                      {f.chapter && <span className="rounded-full bg-surface-2 px-1.5 py-px font-semibold text-mute">Ch {f.chapter} · {CHAPTER_NAMES[f.chapter]}</span>}
                    </span>
                  </span>
                  <I.ChevronDown size={16} className={cn("mt-1 shrink-0 text-mute transition-transform", on && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {on && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="flex flex-col gap-2.5 px-3 pb-3 text-[13.5px] leading-snug">
                        {f.what && <p><b className="font-semibold">What's visible.</b> {f.what}</p>}
                        {f.why && <p><b className="font-semibold">Why it's raised.</b> {f.why}</p>}
                        {f.fix && <p className="rounded-xl bg-sea-soft px-3 py-2 text-ink"><b className="font-semibold text-sea">Fix before the day.</b> {f.fix}</p>}
                        {related[i].length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[11.5px] font-semibold tracking-wide text-mute uppercase">Seen in real inspections</span>
                            {related[i].map((o, k) => (
                              <div key={k} className="flex flex-col gap-0.5 rounded-xl border border-line bg-bg/40 p-2.5 text-[12.5px]">
                                <span className="font-mono text-[10.5px] font-semibold text-mute">{o.i} · ch {o.c} {CHAPTER_NAMES[o.c] || ""}{o.q ? ` · Q ${o.q}` : ""}{o.y ? ` · ${TYPE_NAME[o.y]}` : ""}</span>
                                <span>{o.t}</span>
                                {o.f && <span className="text-sea">Fix: {o.f}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        <button type="button" onClick={() => onAsk(`An inspector could flag this on our ${(r.area || area.label).toLowerCase()}: "${f.title}". ${f.what} How do we fix it properly, and what will the inspector ask about it?`)}
                          className="flex h-9 items-center gap-1.5 self-start rounded-full border border-[#d9cffd] bg-[#f4f0ff]/80 px-3 text-[12.5px] font-semibold text-[#5a3bd1]">
                          <I.Sparkle size={14} /> Ask NilObs about this
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </section>
      )}

      {r.good.length > 0 && (
        <section className="flex flex-col gap-1.5 rounded-2xl bg-sea-soft p-3.5">
          <h3 className="text-[13.5px] font-bold text-sea">Looks right</h3>
          {r.good.map((g, i) => <span key={i} className="flex gap-2 text-[13px] leading-snug"><I.Check size={15} className="mt-px shrink-0 text-sea" />{g}</span>)}
        </section>
      )}
      {r.checkNext.length > 0 && (
        <section className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-3.5">
          <h3 className="text-[13.5px] font-bold">The inspector will also check</h3>
          {r.checkNext.map((g, i) => <span key={i} className="flex gap-2 text-[13px] leading-snug"><I.Search size={14} className="mt-0.5 shrink-0 text-mute" />{g}</span>)}
        </section>
      )}

      <div className="flex flex-col gap-1.5">
        <button type="button" onClick={copy} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-[14px] font-semibold">
          {copied ? <><I.Check size={16} /> Copied</> : <><I.Clipboard size={16} /> Copy as a defect list</>}
        </button>
        <p className="text-center text-[11px] leading-snug text-mute">Based on the photo only. Use it to prepare; it isn't an inspection result.</p>
      </div>
    </div>
  )
}

function Scanning() {
  const steps = ["Looking at it like an inspector", "Checking condition and markings", "Matching real findings", "Writing the fixes"]
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(steps.length - 1, n + 1)), 6000)
    return () => clearInterval(t)
  }, [steps.length])
  return (
    <span className="flex items-center gap-2 text-[13.5px] font-medium text-mute" role="status">
      <span className="flex gap-1">
        {[0, 1, 2].map((k) => (
          <motion.span key={k} className="size-1.5 rounded-full bg-primary" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ repeat: Infinity, duration: 1.1, delay: k * 0.18 }} />
        ))}
      </span>
      {steps[i]}…
    </span>
  )
}

/** Small tile for Today and the landing page. */
export const PHOTO_BLURB = "Snap an area, equipment or a record; see what an inspector would flag"
