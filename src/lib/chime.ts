// Soft end-of-phase chimes for the Pomodoro timer, synthesized with the Web Audio API (no
// sound files to ship). Quiet and in the middle register on purpose: meant to be noticed over
// a video, not to startle. Three cues so you know what happened without looking.
let ctx: AudioContext | null = null;

const C4 = 261.63;
const E4 = 329.63;
const G4 = 392.0;

// [frequency, start offset s, length s]
const CUES = {
  rest: [[G4, 0, 1.4], [E4, 0.42, 1.8]],                                              // two notes down: wind down
  work: [[C4, 0, 1.2], [E4, 0.3, 1.2], [G4, 0.6, 1.6]],                                // three up: back to it
  done: [[C4, 0, 1.2], [E4, 0.3, 1.2], [G4, 0.6, 1.2], [C4, 1.15, 2.6], [E4, 1.15, 2.6], [G4, 1.15, 2.6]], // …then held as a chord
} as const;
export type Cue = keyof typeof CUES;

export function chime(kind: Cue, volume = 0.11) {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime + 0.05;
    for (const [freq, at, len] of CUES[kind]) {
      // A sine with a quieter octave on top reads as a small bell rather than a beep.
      for (const [mult, gain] of [[1, volume], [2, volume * 0.2]] as const) {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * mult;
        const t = t0 + at;
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(gain, t + 0.03);
        env.gain.exponentialRampToValueAtTime(0.0001, t + len);
        osc.connect(env).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + len + 0.1);
      }
    }
  } catch { /* no audio device, or jsdom */ }
}
