/**
 * Web Audio API synthesizer for barcode scan beeps, errors, and click tones
 */
export function playSound(type: 'beep' | 'error' | 'click') {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    if (type === 'beep') {
      // Short high pitch tone for successful scan
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.06, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'error') {
      // Low descending tone for unknown code
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'click') {
      // Subtle click for variant switching
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.02, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    }
  } catch {
    // Ignore audio errors if user has not interacted with document yet
  }
}
