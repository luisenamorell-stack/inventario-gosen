/**
 * Web Audio API synthesizer for barcode scan beeps, errors, click tones, and cash register sound ("Ka-Ching!")
 */
let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function playSound(type: 'beep' | 'error' | 'click' | 'cash-register') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (type === 'cash-register') {
      // 1. "Ka-" (Mechanical drawer latch release + coin clink)
      const bufferSize = Math.floor(ctx.sampleRate * 0.055);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2200, now);
      filter.Q.setValueAtTime(3.0, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.28, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      whiteNoise.start(now);
      whiteNoise.stop(now + 0.055);

      // First metallic strike ("Ka")
      const kaOsc = ctx.createOscillator();
      const kaGain = ctx.createGain();
      kaOsc.type = 'triangle';
      kaOsc.frequency.setValueAtTime(1318.51, now + 0.01); // E6
      kaOsc.frequency.setValueAtTime(1567.98, now + 0.045); // G6
      kaGain.gain.setValueAtTime(0.18, now + 0.01);
      kaGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      kaOsc.connect(kaGain);
      kaGain.connect(ctx.destination);
      kaOsc.start(now + 0.01);
      kaOsc.stop(now + 0.09);

      // 2. "-Ching!" (Classic resonant cash register bell with metallic overtones)
      const bellStart = now + 0.085;
      const bellDuration = 0.75;
      // Bell fundamental + harmonic & inharmonic metallic partials
      const bellPartials = [
        { freq: 2093.0, amp: 0.25, decay: 0.7 },   // C7 fundamental bell
        { freq: 2637.02, amp: 0.16, decay: 0.55 }, // E7 major third chime
        { freq: 3135.96, amp: 0.14, decay: 0.5 },  // G7 fifth chime
        { freq: 4186.01, amp: 0.12, decay: 0.4 },  // C8 octave shimmer
        { freq: 5850.0, amp: 0.06, decay: 0.22 },  // Metallic ring transient
      ];

      bellPartials.forEach(({ freq, amp, decay }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, bellStart);

        gain.gain.setValueAtTime(0.0001, bellStart);
        gain.gain.linearRampToValueAtTime(amp, bellStart + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, bellStart + decay);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(bellStart);
        osc.stop(bellStart + bellDuration);
      });

      return;
    }

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    if (type === 'beep') {
      // Short high pitch tone for successful scan
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, now);
      gainNode.gain.setValueAtTime(0.06, now);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'error') {
      // Low descending tone for unknown code
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.3);
      gainNode.gain.setValueAtTime(0.1, now);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'click') {
      // Subtle click for variant switching
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, now);
      gainNode.gain.setValueAtTime(0.02, now);
      osc.start(now);
      osc.stop(now + 0.05);
    }
  } catch {
    // Ignore audio errors if user has not interacted with document yet
  }
}
