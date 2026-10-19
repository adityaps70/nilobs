// Voice: the AI inspector reads its questions aloud, and answers can be spoken.
// - Speaking: Rumik's studio voice through the Worker (/api/voice) when the server has a key,
//   otherwise the device's built-in voice.
// - Listening: the browser's own speech recognition (Chrome, Edge, Safari), which fills the answer box.
import { useCallback, useEffect, useRef, useState } from "react"
import { HOSTED } from "@/ai"

/* ---------------- server status ---------------- */
type Status = { ai: boolean; voice: boolean }
let status: Promise<Status> | null = null
export function serverStatus(): Promise<Status> {
  if (status) return status
  status = HOSTED
    ? fetch("/api/health", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => ({ ai: !!j?.ai, voice: !!j?.voice }))
        .catch(() => ({ ai: true, voice: false }))
    : Promise.resolve({ ai: false, voice: false })
  return status
}
/** undefined while checking; true when the studio voice is available. */
export function useStudioVoice() {
  const [v, setV] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    let on = true
    serverStatus().then((s) => on && setV(s.voice))
    return () => {
      on = false
    }
  }, [])
  return v
}
export const canSpeak = () => typeof window !== "undefined" && ("speechSynthesis" in window || HOSTED)

/* ---------------- speaking ---------------- */
let current: HTMLAudioElement | null = null
const clips = new Map<string, string>() // text -> object URL
export function stopSpeaking() {
  if (current) {
    current.pause()
    current = null
  }
  try {
    window.speechSynthesis?.cancel()
  } catch {
    /* ignore */
  }
}
export type SpeakResult = "studio" | "device" | "none"

/** Read text aloud. Resolves when it finishes (or is stopped). */
export async function speak(text: string, opts: { studio?: boolean; signal?: AbortSignal; onStart?: () => void } = {}): Promise<SpeakResult> {
  stopSpeaking()
  const clean = text.replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim().slice(0, 600)
  if (!clean) return "none"
  if (opts.studio) {
    try {
      let url = clips.get(clean)
      if (!url) {
        const res = await fetch("/api/voice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: clean }), signal: opts.signal })
        if (!res.ok) throw new Error(`voice ${res.status}`)
        url = URL.createObjectURL(await res.blob())
        clips.set(clean, url)
      }
      if (opts.signal?.aborted) return "none"
      const a = new Audio(url)
      current = a
      await new Promise<void>((resolve, reject) => {
        a.onended = () => resolve()
        a.onpause = () => resolve()
        a.onerror = () => reject(new Error("audio"))
        opts.signal?.addEventListener("abort", () => {
          a.pause()
          resolve()
        })
        a.play().then(() => opts.onStart?.()).catch(reject)
      })
      return "studio"
    } catch {
      if (opts.signal?.aborted) return "none"
      // fall back to the device voice
    }
  }
  return deviceSpeak(clean, opts)
}

function deviceSpeak(text: string, opts: { signal?: AbortSignal; onStart?: () => void }): Promise<SpeakResult> {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined
  if (!synth) return Promise.resolve("none")
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    const voices = synth.getVoices()
    u.voice = voices.find((v) => /en-GB/i.test(v.lang)) || voices.find((v) => /en-IN/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null
    u.rate = 0.97
    u.onstart = () => opts.onStart?.()
    u.onend = () => resolve("device")
    u.onerror = () => resolve("none")
    opts.signal?.addEventListener("abort", () => {
      synth.cancel()
      resolve("none")
    })
    synth.speak(u)
  })
}

/* ---------------- dictation ---------------- */
type RecEvent = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }
interface Rec {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: RecEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start(): void
  stop(): void
  abort(): void
}
const RecCtor = () =>
  typeof window === "undefined" ? undefined : ((window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition)
export const canDictate = () => !!RecCtor()

/** Speech-to-text into a text box. `start(current)` keeps what's already typed and appends. */
export function useDictation(onText: (t: string) => void) {
  const [on, setOn] = useState(false)
  const [err, setErr] = useState("")
  const rec = useRef<Rec | null>(null)
  const cb = useRef(onText)
  cb.current = onText
  useEffect(() => () => rec.current?.abort(), [])
  const start = useCallback((current: string) => {
    const C = RecCtor()
    if (!C) return
    stopSpeaking()
    rec.current?.abort()
    const r = new C()
    r.lang = typeof navigator !== "undefined" && /^en/i.test(navigator.language) ? navigator.language : "en-GB"
    r.continuous = true
    r.interimResults = true
    const base = current.trim() ? current.trimEnd() + " " : ""
    r.onresult = (e) => {
      let t = ""
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
      cb.current((base + t).replace(/\s+/g, " ").trimStart())
    }
    r.onend = () => setOn(false)
    r.onerror = (e) => {
      setOn(false)
      setErr(e.error === "not-allowed" || e.error === "service-not-allowed" ? "The microphone is blocked. Allow it for this site to answer by voice." : e.error === "no-speech" ? "Didn't catch that. Tap the mic and speak again." : "Voice input stopped. You can type instead.")
    }
    setErr("")
    try {
      r.start()
      rec.current = r
      setOn(true)
    } catch {
      setErr("Voice input isn't available here. You can type instead.")
    }
  }, [])
  const stop = useCallback(() => rec.current?.stop(), [])
  return { supported: canDictate(), on, err, start, stop }
}
