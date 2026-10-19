// Charges still on their way to the server. When signed in, a charge is shown at once and confirmed by the
// server a moment later; an AI or voice call that uses it waits here for that confirmation first.
const pending = new Map<string, Promise<unknown>>()

/** Remember a charge that is being confirmed. */
export function trackTicket(id: string, confirm: Promise<unknown>) {
  pending.set(id, confirm)
  confirm.catch(() => {}).finally(() => setTimeout(() => pending.get(id) === confirm && pending.delete(id), 120000))
}

/** Wait until the server has accepted this charge. Throws { code: "payment" } if it didn't. */
export async function readyTicket(id: string | null | undefined) {
  const p = id ? pending.get(id) : undefined
  if (!p) return
  try {
    await p
  } catch (e) {
    const why = (e as { message?: string })?.message
    throw { code: "payment", message: why || "The charge wasn't accepted" }
  }
}
