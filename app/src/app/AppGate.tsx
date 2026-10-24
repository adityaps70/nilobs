// On nilobs.com the app opens straight away, signed in or not. Signed out, it's a guest: flashcards, the daily
// drill, Spot the observation, the radar, stories and the live feed all work, and progress stays in this browser
// until the first sign-in makes it the account's. The AI, buying, the pulse, leagues, crews and certificates ask
// for a sign-in when they're opened. While the sign-in check (or a sign-in) is under way, a short wait screen shows.
import type { ReactNode } from "react"
import { motion } from "motion/react"
import { SignInOptions, useAuth } from "@/auth"
import { WELCOME_CREDITS } from "@/credits"
import { useNav } from "@/nav"
import { Logo } from "@/components/Brand"
import * as I from "@/components/icons"
import { cn } from "@/lib/utils"

export function AppGate({ children }: { children: ReactNode }) {
  const { status, signingIn } = useAuth()
  if (status === "loading" || signingIn) return <Waiting text={signingIn ? "Signing you in…" : "Opening NilObs…"} />
  return <>{children}</>
}

function Waiting({ text }: { text: string }) {
  const { openSite } = useNav()
  return (
    <main className="relative z-10 flex min-h-[100dvh] items-center justify-center px-4 py-10">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="sheet-panel flex w-full max-w-[420px] flex-col gap-4 rounded-[28px] border border-line p-6 text-ink shadow-2xl">
        <button type="button" onClick={() => openSite()} aria-label="NilObs: back to the site" className="self-start">
          <Logo size={34} />
        </button>
        <p role="status" className="py-6 text-[14px] text-mute">{text}</p>
      </motion.section>
    </main>
  )
}

/** Signed out: a short line saying what signing in adds, with the way in. Nothing when signed in. */
export function GuestBanner({ className, title, text }: { className?: string; title?: string; text?: string }) {
  const a = useAuth()
  if (a.status !== "out") return null
  return (
    <section aria-label="You're using NilObs as a guest" className={cn("flex items-center gap-3 rounded-2xl border border-[#cfe0f6] bg-[#eef5ff]/90 px-3.5 py-3 text-[13px] leading-snug text-ink", className)}>
      <I.User size={18} className="shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <b className="font-semibold">{title ?? "You're trying NilObs as a guest."}</b>{" "}
        <span className="text-mute">{text ?? `Sign in free to keep your progress on every device and get ${WELCOME_CREDITS} credits for the AI.`}</span>
      </span>
      <button type="button" onClick={() => a.prompt("Sign in to keep your progress")} className="h-9 shrink-0 rounded-full bg-primary px-3.5 text-[13px] font-semibold text-on-primary">Sign in</button>
    </section>
  )
}

/** A whole screen that needs an account (the pulse, leagues, crews, certificates): why, and the way in. */
export function SignInScreen({ title, text }: { title: string; text: string }) {
  const a = useAuth()
  if (a.status !== "out") return null
  return (
    <div className="flex flex-col gap-3 rounded-[22px] border border-line bg-surface p-4">
      <h2 className="display text-[19px] leading-tight font-bold">{title}</h2>
      <p className="text-[13.5px] leading-snug text-mute">{text}</p>
      <SignInOptions />
    </div>
  )
}
