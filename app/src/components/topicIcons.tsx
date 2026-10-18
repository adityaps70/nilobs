import type { ComponentType, ReactNode, SVGProps } from "react"
import * as I from "@/components/icons"
import type { Topic } from "@/data"
import { cn } from "@/lib/utils"

type Ico = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
export type TileColor = "blue" | "sky" | "teal" | "green" | "violet" | "indigo" | "amber" | "orange" | "rose" | "slate"

export const TOPIC_ICON: Record<Topic, Ico> = {
  ECDIS: I.Monitor,
  Radar: I.Radar,
  UKC: I.Waves,
  "Passage planning": I.Compass,
  GMDSS: I.Antenna,
  "Alarm & power-fail tests": I.Bell,
  "Equipment tests vs PMS": I.Wrench,
  "Documents & SMS": I.FileText,
  "Rest hours & drills": I.Clock,
  "Defect reporting": I.Alert,
  Watchkeeping: I.Eye,
  Steering: I.Helm,
  "LSA & FFA": I.LifeBuoy,
  "Engine room": I.Cog,
  Cargo: I.Droplet,
  "PIQ accuracy": I.Camera,
  "Permits & RA": I.FileCheck,
  "Emergency equipment": I.Zap,
  "Gas testing & enclosed space": I.Wind,
  "PPE & personal safety": I.HardHat,
  "Mooring & access": I.Anchor,
  "Pollution prevention": I.Leaf,
  "Security & cyber": I.Lock,
  "Training & certificates": I.Trophy,
  "Hull & condition": I.Shield,
}
const TOPIC_COLOR: Record<Topic, TileColor> = {
  ECDIS: "violet",
  Radar: "indigo",
  UKC: "sky",
  "Passage planning": "blue",
  GMDSS: "amber",
  "Alarm & power-fail tests": "orange",
  "Equipment tests vs PMS": "slate",
  "Documents & SMS": "blue",
  "Rest hours & drills": "teal",
  "Defect reporting": "rose",
  Watchkeeping: "indigo",
  Steering: "sky",
  "LSA & FFA": "orange",
  "Engine room": "slate",
  Cargo: "amber",
  "PIQ accuracy": "violet",
  "Permits & RA": "teal",
  "Emergency equipment": "rose",
  "Gas testing & enclosed space": "green",
  "PPE & personal safety": "orange",
  "Mooring & access": "blue",
  "Pollution prevention": "green",
  "Security & cyber": "indigo",
  "Training & certificates": "violet",
  "Hull & condition": "slate",
}

export const CHAPTER_ICON: Record<string, Ico> = {
  "1": I.Ship,
  "2": I.FileText,
  "3": I.Users,
  "4": I.Compass,
  "5": I.LifeBuoy,
  "6": I.Leaf,
  "7": I.Lock,
  "8": I.Droplet,
  "9": I.Anchor,
  "10": I.Cog,
  "11": I.Shield,
  "12": I.Snow,
}
const CHAPTER_COLOR: Record<string, TileColor> = {
  "1": "slate", "2": "blue", "3": "violet", "4": "indigo", "5": "orange", "6": "green",
  "7": "slate", "8": "amber", "9": "sky", "10": "teal", "11": "rose", "12": "sky",
}

export const topicTint = (t: string) => `tile-${TOPIC_COLOR[t as Topic] ?? "blue"}`
export const chapterTint = (c: string) => `tile-${CHAPTER_COLOR[c] ?? "blue"}`

/** A glossy app-icon style tile. */
export function IconTile({ icon: Icon, color = "blue", size = 40, radius, className, children }: { icon?: Ico; color?: TileColor; size?: number; radius?: number; className?: string; children?: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn("gloss flex shrink-0 items-center justify-center", `tile-${color}`, className)}
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.3) }}
    >
      {Icon ? <Icon size={Math.round(size * 0.5)} strokeWidth={2} /> : children}
    </span>
  )
}

export function TopicBadge({ topic, size = 36 }: { topic: Topic; size?: number }) {
  return <IconTile icon={TOPIC_ICON[topic] ?? I.FileText} color={TOPIC_COLOR[topic] ?? "blue"} size={size} />
}

export function ChapterBadge({ ch, size = 36 }: { ch: string; size?: number }) {
  return <IconTile icon={CHAPTER_ICON[ch] ?? I.FileText} color={CHAPTER_COLOR[ch] ?? "blue"} size={size} />
}
