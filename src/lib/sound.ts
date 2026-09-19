let ctx: AudioContext | null = null

/** Short, pleasant three-note chime (no audio assets needed, works offline). */
export function playChime() {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const c = ctx
    const notes = [659.25, 783.99, 1046.5]
    notes.forEach((f, i) => {
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.type = 'sine'
      osc.frequency.value = f
      const t0 = c.currentTime + i * 0.16
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5)
      osc.connect(gain).connect(c.destination)
      osc.start(t0)
      osc.stop(t0 + 0.55)
    })
  } catch {
    /* audio unavailable: silently skip */
  }
}
