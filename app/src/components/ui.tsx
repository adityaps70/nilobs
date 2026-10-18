import type { ReactNode } from "react"
import * as I from "@/components/icons"
import { cn } from "@/lib/utils"

export function Chip({ on, children, onClick, size = "md" }: { on: boolean; children: ReactNode; onClick: () => void; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border font-medium whitespace-nowrap transition-colors",
        size === "md" ? "h-10 px-3.5 text-[13px]" : "h-9 px-3 text-[12.5px]",
        on ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-ink hover:border-mute"
      )}
    >
      {children}
    </button>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="text-[13px] font-semibold text-mute">{children}</span>
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-bold">{title}</h3>
        {aside && <span className="font-mono text-[11px] text-mute">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

export function TopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="grid h-12 shrink-0 grid-cols-[88px_1fr_88px] items-center px-3">
      {onBack ? (
        <button type="button" aria-label="Back" onClick={onBack} className="flex size-11 items-center justify-center rounded-xl hover:bg-surface-2">
          <I.ChevronLeft size={22} />
        </button>
      ) : (
        <span />
      )}
      <span className="text-center text-[16px] font-bold">{title}</span>
      <span className="flex items-center justify-end">{right}</span>
    </header>
  )
}

export const Scroll = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("no-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6 [&>*]:shrink-0", className)}>{children}</div>
)

