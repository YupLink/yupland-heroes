// Shared procedural pixel-water repeat. No network assets or per-cell timers.
export const WATER_INTERVAL = 125;
export const WATER_PHASES = 32;
export const WATER_PATTERN_W = 128;
export const WATER_PATTERN_H = 80;
export const WATER_MIN_SCALE = 0.55;
export const WATER_MAX_SIDE = 512;
export const WATER_MAX_AREA = 4_000_000;

export function waterPhase(now: number): number {
  return Math.floor(now / WATER_INTERVAL) % WATER_PHASES;
}

export function waterViewport(width: number, height: number, scale: number) {
  if (!Number.isFinite(width + height + scale) || width <= 0 || height <= 0
    || scale < WATER_MIN_SCALE || width * height > WATER_MAX_AREA) return null;
  // The same two-world-pixel grid as the approved preview. Hard backing limit.
  const ratio = Math.min(0.5, WATER_MAX_SIDE / width, WATER_MAX_SIDE / height);
  return { width: Math.max(1, Math.ceil(width * ratio)), height: Math.max(1, Math.ceil(height * ratio)) };
}

export function createWaterPhases(): HTMLCanvasElement[] {
  let seed = 682;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const waves = Array.from({ length: 48 }, () => ({
    x: Math.floor(rand() * WATER_PATTERN_W), y: Math.floor(rand() * WATER_PATTERN_H),
    phase: Math.floor(rand() * WATER_PHASES), size: 2 + Math.floor(rand() * 4),
  }));
  return Array.from({ length: WATER_PHASES }, (_, frame) => {
    const cv = document.createElement('canvas');
    cv.width = WATER_PATTERN_W; cv.height = WATER_PATTERN_H;
    const g = cv.getContext('2d');
    if (!g) return cv;
    for (const a of waves) {
      const phase = (frame + a.phase) % WATER_PHASES;
      if (phase >= 20) continue;
      const strength = Math.min(phase / 5, (20 - phase) / 6, 1);
      const x = a.x + Math.floor(phase / 5), y = a.y;
      for (const ox of [-WATER_PATTERN_W, 0, WATER_PATTERN_W]) {
        for (const oy of [-WATER_PATTERN_H, 0, WATER_PATTERN_H]) {
          if (x + ox + a.size + 1 < 0 || x + ox >= WATER_PATTERN_W
            || y + oy + 3 < 0 || y + oy - 1 >= WATER_PATTERN_H) continue;
          g.fillStyle = `rgba(195,239,239,${.42 * strength})`;
          g.fillRect(x + ox, y + oy, a.size, 1);
          g.fillRect(x + ox + a.size, y + oy - 1, 1, 1);
          g.fillStyle = `rgba(23,100,151,${.25 * strength})`;
          g.fillRect(x + ox + 1, y + oy + 2, a.size - 1, 1);
        }
      }
    }
    return cv;
  });
}
