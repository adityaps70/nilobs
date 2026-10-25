// On nilobs.com the app is for signed-in users, on every device: "Start free" (or any #app link, including a crew
// invite) asks for a sign-in first (Google, or a code sent by email), and the app opens as soon as it goes through,
// on the screen or plan the visitor picked. Where sign-in isn't set up (a local test build, or a server without
// Google configured) the app opens as before.
import type { ReactNode } from "react"
import { motion } from "motion/react"
import { SignInOptions, SignInPitch, useAuth } from "@/auth"
import { WELCOME_CREDITS } from "@/credits"
import { useNav } from "@/nav"
import { Logo } from "@/components/Brand"
import * as I from "@/components/icons"
import { cn } from "@/lib/utils"

export function AppGate({ children }: { children: ReactNode }) {
  const { status, signingIn } = useAuth()
  if (status === "in" || status === "off") return <>{children}</>
  return <SignInGate checking={status === "loading" ? "Checking your sign-in…" : signingIn ? "Signing you in…" : ""} />
}

const invited = () => {
  try {
    return /^#app\/crew\/[A-Za-z0-9]+/.test(window.location.hash)
  } catch {
    return false
  }
}

function SignInGate({ checking }: { checking: string }) {
  const { openSite } = useNav()
  const { emailOn } = useAuth()
  const crew = invited()
  return (
    <main className="relative z-10 flex min-h-[100dvh] items-center justify-center px-4 py-10">
      <motion.section
        aria-labelledby="gate-title"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="sheet-panel flex w-full max-w-[420px] flex-col gap-4 rounded-[28px] border border-line p-6 text-ink shadow-2xl"
      >
        <button type="button" onClick={() => openSite()} aria-label="NilObs: back to the site" className="self-start">
          <Logo size={34} />
        </button>
        {checking ? (
          <p role="status" className="py-6 text-[14px] text-mute">{checking}</p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <h1 id="gate-title" className="display text-[25px] leading-tight font-bold">{crew ? "Sign in to join your crew" : "Sign in to start NilObs"}</h1>
              <p className="text-[14px] leading-snug text-mute">
                {crew ? "You were sent an invite link. Sign in (it's free) and you'll see the crew straight after. " : ""}
                Free to start: a new account comes with {WELCOME_CREDITS} credits. Use your Google account{emailOn ? " or your email" : ""}, nothing to set up.
              </p>
            </div>
            <SignInPitch />
            <SignInOptions />
            <button type="button" onClick={() => openSite()} className="h-10 text-[13.5px] font-semibold text-mute">
              Back to the site
            </button>
          </>
        )}
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
