/**
 * Plays /sounds/notification.mp3 from `public/` when present; otherwise a short fallback tone.
 */
export function playNotificationSound() {
  const audio = new Audio("/sounds/notification.mp3");
  audio.volume = 0.35;
  audio.play().catch(() => {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 784;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.06, ctx.currentTime);
      o.start();
      o.stop(ctx.currentTime + 0.12);
    } catch {
      /* ignore */
    }
  });
}
