import { Component, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { MotionConfig } from "motion/react"

import { AppView } from "@/app/AppView"
import { AppGate } from "@/app/AppGate"
import { WalletProvider } from "@/credits"
import { ProgressProvider } from "@/progress"
import { NavProvider, useNav } from "@/nav"
import { Features, HowItWorks, QuestionMarquee } from "@/sections/top"
import { Insights } from "@/sections/insights"
import { Fleet, Footer } from "@/sections/bottom"
import { ConfidenceCheck, FinalCta, LandingHero, Lessons, Pricing, SiteNav, StoriesSection, useStorySelection } from "@/sections/landing"
import { AiSection, HabitSection, RadarSection, SpotSection } from "@/sections/fleetSections"
import { PlansSheet } from "@/components/Plans"
import { HOSTED } from "@/ai"
import { AuthProvider } from "@/auth"

function Site() {
  const { selected, setSelected, jump } = useStorySelection()
  return (
    <>
      <SiteNav />
      <main>
        <LandingHero />
        <SpotSection />
        <AiSection />
        <ConfidenceCheck />
        <RadarSection />
        <QuestionMarquee />
        <HabitSection />
        <Lessons onSource={jump} />
        <StoriesSection selected={selected} setSelected={setSelected} />
        <Features />
        <Pricing />
        <Insights />
        <HowItWorks />
        <Fleet />
        <FinalCta />
      </main>
      <Footer />
    </>
  )
}

function Root() {
  const { view } = useNav()
  return (
    <>
      <div className="aurora" aria-hidden="true" />
      {view === "app" ? <AppGate><AppView /></AppGate> : <Site />}
      <PlansSheet />
    </>
  )
}

/** If anything crashes, offer a way back instead of a blank page. */
class Boundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) {
    return { err }
  }
  componentDidCatch(err: Error) {
    console.error("NilObs crashed:", err)
  }
  render() {
    if (!this.state.err) return this.props.children
    const KEEP = ["sr.wallet", "sr.progress", "sr.currency", "sr.night"]
    const obj = (x: unknown) => !!x && typeof x === "object" && !Array.isArray(x)
    const checks: Record<string, (x: unknown) => boolean> = {
      "sr.profile": (x) => x === null || (obj(x) && typeof (x as { rank?: unknown }).rank === "string"),
      "sr.brief": (x) => x === null || (obj(x) && Array.isArray((x as { done?: unknown }).done)),
      "sr.ask": (x) => obj(x) && Array.isArray((x as { msgs?: unknown }).msgs),
      "sr.interview": (x) => x === null || (obj(x) && Array.isArray((x as { turns?: unknown }).turns)),
      "sr.saved": (x) => Array.isArray(x),
    }
    const go = (remove: (k: string) => boolean) => {
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith("sr.") && !KEEP.includes(k) && remove(k)) localStorage.removeItem(k)
      } catch {
        /* ignore */
      }
      window.location.hash = "app/today"
      window.location.reload()
    }
    // first try removing only what's damaged; if that isn't enough, clear the saved screens (never credits or XP)
    const repair = () =>
      go((k) => {
        try {
          const v = JSON.parse(localStorage.getItem(k) || "null")
          return checks[k] ? !checks[k](v) : !obj(v) && !Array.isArray(v)
        } catch {
          return true
        }
      })
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-bg p-6 font-sans text-ink">
        <div className="flex max-w-[420px] flex-col gap-3 rounded-3xl border border-line bg-surface p-6">
          <h1 className="display text-[24px] font-bold">Something went wrong</h1>
          <p className="text-[14px] leading-snug text-mute">NilObs hit an error. Your credits, XP and level are safe. Repairing usually fixes it.</p>
          <button type="button" onClick={repair} className="h-11 rounded-xl bg-primary text-[14.5px] font-semibold text-on-primary">Repair and reload</button>
          <button type="button" onClick={() => go(() => true)} className="h-11 rounded-xl border border-line text-[14px] font-semibold">Reset saved screens</button>
          <p className="text-[12px] leading-snug text-mute">Resetting clears saved chats, briefs and interviews on this device. Credits, XP, badges and plans stay.</p>
        </div>
      </div>
    )
  }
}

// On your own domain, keep a copy of the app for use at sea without signal
if (HOSTED && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {})
  })
}

createRoot(document.getElementById("root")!).render(
  <MotionConfig reducedMotion="user">
    <NavProvider>
      <AuthProvider>
        <WalletProvider>
          <ProgressProvider>
            <Boundary>
              <Root />
            </Boundary>
          </ProgressProvider>
        </WalletProvider>
      </AuthProvider>
    </NavProvider>
  </MotionConfig>
)
