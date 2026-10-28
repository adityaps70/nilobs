import { useEffect, useRef, useState } from "react"
import { PhoneApp, type Screen } from "@/components/PhoneApp"
import { useWallet } from "@/credits"
import { useNav } from "@/nav"
import { pendingJoin } from "@/components/Crew"

const SCREENS: Screen[] = ["today", "stories", "setup", "loading", "brief", "practice", "drill", "bank", "share", "wallet", "train", "session", "spot", "radar", "kit", "me", "ask", "photo", "live", "daily", "pulse", "league", "crew", "cert", "closeout"]

/** Reads #app/<screen>, #app/stories/<id> or #app/crew/<invite code> so the browser's Back button moves between screens. */
function fromHash(): { screen?: Screen; storyId?: number | null } {
  try {
    const m = window.location.hash.match(/^#app(?:\/([a-z]+))?(?:\/([A-Za-z0-9]+))?/)
    if (!m) return {}
    const screen = m[1] && SCREENS.includes(m[1] as Screen) ? (m[1] as Screen) : undefined
    if (screen === "crew" && m[2]) {
      // an invite link: remember the code, and keep it out of the address bar
      pendingJoin.set(m[2])
      window.history.replaceState(null, "", "#app/crew")
    }
    return { screen: screen === "loading" ? "brief" : screen, storyId: m[2] && /^\d+$/.test(m[2]) ? Number(m[2]) : null }
  } catch {
    return {}
  }
}

export function AppView() {
  const { openSite, intent } = useNav()
  const wallet = useWallet()
  const initial = fromHash()
  const [screen, setScreen] = useState<Screen>(intent.screen ?? initial.screen ?? "today")
  const [storyId, setStoryId] = useState<number | null>(intent.storyId ?? initial.storyId ?? null)
  const [night, setNightState] = useState(() => {
    try {
      return localStorage.getItem("sr.night") === "1"
    } catch {
      return false
    }
  })
  const setNight = (v: boolean) => {
    setNightState(v)
    try {
      localStorage.setItem("sr.night", v ? "1" : "0")
    } catch {
      /* ignore */
    }
  }
  const popping = useRef(false)
  const [planIntent, setPlanIntent] = useState<{ select: string; cycle?: "monthly" | "annual"; n: number } | undefined>(undefined)
  const closeSheet = useRef(wallet.closePlans)
  closeSheet.current = wallet.closePlans

  // Night-watch also covers sheets and toasts that render outside the app frame
  useEffect(() => {
    document.body.classList.toggle("night-watch", night)
    return () => document.body.classList.remove("night-watch")
  }, [night])

  // Follow links from the site: a story, a screen, or a plan
  useEffect(() => {
    if (intent.screen) setScreen(intent.screen)
    if (intent.storyId != null) setStoryId(intent.storyId)
    // a plan or top-up picked on the site, e.g. "watch@annual"; it opens once onboarding is done
    const pack = intent.packId
    if (pack) {
      const [select, cyc] = pack.split("@")
      setPlanIntent({ select, cycle: cyc === "annual" ? "annual" : cyc === "monthly" ? "monthly" : undefined, n: intent.n })
    }
  }, [intent.n]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the address in step with the screen, so Back and reload work
  const first = useRef(true)
  const prev = useRef<Screen>(screen)
  useEffect(() => {
    const target = `#app/${screen}${screen === "stories" && storyId != null ? `/${storyId}` : ""}`
    // the brief's loading screen never gets its own history entry, so Back skips it
    const replace = first.current || popping.current || screen === "loading" || prev.current === "loading"
    first.current = false
    popping.current = false
    prev.current = screen
    if (window.location.hash === target) return
    if (replace) window.history.replaceState(null, "", target)
    else window.history.pushState(null, "", target)
  }, [screen, storyId])
  useEffect(() => {
    const onPop = () => {
      const h = fromHash()
      closeSheet.current() // Back closes the plans sheet too
      if (!window.location.hash.startsWith("#app")) return // the site takes over
      popping.current = true
      setScreen(h.screen ?? "today")
      setStoryId(h.storyId ?? null)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  return (
    <PhoneApp
      variant="web"
      screen={screen}
      go={setScreen}
      night={night}
      setNight={setNight}
      storyId={storyId ?? undefined}
      setStoryId={setStoryId}
      onExit={() => openSite()}
      officialSignal={intent.official ? intent.n : 0}
      deck={intent.deck}
      askSeed={intent.ask ? intent.ask : undefined}
      askSignal={intent.ask ? intent.n : 0}
      initialRank={intent.rank}
      planIntent={planIntent}
    />
  )
}
