import { createRoot } from "react-dom/client"
import { MotionConfig } from "motion/react"

import { AppView } from "@/app/AppView"
import { WalletProvider } from "@/credits"
import { ProgressProvider } from "@/progress"
import { NavProvider, useNav } from "@/nav"
import { Features, HowItWorks, QuestionMarquee } from "@/sections/top"
import { Insights } from "@/sections/insights"
import { Fleet, Footer } from "@/sections/bottom"
import { ConfidenceCheck, FinalCta, LandingHero, Lessons, Pricing, SiteNav, StoriesSection, useStorySelection } from "@/sections/landing"
import { AiSection, HabitSection, RadarSection, SpotSection } from "@/sections/fleetSections"

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
      {view === "app" ? <AppView /> : <Site />}
    </>
  )
}

createRoot(document.getElementById("root")!).render(
  <MotionConfig reducedMotion="user">
    <NavProvider>
      <WalletProvider>
        <ProgressProvider>
          <Root />
        </ProgressProvider>
      </WalletProvider>
    </NavProvider>
  </MotionConfig>
)
