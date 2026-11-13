import { BONUS } from "@/lib/slot/symbols";
import type { Grid } from "@/lib/slot/types";

export type BonusLevel = 1 | 2 | 3;
type Landing = { spinId: number; reel: number; levels: BonusLevel[] };
const listeners = new Set<(event: Landing) => void>();

// Count only this reel and reels already stopped to its left.
export function bonusLevels(grid: Grid, reel: number): BonusLevel[] {
  const before = grid.slice(0, reel).flat().filter(id => id === BONUS).length;
  const count = grid[reel]?.filter(id => id === BONUS).length ?? 0;
  return Array.from({ length: count }, (_, i) => before + i + 1)
    .filter((level): level is BonusLevel => level <= 3);
}

export function notifyBonusLanding(spinId: number, grid: Grid, reel: number) {
  const levels = bonusLevels(grid, reel);
  if (levels.length) listeners.forEach(listener => listener({ spinId, reel, levels }));
}

export function subscribeBonusLandings(listener: (event: Landing) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const BONUS_ACCENT_DURATIONS = [0.50, 0.56, 0.70] as const;

// The main theme's softened 3/8 pulse instrument, with a held musical envelope.
// Owner-selected F6 -> A6 -> C7: three distinct ascending steps, a major triad with the main theme instrument.
// Wavetables keep synthesis inexpensive; buffers are reused by the player.
export function bonusAccentSamples(sampleRate: number, level: BonusLevel) {
  const duration = BONUS_ACCENT_DURATIONS[level - 1];
  const samples = new Float32Array(Math.ceil(sampleRate * duration));
  const voices = [
    [[89, 0.80], [77, 0.16]],
    [[93, 0.80], [81, 0.16]],
    [[96, 0.80], [84, 0.16]],
  ][level - 1];
  const size = 1024, duty = 0.375;
  for (const [midi, gain] of voices) {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const table = new Float32Array(size);
    const harmonics = Math.min(36, Math.floor(Math.min(7200, sampleRate * 0.42) / frequency));
    for (let h = 1; h <= harmonics; h++) {
      const weight = 2 * Math.sin(Math.PI * h * duty) / (Math.PI * h)
        * Math.exp(-((h * frequency / 5400) ** 1.7));
      for (let n = 0; n < size; n++) {
        table[n] += weight * Math.cos(2 * Math.PI * h * n / size - Math.PI * h * duty);
      }
    }
    let phase = 0;
    for (let i = 0; i < samples.length; i++) {
      const t = i / sampleRate;
      const vibrato = 1 + 0.0015 * Math.sin(2 * Math.PI * 5.2 * t) * Math.min(1, t / 0.2);
      phase = (phase + frequency * vibrato / sampleRate) % 1;
      const index = phase * size, low = Math.floor(index), fraction = index - low;
      const wave = table[low] * (1 - fraction) + table[(low + 1) % size] * fraction;
      const attack = Math.min(1, t / 0.012);
      const held = 0.68 + 0.32 * Math.exp(-t / 0.14);
      const release = Math.min(1, (samples.length - 1 - i) / (sampleRate * 0.14));
      samples[i] += wave * gain * attack * held * release;
    }
  }
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak) for (let i = 0; i < samples.length; i++) samples[i] *= 0.46 / peak;
  return samples;
}
