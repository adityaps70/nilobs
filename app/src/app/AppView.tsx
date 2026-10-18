import { useEffect, useState } from "react"
import { PhoneApp, type Screen } from "@/components/PhoneApp"
import { useWallet } from "@/credits"
import { useNav } from "@/nav"

export function AppView() {
  const { openSite, intent } = useNav()
  const wallet = useWallet()
  const [screen, setScreen] = useState<Screen>(intent.screen ?? "today")
  const [night, setNight] = useState(false)
  const [storyId, setStoryId] = useState<number | null>(intent.storyId ?? null)

  // Follow links from the site: a story, a screen, or a credit pack
  useEffect(() => {
    if (intent.screen) setScreen(intent.screen)
    if (intent.storyId != null) setStoryId(intent.storyId)
    if (intent.packId) {
      const t = setTimeout(() => wallet.openTopUp(undefined, intent.packId), 350)
      return () => clearTimeout(t)
    }
  }, [intent.n]) // eslint-disable-line react-hooks/exhaustive-deps

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
    />
  )
}
