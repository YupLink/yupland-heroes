// Сидированный 2D-шум для генератора зон — без библиотек.
//
// Зачем свой: генератор крутится и на сервере (пишет карту), и в превью на
// клиенте, и обе стороны обязаны получить ОДНИ И ТЕ ЖЕ числа от одного сида —
// иначе превью покажет одни пятна, а на карту лягут другие. Math.random сида
// не знает, а тянуть simplex-noise ради шестидесяти строк — лишняя
// зависимость в бандле карты.
//
// Почему градиентный (Перлин), а не value-noise: клетки режутся по РАНГУ
// значения шума, и от шума нужна только гладкость — соседние гексы должны
// получать близкие значения, тогда слои ложатся связными пятнами, а не солью.
// Перлин это даёт без дополнительного сглаживания.

/**
 * mulberry32 — тот же кубик, что в тестах (src/test/seeded.ts), продублирован:
 * прод-код тестовые модули не импортирует. Качество распределения вторично,
 * повторяемость — единственное требование.
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Noise2D = (x: number, y: number) => number;

/** Восемь направлений градиента; диагонали нормированы, чтобы размах был одинаков во все стороны. */
const D = Math.SQRT1_2;
const GRAD: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [D, D],
  [-D, D],
  [D, -D],
  [-D, -D],
];

/** Квинтика Перлина: нулевая вторая производная на стыках ячеек — без «сетки» на карте. */
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Перлин-шум по перестановочной таблице от сида. Значение в [0, 1].
 * Размах градиентного 2D-шума с единичными градиентами — ±√2/2, поэтому
 * умножаем на √2 и на всякий случай зажимаем в отрезок.
 */
export function makeNoise(seed: number): Noise2D {
  const rnd = mulberry32(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  // Таблица удвоена, чтобы не брать `& 255` на каждом сложении индексов.
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h: number, x: number, y: number) => {
    const g = GRAD[h & 7];
    return g[0] * x + g[1] * y;
  };
  return (x, y) => {
    const X = Math.floor(x);
    const Y = Math.floor(y);
    const xf = x - X;
    const yf = y - Y;
    const xi = X & 255;
    const yi = Y & 255;
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];
    const n = lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v,
    );
    return Math.min(1, Math.max(0, 0.5 + n * Math.SQRT1_2));
  };
}

/**
 * Фрактальная сумма октав: крупные пятна с рваной кромкой вместо ровных
 * «блинов» одной октавы. Нормирована к [0, 1] по сумме амплитуд. Каждая
 * октава сдвинута, чтобы её узлы не садились на узлы предыдущей.
 */
export function fbm(noise: Noise2D, x: number, y: number, octaves = 3): number {
  let sum = 0;
  let norm = 0;
  let amp = 1;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * f + i * 31.7, y * f + i * 17.3) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

/**
 * Насколько далеко варп тащит точку при warp = 1: одна единица шума, то есть
 * ровно один «поперечник пятна» (recipe.scale). Дальше кромка перестаёт быть
 * кромкой и превращается в кашу.
 */
const WARP_REACH = 1;

/** Сдвиги, чтобы смещения по x и по y брались из разных мест одного шума. */
const WARP_OFF_X = 5.2;
const WARP_OFF_Y = 9.7;

/** Само смещение считаем грубо: две октавы — это плавный поток, а не рябь. */
const WARP_OCTAVES = 2;

/**
 * Домен-варп: прежде чем спросить шум, тащим точку в сторону — другим шумом.
 *
 * Чистый fbm рисует ровные «кляксы»: пятна круглые, берег гладкий, и на карте
 * сразу видно генератор. Сдвиг координат делает кромку извилистой — с языками
 * и заливами, — не меняя ни долей слоёв, ни связности пятен.
 *
 * warp = 0 возвращает РОВНО fbm(...): старая зона обязана перегенерироваться
 * клетка в клетку, иначе «перегенерировать» перестанет быть обратимым.
 */
export function warpedFbm(noise: Noise2D, x: number, y: number, warp: number, octaves = 3): number {
  // NaN и undefined сюда доезжают из рецепта админа — считаем их «без варпа».
  if (!(warp > 0)) return fbm(noise, x, y, octaves);
  const d = warp * WARP_REACH;
  // ×2−1: fbm живёт в [0, 1], а тащить надо в обе стороны.
  const dx = fbm(noise, x + WARP_OFF_X, y - WARP_OFF_Y, WARP_OCTAVES) * 2 - 1;
  const dy = fbm(noise, x - WARP_OFF_Y, y + WARP_OFF_X, WARP_OCTAVES) * 2 - 1;
  return fbm(noise, x + d * dx, y + d * dy, octaves);
}

/** Аксиальные координаты гекса → декарт (pointy-top, расстояние между соседями = 1). */
export function hexToXY(q: number, r: number): { x: number; y: number } {
  return { x: q + r / 2, y: (r * Math.sqrt(3)) / 2 };
}
