import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

export type AppScreen =
  | "today" | "stories" | "setup" | "loading" | "brief" | "practice" | "drill" | "bank" | "share" | "wallet"
  | "train" | "session" | "spot" | "radar" | "kit" | "me" | "ask" | "photo" | "live" | "daily" | "pulse" | "league"

interface Intent {
  official?: boolean
  screen?: AppScreen
  storyId?: number
  packId?: string
  deck?: import("@/fleet").DeckId
  ask?: string
  /** Rank picked on the site, used to pre-fill onboarding. */
  rank?: string
}
interface Nav {
  view: "site" | "app"
  intent: Intent & { n: number }
  openApp: (i?: Intent) => void
  openSite: (anchor?: string) => void
}

const Ctx = createContext<Nav | null>(null)

const readHash = () => {
  try {
    return window.location.hash === "#app" || window.location.hash.startsWith("#app/") ? "app" : "site"
  } catch {
    return "site"
  }
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<"site" | "app">(readHash)
  const [intent, setIntent] = useState<Intent & { n: number }>({ n: 0 })

  useEffect(() => {
    const on = () => setView(readHash())
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [])

  const openApp = useCallback((i: Intent = {}) => {
    setIntent((p) => ({ ...i, n: p.n + 1 }))
    setView("app")
    try {
      const target = i.screen ? `#app/${i.screen}` : "#app"
      if (!window.location.hash.startsWith("#app")) window.location.hash = target.slice(1)
      else if (window.location.hash !== target) window.history.replaceState(null, "", target)
    } catch {
      /* ignore */
    }
    window.scrollTo({ top: 0 })
  }, [])

  const openSite = useCallback((anchor?: string) => {
    setView("site")
    try {
      window.location.hash = anchor || "top"
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => {
      const el = anchor ? document.getElementById(anchor) : null
      if (el) el.scrollIntoView()
      else window.scrollTo({ top: 0 })
    })
  }, [])

  return <Ctx.Provider value={{ view, intent, openApp, openSite }}>{children}</Ctx.Provider>
}

export function useNav() {
  const n = useContext(Ctx)
  if (!n) throw new Error("useNav outside NavProvider")
  return n
}
