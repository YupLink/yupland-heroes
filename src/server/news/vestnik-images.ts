// Картинки для «Вестника героев» — только наши, с сайта игры: сцены погоды,
// здания и предметы (/uploads), кадры героев (/hero-actions …). sharp приводит
// любую (webp тоже) к PNG/JPEG нужного размера: satori понимает только их.
//
// «путь@N» — N-й кадр 128×128 из полосы спрайта; пиксель-арт растягиваем без
// сглаживания. Не скачалось — null: страница выйдет без картинки, не упадёт.
import { WEBAPP_URL } from "@/server/tg";

export type Pic = { src: string; width: number; height: number };
/** auto — широкий пейзаж (≥ 1,4 : 1) заполняет рамку, остальное вписывается. */
export type Fit = "cover" | "contain" | "auto";

const WIDE = 1.4;

const FRAME = 128;
const CACHE_MAX = 120;
const cache = new Map<string, Promise<Pic | null>>();

/** «/путь.png@2» → путь и кадр; без «@» — кадра нет. */
export function parsePicPath(p: string): { path: string; frame: number | null } {
  const m = /^(.*)@(\d+)$/.exec(p);
  return m ? { path: m[1], frame: Number(m[2]) } : { path: p, frame: null };
}

const urlOf = (path: string): string => (/^https?:\/\//.test(path) ? path : `${WEBAPP_URL}${path}`);

async function download(path: string): Promise<Buffer> {
  const res = await fetch(urlOf(path), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return Buffer.from(await res.arrayBuffer());
}

async function sharpLib() {
  return (await import("sharp")).default;
}

/** Исходник: картинка целиком или её кадр (PNG). */
async function source(p: string): Promise<{ buf: Buffer; pixel: boolean }> {
  const { path, frame } = parsePicPath(p);
  const buf = await download(path);
  if (frame === null) return { buf, pixel: false };
  const sharp = await sharpLib();
  const cut = await sharp(buf)
    .extract({ left: frame * FRAME, top: 0, width: FRAME, height: FRAME })
    .png()
    .toBuffer();
  return { buf: cut, pixel: true };
}

async function make(p: string, w: number, h: number, want: Fit): Promise<Pic | null> {
  const sharp = await sharpLib();
  const { buf, pixel } = await source(p);
  const kernel = pixel ? "nearest" : "lanczos3";
  let fit = want;
  if (fit === "auto") {
    const meta = await sharp(buf).metadata();
    const aspect = meta.width && meta.height ? meta.width / meta.height : 1;
    fit = !pixel && aspect >= WIDE ? "cover" : "contain";
  }
  if (fit === "cover") {
    const out = await sharp(buf)
      .resize(w, h, { fit: "cover", kernel })
      .flatten({ background: "#f1ece1" })
      .jpeg({ quality: 86 })
      .toBuffer();
    return { src: `data:image/jpeg;base64,${out.toString("base64")}`, width: w, height: h };
  }
  const { data, info } = await sharp(buf)
    .resize(w, h, { fit: "inside", kernel })
    .png()
    .toBuffer({ resolveWithObject: true });
  return {
    src: `data:image/png;base64,${data.toString("base64")}`,
    width: info.width,
    height: info.height,
  };
}

/**
 * Картинка в рамку w×h: cover — заполнить и обрезать (пейзаж), contain —
 * вписать с прозрачностью (здание, герой). Кэш на процесс — газета рисует
 * одни и те же картинки весь день.
 */
export function pic(p: string, w: number, h: number, fit: Fit): Promise<Pic | null> {
  const key = `${p}|${w}x${h}|${fit}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size >= CACHE_MAX) cache.clear();
  const job = make(p, w, h, fit).catch((e: unknown) => {
    cache.delete(key);
    console.warn("[vestnik] картинка не взялась:", p, e instanceof Error ? e.message : e);
    return null;
  });
  cache.set(key, job);
  return job;
}
