// Picking who you are: any crew rank, the company's shore staff, or a role typed in ("Other").
import { useState } from "react"
import { cn } from "@/lib/utils"
import { Chip } from "@/components/ui"
import { ROLES, ROLE_GROUPS, roleOf, type RoleGroup } from "@/roles"

const SIDES: { id: "ship" | "shore" | "other"; name: string; groups: RoleGroup[] }[] = [
  { id: "ship", name: "On board", groups: ["deck", "engine", "cadet", "rating", "catering"] },
  { id: "shore", name: "Ashore", groups: ["shore"] },
  { id: "other", name: "Other", groups: ["other"] },
]
const sideOf = (rank: string | null) => (rank ? (roleOf(rank).group === "shore" ? "shore" : rank === "Other" ? "other" : "ship") : "ship")

const inputCls = "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink outline-none focus:border-primary"

/** The full picker, for onboarding: on board / ashore / other, then the roles in groups. */
export function RolePicker({ value, roleName, onChange }: { value: string | null; roleName: string; onChange: (rank: string, roleName: string) => void }) {
  const [side, setSide] = useState<"ship" | "shore" | "other">(() => sideOf(value))
  const pick = (s: "ship" | "shore" | "other") => {
    setSide(s)
    if (s === "other") onChange("Other", roleName)
  }
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Where you work" className="grid grid-cols-3 rounded-full bg-surface-2 p-0.5 text-[13px] font-semibold">
        {SIDES.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={side === s.id} onClick={() => pick(s.id)} className={cn("h-9 rounded-full", side === s.id ? "bg-surface text-ink shadow-sm" : "text-mute")}>
            {s.name}
          </button>
        ))}
      </div>
      {side === "other" ? (
        <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-mute">
          Your role
          <input
            value={roleName}
            maxLength={40}
            autoFocus
            onChange={(e) => onChange("Other", e.target.value)}
            placeholder="e.g. Cargo surveyor, terminal representative"
            className={inputCls}
          />
          <span className="font-normal">The AI tailors questions, cards and plans to whatever you write.</span>
        </label>
      ) : (
        SIDES.find((s) => s.id === side)!.groups.map((g) => (
          <div key={g} className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-mute">{ROLE_GROUPS.find((x) => x.id === g)!.name}</span>
            <div className="flex flex-wrap gap-1.5">
              {ROLES.filter((r) => r.group === g).map((r) => (
                <Chip key={r.id} size="sm" on={value === r.id} onClick={() => onChange(r.id, roleName)}>
                  {r.name}
                </Chip>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

/** A compact dropdown, for settings and the brief, with the typed-in role when "Other" is chosen. */
export function RoleSelect({ id, value, roleName, onChange, className }: { id?: string; value: string; roleName?: string; onChange: (rank: string, roleName: string) => void; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value, roleName || "")} className="h-11 rounded-xl border border-line bg-surface px-2.5 text-[14px] text-ink">
        {ROLE_GROUPS.map((g) => (
          <optgroup key={g.id} label={g.name}>
            {ROLES.filter((r) => r.group === g.id).map((r) => (
              <option key={r.id} value={r.id}>{r.id === "Other" ? "Other (type your role)" : r.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {value === "Other" && roleName !== undefined && (
        <input aria-label="Your role" value={roleName} maxLength={40} onChange={(e) => onChange("Other", e.target.value)} placeholder="Type your role" className={inputCls} />
      )}
    </div>
  )
}
