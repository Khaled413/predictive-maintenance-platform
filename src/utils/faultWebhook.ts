import type { Machine } from '../types'

// Optional n8n integration: when VITE_N8N_WEBHOOK_URL is set, a machine that
// enters a fault state is reported to the webhook (once per fault episode).
const WEBHOOK_URL = (import.meta.env.VITE_N8N_WEBHOOK_URL as string | undefined)?.trim()
const NOTIFY_WARNINGS = import.meta.env.VITE_N8N_NOTIFY_WARNINGS === 'true'
const NOTIFIED_KEY = 'iap-n8n-notified-v1'

export const faultWebhookEnabled = Boolean(WEBHOOK_URL)

function loadNotified(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function saveNotified(map: Record<string, string>) {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(map))
  } catch {
    // storage unavailable — worst case a notification repeats after reload
  }
}

// "Zone A — Machining Hall 1" -> "Zone A"; this is the key the n8n engineer table uses.
function departmentOf(machine: Machine): string {
  return machine.location.split('—')[0].trim() || 'default'
}

export function notifyFaultTransitions(machines: Machine[]) {
  if (!WEBHOOK_URL) return
  const notified = loadNotified()
  let changed = false

  for (const machine of machines) {
    const status = machine.status
    const isFault = status === 'Critical' || (NOTIFY_WARNINGS && status === 'Warning')

    if (!isFault) {
      // Machine recovered (or has no prediction yet): re-arm so the next fault notifies again.
      if (status && notified[machine.id]) {
        delete notified[machine.id]
        changed = true
      }
      continue
    }
    if (notified[machine.id] === status) continue

    notified[machine.id] = status as string
    changed = true
    void fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        machine_name: machine.name,
        machine_id: machine.id,
        department: departmentOf(machine),
        status: 'fault',
        fault: machine.prediction
          ? `${status}: ${machine.prediction.failure_type ?? 'unclassified'} (failure probability ${(machine.prediction.failure_probability * 100).toFixed(1)}%, health ${machine.prediction.health_score})`
          : String(status),
      }),
    }).catch((error) => console.error('n8n fault webhook failed', error))
  }

  if (changed) saveNotified(notified)
}
