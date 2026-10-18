import type { SVGProps } from "react"

type P = SVGProps<SVGSVGElement> & { size?: number }
const base = (size = 18, p: P) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
})

export const Anchor = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="5" r="2.5" /><path d="M12 7.5V21" /><path d="M5 12H3a9 9 0 0 0 18 0h-2" /><path d="M8.5 11h7" /></svg>
)
export const Search = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="11" cy="11" r="7" /><path d="m20.5 20.5-4.3-4.3" /></svg>
)
export const Plus = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>
)
export const Mic = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M19 10.5v.5a7 7 0 0 1-14 0v-.5M12 18v3.5" /></svg>
)
export const Clipboard = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="8" y="2.5" width="8" height="4" rx="1" /><path d="M16 4.5h2a2 2 0 0 1 2 2V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2M9 12h6M9 16h4" /></svg>
)
export const ChevronLeft = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="m15 18-6-6 6-6" /></svg>
)
export const ArrowRight = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)
export const Check = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M20 6 9 17l-5-5" /></svg>
)
export const Alert = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M10.3 3.9 1.8 18.5A2 2 0 0 0 3.5 21.5h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4M12 17.5h.01" /></svg>
)
export const Shield = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M12 22s8-3.6 8-10V5l-8-3-8 3v7c0 6.4 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></svg>
)
export const Chat = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.2A8 8 0 1 1 21 12Z" /></svg>
)
export const Send = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" /></svg>
)
export const Ship = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M2 20c1.2.8 2.4 1 3.6 1 2.4 0 2.4-1.5 4.8-1.5S12.8 21 15.2 21s2.4-1.5 4.8-1.5c.8 0 1.4.2 2 .5" /><path d="M4 18 3 13h18l-2.5 5M12 13V3M12 3l5 6H7l5-6Z" /></svg>
)
export const Cpu = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></svg>
)
export const Users = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></svg>
)
export const Gauge = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M12 14 15.5 9.5" /><path d="M3.3 17a9.5 9.5 0 1 1 17.4 0" /><circle cx="12" cy="14" r="1.2" /></svg>
)
export const Layout = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>
)
export const Eye = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
)
export const Archive = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="2.5" y="3.5" width="19" height="5" rx="1" /><path d="M4.5 8.5V19a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8.5M10 12.5h4" /></svg>
)
export const Radar = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="9.5" /><circle cx="12" cy="12" r="5.5" /><path d="M12 12 19 5" /><circle cx="15.5" cy="9" r="1" /></svg>
)
export const Refresh = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5" /></svg>
)
export const Compass = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="9.5" /><path d="m15.8 8.2-2.1 5.5-5.5 2.1 2.1-5.5 5.5-2.1Z" /></svg>
)
export const Book = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M4 19.5V5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h13" /><path d="M9 7.5h6M9 11h4" /></svg>
)
export const Moon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" /></svg>
)
export const Flame = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M12 22c4 0 7-2.8 7-6.8 0-3.4-2.2-5.6-3.6-7.1-.5 1.8-1.5 3-2.9 3.4.4-3.4-.9-6.6-3.5-8.5.1 3-1.4 4.8-2.9 6.6C4.8 11.2 5 13.1 5 15.2 5 19.2 8 22 12 22Z" /></svg>
)
export const Bookmark = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M18 21.5 12 17l-6 4.5V4.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17Z" /></svg>
)
export const Download = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M12 3v12M7 10l5 5 5-5M4 20h16" /></svg>
)
export const Wifi = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M2 8.8a15 15 0 0 1 20 0M5 12.4a10 10 0 0 1 14 0M8.5 15.9a5 5 0 0 1 7 0" /><circle cx="12" cy="19.5" r="1" /></svg>
)
export const Coin = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><ellipse cx="12" cy="7" rx="7.5" ry="3.5" /><path d="M4.5 7v5c0 1.9 3.4 3.5 7.5 3.5s7.5-1.6 7.5-3.5V7" /><path d="M4.5 12v5c0 1.9 3.4 3.5 7.5 3.5s7.5-1.6 7.5-3.5v-5" /></svg>
)
export const Close = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M6 6l12 12M18 6 6 18" /></svg>
)
export const Lock = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="4.5" y="10.5" width="15" height="10.5" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>
)
export const Newspaper = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M4 4.5h13v15a1.5 1.5 0 0 0 1.5 1.5H5.5A1.5 1.5 0 0 1 4 19.5v-15Z" /><path d="M17 8.5h3v11a1.5 1.5 0 0 1-3 0M7.5 8h6M7.5 11.5h6M7.5 15h4" /></svg>
)
export const Wallet = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2H5" /><circle cx="16.5" cy="13.5" r="1.2" /></svg>
)
export const Home = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M3 11 12 3.5 21 11" /><path d="M5.5 9.5V20h13V9.5" /></svg>
)
export const Lightbulb = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z" /></svg>
)
export const Clock = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="9.5" /><path d="M12 7v5l3 2" /></svg>
)
export const Monitor = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="2.5" y="4" width="19" height="13" rx="2" /><path d="M8 21h8M12 17v4M6.5 13.5l3-4 3 2.5 4-5" /></svg>
)
export const Waves = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M2 7c2 0 2-1.5 4-1.5S8 7 10 7s2-1.5 4-1.5S16 7 18 7s2-1.5 4-1.5" /><path d="M2 12.5c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" /><path d="M12 15v6M9.5 18.5 12 21l2.5-2.5" /></svg>
)
export const Antenna = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M12 10v11M8 21h8" /><circle cx="12" cy="8" r="2" /><path d="M7.8 3.8a6 6 0 0 0 0 8.4M16.2 3.8a6 6 0 0 1 0 8.4M5 1.5a9.5 9.5 0 0 0 0 13M19 1.5a9.5 9.5 0 0 1 0 13" /></svg>
)
export const Bell = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
)
export const Wrench = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8Z" /></svg>
)
export const FileText = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8Z" /><path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h5" /></svg>
)
export const Helm = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="1.8" /><path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22M4.9 4.9l2.5 2.5M16.6 16.6l2.5 2.5M4.9 19.1l2.5-2.5M16.6 7.4l2.5-2.5" /></svg>
)
export const LifeBuoy = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="9.5" /><circle cx="12" cy="12" r="4" /><path d="m5.3 5.3 3.9 3.9M14.8 14.8l3.9 3.9M18.7 5.3l-3.9 3.9M9.2 14.8l-3.9 3.9" /></svg>
)
export const Cog = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></svg>
)
export const Droplet = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M12 2.5S5.5 9.5 5.5 14a6.5 6.5 0 0 0 13 0c0-4.5-6.5-11.5-6.5-11.5Z" /></svg>
)
export const Camera = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M4 7.5h3l1.5-2.5h7L17 7.5h3a1.5 1.5 0 0 1 1.5 1.5v9.5A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 4 7.5Z" /><circle cx="12" cy="13.5" r="3.5" /></svg>
)
export const FileCheck = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8Z" /><path d="M14 2.5V8h5.5M9 15l2 2 4-4" /></svg>
)
export const Zap = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2Z" /></svg>
)
export const Wind = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7" /></svg>
)
export const HardHat = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M2.5 18h19M4 18v-3a8 8 0 0 1 16 0v3" /><path d="M10 7.5V5h4v2.5M9 9.5v4M15 9.5v4" /></svg>
)
export const Leaf = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15Z" /><path d="M5 19 13 11" /></svg>
)
export const Snow = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5" /></svg>
)
export const Sparkle = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="M19 15.5l.8 2 2 .7-2 .8-.8 2-.7-2-2-.8 2-.7.7-2Z" /></svg>
)
export const Trophy = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v3.5M8.5 21h7M9.5 17.5h5V21h-5z" /></svg>
)
export const ListCheck = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17M10.5 6.5H21M10.5 12.5H21M10.5 18.5H21" /></svg>
)
export const Target = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></svg>
)
export const Layers = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /><path d="m3 17.5 9 5 9-5" opacity=".55" /></svg>
)
export const BarChart = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M4 20h16" /><rect x="5.5" y="11" width="3" height="6" rx="1" /><rect x="10.5" y="6" width="3" height="11" rx="1" /><rect x="15.5" y="13.5" width="3" height="3.5" rx="1" /></svg>
)
export const Gift = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="3.5" y="8.5" width="17" height="4" rx="1" /><path d="M5 12.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7.5M12 8.5V21" /><path d="M12 8.5C10.5 5 7 4.5 7 6.5S10 8.5 12 8.5ZM12 8.5c1.5-3.5 5-4 5-2s-3 2-5 2Z" /></svg>
)
export const Star = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8L12 3Z" /></svg>
)
export const Award = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="9" r="6" /><path d="m8.5 14 -1.5 7.5 5-2.5 5 2.5-1.5-7.5" /><path d="m12 6.5.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 8.6l2-.3.9-1.8Z" /></svg>
)
export const Calendar = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
)
export const Play = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" /></svg>
)
export const Filter = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M4 5h16l-6.5 8v5.5l-3 1.5V13L4 5Z" /></svg>
)
export const TrendUp = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>
)
export const Briefcase = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M3 12.5h18M10.5 12.5v2h3v-2" /></svg>
)
export const User = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
)
export const ChevronRight = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="m9 5 7 7-7 7" /></svg>
)
export const ChevronDown = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="m5 9 7 7 7-7" /></svg>
)
export const Info = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>
)
export const Route = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8.5 18H16a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h7.5" /></svg>
)
export const Brain = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3.5 3.5 0 0 0 7.5 18 2.5 2.5 0 0 0 12 19.5V6a2.5 2.5 0 0 0-3-1.5Z" /><path d="M15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2 3.5 3.5 0 0 1-3.5 5.3A2.5 2.5 0 0 1 12 19.5" /></svg>
)
export const Crown = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" /></svg>
)
