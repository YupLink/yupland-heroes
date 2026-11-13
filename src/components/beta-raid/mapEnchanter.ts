// Visual-only map animation. Enchantment actions and their results remain in the modal.
const PREFIX = "map-enchanter:";
const CELL = 192;
const COLS = 8;
const GAGS = ["boot", "flower", "snake", "butterflies", "spit"] as const;
export const ENCHANTER_KINDS = ["idle", "hand", ...GAGS] as const;
export const ENCHANTER_ASSET_VERSION = "v2";
const ROWS: Record<string, number> = { idle: 4, hand: 1, boot: 2, flower: 2, snake: 2, butterflies: 2, spit: 2 };
const PLAY_MS = [600, 220, 450, 220, 160, 250, 700, 180, 500, 400, 280, 500];
const POSITIVE_MS = [600, 220, 250, 450, 250, 250, 700, 180, 500, 650, 350, 500];
const BOOT_MS = [600, 220, 450, 100, 160, 250, 700, 140, 180, 900, 280, 500];
const BOOT_FRAMES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0];
const HAND_MS = [120, 100, 100, 100, 100, 100, 100, 280];
const starts = new WeakMap<HTMLImageElement, number>();
let nextDelay: number | null = null;

export function isMapEnchanterSource(url: string): boolean {
  try {
    return /^\/(?:uploads\/tasks|raid-shops\/buildings)\/vo2fltwiAU\.webp$/.test(new URL(url, "https://service.yupland.io").pathname);
  } catch { return false; }
}

export function enchanterImageKey(base: string, kind: string): string {
  return `${PREFIX}${base}:${kind}`;
}

export function beginEnchanterFrame(): void { nextDelay = null; }
export function enchanterFrameDelay(): number | null { return nextDelay; }

export function subscribeEnchanterPreferences(redraw: () => void): () => void {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", redraw);
  document.addEventListener("visibilitychange", redraw);
  return () => {
    media.removeEventListener("change", redraw);
    document.removeEventListener("visibilitychange", redraw);
  };
}

export function enchanterPose(elapsed: number, key: string): { kind: string; frame: number; delay: number; prefetch?: string } {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const period = 35000 + hash % 10001;
  const time = Math.max(0, elapsed);
  const t = time % period;
  const gag = GAGS[Math.floor(time / period) % GAGS.length];
  const durations = gag === "boot" ? BOOT_MS : gag === "flower" || gag === "butterflies" ? POSITIVE_MS : PLAY_MS;
  const eventStart = period - durations.reduce((a, b) => a + b, 0);
  const sequence = (kind: string, local: number, times: number[], frames?: number[]) => {
    for (let i = 0; i < times.length; i++) {
      if (local < times[i]) return { kind, frame: frames?.[i] ?? i, delay: times[i] - local };
      local -= times[i];
    }
    return { kind: "idle", frame: 0, delay: 100 };
  };
  if (t >= eventStart) return sequence(gag, t - eventStart, durations, gag === "boot" ? BOOT_FRAMES : undefined);
  for (const start of [10000, 21000]) {
    if (t >= start && t < start + 1000) return sequence("hand", t - start, HAND_MS);
  }
  return { kind: "idle", frame: Math.floor(t / 100) % 32, delay: 100 - t % 100,
    // Warm only the next rare sheet while the shaman is visible.
    ...(t >= eventStart - 2500 ? { prefetch: gag } : {}),
  };
}

/** Returns false for the ordinary static rendering path, including load/error fallback. */
export function drawMapEnchanter(
  scene: { g: CanvasRenderingContext2D; scale: number; view: { minX: number; maxX: number; minY: number; maxY: number }; images: Map<string, HTMLImageElement> },
  baseKey: string, cellKey: string, cx: number, bottom: number, w: number,
): boolean {
  const idleKey = enchanterImageKey(baseKey, "idle");
  if (!scene.images.has(idleKey) || w * scene.scale < 36 || document.hidden
    || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const unit = w / 317; // Approved 500px whole-pose canvas: body bounds 106..423, floor 477.
  const x = cx - 264.5 * unit;
  const y = bottom - 477 * unit;
  const size = 500 * unit;
  const v = scene.view;
  if (x + size < v.minX || x > v.maxX || y + size < v.minY || y > v.maxY) return false;
  const idle = scene.images.get(idleKey);
  if (!idle?.complete || idle.naturalWidth !== CELL * COLS || idle.naturalHeight !== CELL * 4) return false;
  const now = Date.now();
  let start = starts.get(idle);
  if (start === undefined) { start = now; starts.set(idle, start); }
  const elapsed = Math.max(0, now - start);
  const pose = enchanterPose(elapsed, cellKey);
  if (pose.prefetch) scene.images.get(enchanterImageKey(baseKey, pose.prefetch));
  const image = pose.kind === "idle" ? idle : scene.images.get(enchanterImageKey(baseKey, pose.kind));
  const ready = image?.complete && image.naturalWidth === CELL * COLS
    && image.naturalHeight === CELL * ROWS[pose.kind];
  // If a rare sheet is still arriving, retain the ambient appearance.
  const frame = ready ? pose.frame : Math.floor(elapsed / 100) % 32;
  scene.g.drawImage(ready ? image! : idle, frame % COLS * CELL, Math.floor(frame / COLS) * CELL, CELL, CELL, x, y, size, size);
  nextDelay = Math.min(nextDelay ?? Infinity, Math.max(16, Math.min(100, pose.delay)));
  return true;
}

