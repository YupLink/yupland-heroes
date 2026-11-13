// Картинка генератора → иконка артефакта в стиле игры: фон снят (artMask),
// предмет уложен в сетку 128×128 (поле 108 + запас под обводку), палитра 32
// цвета без размытия, альфа только 0/255, снаружи тёмная обводка в 1 пиксель —
// как у нынешних артефактов. Сетка увеличивается ×2 «ближайшим» → 256×256 PNG
// с палитрой: ~3 КБ вместо ~20 КБ у 1024×1024 (владелец 28.10: «чтобы вообще
// очень маленькие изображения»). Больше не нужно: ресайзер /api/img картинки
// не увеличивает, а в игре иконка меньше 256.
// Не годится — причина ключом, задание пробует другой посев.
import { itemMask, maskProblem } from "./artMask";

export const GRID = 128;
const INNER = 108;
const SCALE = 2;
const OUTLINE = [20, 16, 22] as const;

export type PixelResult =
  | { ok: true; png: Buffer; cover: number; colors: number }
  | { ok: false; why: string };

async function sharpLib() {
  return (await import("sharp")).default;
}

/** Предмет без фона на холсте GRID×GRID (RGBA, альфа 0/255). */
async function onGrid(input: Buffer, holes: boolean): Promise<{ rgba: Buffer } | { why: string }> {
  const sharp = await sharpLib();
  const { data, info } = await sharp(input)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const m = itemMask(data, W, H, holes);
  const bad = maskProblem(m);
  if (bad || !m.box) return { why: bad ?? "empty" };
  const full = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    if (!m.mask[i]) continue;
    full[i * 4] = data[i * 3];
    full[i * 4 + 1] = data[i * 3 + 1];
    full[i * 4 + 2] = data[i * 3 + 2];
    full[i * 4 + 3] = 255;
  }
  const k = INNER / Math.max(m.box.w, m.box.h);
  const tw = Math.max(1, Math.round(m.box.w * k));
  const th = Math.max(1, Math.round(m.box.h * k));
  const small = await sharp(full, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: m.box.x, top: m.box.y, width: m.box.w, height: m.box.h })
    .resize(tw, th, { kernel: "lanczos3" })
    .raw()
    .toBuffer();
  for (let i = 0; i < tw * th; i++) small[i * 4 + 3] = small[i * 4 + 3] >= 128 ? 255 : 0;
  const pal = await sharp(small, { raw: { width: tw, height: th, channels: 4 } })
    .png({ palette: true, colours: 32, dither: 0 })
    .toBuffer();
  const q = await sharp(pal).ensureAlpha().raw().toBuffer();
  const rgba = Buffer.alloc(GRID * GRID * 4);
  const ox = (GRID - tw) >> 1;
  const oy = (GRID - th) >> 1;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const s = (y * tw + x) * 4;
      if (q[s + 3] < 128) continue;
      const d = ((y + oy) * GRID + x + ox) * 4;
      rgba[d] = q[s];
      rgba[d + 1] = q[s + 1];
      rgba[d + 2] = q[s + 2];
      rgba[d + 3] = 255;
    }
  }
  return { rgba };
}

/** Тёмная обводка: прозрачный пиксель рядом с предметом (4 стороны) — контур. */
export function outline(rgba: Buffer, size: number): Buffer {
  const out = Buffer.from(rgba);
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < size && y < size && rgba[(y * size + x) * 4 + 3] > 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = (y * size + x) * 4;
      if (rgba[d + 3]) continue;
      if (!solid(x - 1, y) && !solid(x + 1, y) && !solid(x, y - 1) && !solid(x, y + 1)) continue;
      out[d] = OUTLINE[0];
      out[d + 1] = OUTLINE[1];
      out[d + 2] = OUTLINE[2];
      out[d + 3] = 255;
    }
  }
  return out;
}

/** Доля закрашенного и число цветов предмета на сетке. */
export function gridStats(rgba: Buffer, size: number): { cover: number; colors: number } {
  let solid = 0;
  const colors = new Set<number>();
  for (let i = 0; i < size * size; i++) {
    if (!rgba[i * 4 + 3]) continue;
    solid++;
    colors.add((rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2]);
  }
  return { cover: solid / (size * size), colors: colors.size };
}

/** holes — у формы бывают дыры (кольцо, цепочка): запертый фон снимается. */
export async function pixelArt(input: Buffer, holes = false): Promise<PixelResult> {
  let grid: Awaited<ReturnType<typeof onGrid>>;
  try {
    grid = await onGrid(input, holes);
  } catch {
    return { ok: false, why: "decode" };
  }
  if ("why" in grid) return { ok: false, why: grid.why };
  const art = outline(grid.rgba, GRID);
  const { cover, colors } = gridStats(art, GRID);
  if (cover < 0.06) return { ok: false, why: "too_thin" };
  if (colors < 6) return { ok: false, why: "flat" };
  const sharp = await sharpLib();
  const png = await sharp(art, { raw: { width: GRID, height: GRID, channels: 4 } })
    .resize(GRID * SCALE, GRID * SCALE, { kernel: "nearest" })
    .png({ palette: true, colours: 64, dither: 0, compressionLevel: 9, effort: 10 })
    .toBuffer();
  return { ok: true, png, cover, colors };
}
