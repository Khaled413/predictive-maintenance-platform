/**
 * Industrial Audio Alert Synthesizer
 * Uses Web Audio API to produce crisp tones without external audio assets.
 */

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    void audioCtx.resume()
  }
  return audioCtx
}

/**
 * Plays a critical alarm chime (two-tone repeating siren)
 */
export function playCriticalAlarm() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(880, now) // A5
    osc.frequency.setValueAtTime(659.25, now + 0.15) // E5
    osc.frequency.setValueAtTime(880, now + 0.3)
    osc.frequency.setValueAtTime(659.25, now + 0.45)

    gain.gain.setValueAtTime(0.2, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.6)
  } catch {
    // Audio context may be blocked by browser policy until user interacts
  }
}

/**
 * Plays a warning notification beep
 */
export function playWarningBeep() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(587.33, now) // D5
    osc.frequency.setValueAtTime(783.99, now + 0.1) // G5

    gain.gain.setValueAtTime(0.15, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.25)
  } catch {
    // ignore
  }
}

/**
 * Plays a success/confirmation chime
 */
export function playSuccessChime() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(523.25, now) // C5
    osc.frequency.setValueAtTime(659.25, now + 0.1) // E5
    osc.frequency.setValueAtTime(783.99, now + 0.2) // G5
    osc.frequency.setValueAtTime(1046.5, now + 0.3) // C6

    gain.gain.setValueAtTime(0.15, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.5)
  } catch {
    // ignore
  }
}
