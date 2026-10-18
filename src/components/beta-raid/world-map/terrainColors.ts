// Цвет местности на карте мира: средний цвет её плитки, а пока плитка не
// загрузилась (или не читается) — цвет по имени.
//
// Плитки на боевой карте — картинки админа, своего цвета у типа местности нет.
// Средний цвет плитки и есть «цвет местности», который игрок видит на карте
// рейда издалека.
import type { WorldMapTerrain } from "@/lib/raid/worldMapCodec";

export type Rgb = [number, number, number];

/**
 * Запасные цвета по словам в имени. Порядок важен: «Адские земли» — лава, а не
 * земля; «Подземелье» — пещера. Неизвестное имя получает приглушённый цвет
 * от хэша — разные типы не сливаются в один.
 */
const BY_NAME: Array<[RegExp, Rgb]> = [
  [/океан|ocean|море|sea/i, [28, 66, 112]],
  [/вод|water|рек|river|озер|lake/i, [48, 104, 156]],
  [/снег|snow|мерзлот|лёд|лед|ice|frost|зимн|winter/i, [206, 218, 230]],
  [/пустын|песок|песч|desert|sand/i, [204, 172, 112]],
  [/лав|lava|адск|hell|огн|fire/i, [150, 52, 32]],
  [/болот|swamp|marsh/i, [72, 88, 56]],
  [/подзем|пещер|cave|underground|dungeon/i, [72, 62, 58]],
  [/гор|mountain|скал|rock|камен|stone|highland/i, [116, 112, 104]],
  [/трав|grass|луг|meadow|поле|field|грядк|ферм|farm/i, [74, 122, 62]],
  [/земл|dirt|earth|почв|soil/i, [118, 92, 66]],
  [/небес|sky|облак|cloud/i, [150, 188, 226]],
];

function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Цвет местности по имени — пока плитка не загрузилась или не читается. */
export function fallbackTerrainColor(name: string): Rgb {
  for (const [re, rgb] of BY_NAME) if (re.test(name)) return rgb;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return hslToRgb(Math.abs(h) % 360, 0.28, 0.42);
}

/** Средний цвет по пикселям RGBA; прозрачное не в счёт. null — считать не из чего. */
export function averageColor(px: ArrayLike<number>): Rgb | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (let i = 0; i + 3 < px.length; i += 4) {
    const a = px[i + 3];
    if (a < 16) continue;
    r += px[i] * a;
    g += px[i + 1] * a;
    b += px[i + 2] * a;
    w += a;
  }
  if (!w) return null;
  return [Math.round(r / w), Math.round(g / w), Math.round(b / w)];
}

/** Палитра для paintTerrain: три байта на значение местности; нулевое (пусто) не красится. */
export function buildPalette(
  terrains: readonly WorldMapTerrain[],
  colorOf: (t: WorldMapTerrain) => Rgb,
): Uint8Array {
  const out = new Uint8Array((terrains.length + 1) * 3);
  terrains.forEach((t, i) => out.set(colorOf(t), (i + 1) * 3));
  return out;
}

/** Цвет значения местности из палитры — для образца в легенде. */
export function paletteCss(palette: Uint8Array, value: number): string {
  const o = value * 3;
  return `rgb(${palette[o] ?? 0},${palette[o + 1] ?? 0},${palette[o + 2] ?? 0})`;
}
