let ctx: AudioContext | null = null;

/** Call inside a user gesture (pointerdown/keydown) so iOS/Chrome allow later playback. */
export function unlockChime(): void {
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch { /* audio unsupported — silent */ }
}

/** Soft three-note chime, synthesized — no assets. Safe to call anytime; no-ops if not unlocked. */
export function playChime(): void {
  const ac = ctx;
  if (!ac || ac.state !== "running") return;
  const t0 = ac.currentTime;
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = t0 + i * 0.12;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(start);
    osc.stop(start + 1.0);
  });
}
