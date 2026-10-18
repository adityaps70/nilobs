// NilObs brand: the mark is a Plimsoll load-line disc (the line painted on every hull),
// which also reads as Ø, "nil". The wordmark is drawn as monoline paths, so it never depends on a font.
import { useId } from "react"
import { cn } from "@/lib/utils"

export const BRAND = { name: "NilObs", tagline: "Aim for nil." }

const useSafeId = () => useId().replace(/[^a-zA-Z0-9_-]/g, "")

/** App-icon style tile with the white disc and orange load line. */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  const id = useSafeId()
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={cn("shrink-0 drop-shadow-[0_6px_12px_rgba(17,96,214,0.35)]", className)} aria-hidden="true">
      <defs>
        <linearGradient id={`t${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#55a9ff" /><stop offset="1" stopColor="#0d5bc4" /></linearGradient>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".42" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ff9a3c" /><stop offset="1" stopColor="#e8550f" /></linearGradient>
      </defs>
      <rect className="logo-tile" width="64" height="64" rx="15" fill={`url(#t${id})`} />
      <path className="logo-gloss" d="M15 1H49A14 14 0 0 1 63 15V22C50 28 14 28 1 22V15A14 14 0 0 1 15 1Z" fill={`url(#g${id})`} />
      <path d="M21.5 32a10.5 10.5 0 0 0 21 0z" fill="#fff" opacity=".34" />
      <circle className="logo-ring" cx="32" cy="32" r="13.5" fill="none" stroke="#fff" strokeWidth="6" />
      <rect className="logo-bar" x="7.25" y="29" width="49.5" height="6" rx="3" fill={`url(#b${id})`} />
    </svg>
  )
}

/** "nilobs" wordmark; the o is the load-line disc. Height sets the size. */
export function Wordmark({ height = 22, dark, className }: { height?: number; dark?: boolean; className?: string }) {
  const id = useSafeId()
  const ink = dark ? "#ffffff" : "var(--ink)"
  const st = { fill: "none", stroke: ink, strokeWidth: 9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
  return (
    <svg viewBox="-6 32 274 74" height={height} width={(height * 274) / 74} className={cn("shrink-0", className)} role="img" aria-label="NilObs">
      <defs>
        <linearGradient id={`w${id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ff9a3c" /><stop offset="1" stopColor="#e8550f" /></linearGradient>
      </defs>
      <path d="M0 100V60M0 80a20 20 0 0 1 40 0v20" {...st} />
      <path d="M60 100V64" {...st} />
      <circle cx="60" cy="47" r="5.6" fill={ink} />
      <path d="M80 100V38" {...st} />
      <path d="M111.5 80a15.5 15.5 0 0 0 31 0z" fill={dark ? "#8cc4ff" : "#3b8fe8"} opacity={dark ? 0.38 : 0.28} />
      <circle cx="127" cy="80" r="20" {...st} />
      <rect className="logo-bar" x="96" y="75.5" width="62" height="9" rx="4.5" fill={`url(#w${id})`} />
      <path d="M174 100V38" {...st} />
      <circle cx="194" cy="80" r="20" {...st} />
      <path d="M260 66.5C257 62 251.5 60 245 60C236 60 231 64.5 231 70C231 76 236 78.5 245.5 80.5C255 82.5 261 85 261 91C261 96.5 255.5 100 246 100C238.5 100 233 97.5 230 93" {...st} />
    </svg>
  )
}

/** Mark + wordmark, used in navigation bars. */
export function Logo({ size = 36, sub, dark }: { size?: number; sub?: string; dark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="flex flex-col gap-1.5 leading-none">
        <Wordmark height={Math.round(size * 0.56)} dark={dark} />
        {sub && <span className="text-[11.5px] leading-none text-mute">{sub}</span>}
      </span>
    </span>
  )
}
