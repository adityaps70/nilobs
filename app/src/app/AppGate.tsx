// On nilobs.com the app is for signed-in users: "Start free" (or any #app link) asks for Google sign-in first,
// and the app opens as soon as it goes through, on the screen or plan the visitor picked.
// Where sign-in isn't set up (a local test build, or a server without Google configured) the app opens as before.
import type { ReactNode } from "react"
import { motion } from "motion/react"
import { GoogleButton, SignInPitch, useAuth } from "@/auth"
import { WELCOME_CREDITS } from "@/credits"
import { useNav } from "@/nav"
import { Logo } from "@/components/Brand"

export function AppGate({ children }: { children: ReactNode }) {
  const { status, signingIn } = useAuth()
  if (status === "in" || status === "off") return <>{children}</>
  return <SignInGate checking={status === "loading" ? "Checking your sign-in…" : signingIn ? "Signing you in…" : ""} />
}

function SignInGate({ checking }: { checking: string }) {
  const { openSite } = useNav()
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
              <h1 id="gate-title" className="display text-[25px] leading-tight font-bold">Sign in to start NilObs</h1>
              <p className="text-[14px] leading-snug text-mute">Free to start: a new account comes with {WELCOME_CREDITS} credits. Use your Google account, nothing to set up.</p>
            </div>
            <SignInPitch />
            <GoogleButton />
            <button type="button" onClick={() => openSite()} className="h-10 text-[13.5px] font-semibold text-mute">
              Back to the site
            </button>
          </>
        )}
      </motion.section>
    </main>
  )
}
