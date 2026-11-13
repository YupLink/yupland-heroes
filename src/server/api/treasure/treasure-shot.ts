// Скрин клада (владелец 07.11.2026: «основное требование — скрин … клетка с
// кладом может быть не по центру, но попадать в кадр»). Сервер рисует кусок
// карты сам, как его рисует клиент (components/beta-raid): гекс «остриём вверх»,
// местность — картинка шаблона, растянутая на гекс и обрезанная по нему
// (hexTileCache), декор — шириной 1,5R, стоит на нижнем крае (drawDecoration),
// постройка — 1,7R (drawBuilding). Объекты, игроки и мешочки не рисуются: кадр —
// подсказка «где», а не снимок момента. Клетка клада ничем не отмечена.
import { WEBAPP_URL } from "@/server/tg";
import type { ShotCell } from "./treasure-shot-data";

// Гекс крупный: в кадр входит ~4×4 клетки (владелец 07.11: «поменьше клеток — не 25, а примерно 16»).
export const SHOT_R = 138;
export const SHOT_W = 960;
export const SHOT_H = 800;
/** Гекс-радиус выборки клеток вокруг центра кадра — с запасом на края. */
export const SHOT_RADIUS = 6;

const SQ3 = Math.sqrt(3);
const R = SHOT_R;
const M = 5 * R;

export const hexPx = (q: number, r: number) => ({ x: R * SQ3 * (q + r / 2), y: R * 1.5 * r });

/** Центр кадра: клетка клада, сдвинутая на случайные ±1,2 гекса вбок и ±1 ряд — всегда целиком в кадре. */
export function frameCenter(q: number, r: number, rnd: () => number): { x: number; y: number } {
  const p = hexPx(q, r);
  return {
    x: p.x + (rnd() * 2 - 1) * R * SQ3 * 1.2,
    y: p.y + (rnd() * 2 - 1) * R * 1.5,
  };
}

/** Клетка в центре кадра (для выборки клеток). */
export function centerCell(c: { x: number; y: number }): { q: number; r: number } {
  const r = Math.round(((2 / 3) * c.y) / R);
  const q = Math.round(((SQ3 / 3) * c.x - c.y / 3) / R);
  return { q, r };
}

export type Loader = (url: string) => Promise<Buffer | null>;

export const fetchImage: Loader = async (url) => {
  const full = /^https?:\/\//.test(url)
    ? url
    : `${WEBAPP_URL}${url.startsWith("/") ? "" : "/"}${url}`;
  try {
    const res = await fetch(full, { signal: AbortSignal.timeout(15_000) });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
};

type Sharp = typeof import("sharp");
type Piece = { input: Buffer; left: number; top: number; w: number; h: number };

function hexMask(w: number, h: number): Buffer {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(w / 2 + (R + 1) * Math.cos(a)).toFixed(2)},${(h / 2 + (R + 1) * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><polygon points="${pts}" fill="#fff"/></svg>`,
  );
}

/** Нарисовать кадр: JPEG SHOT_W×SHOT_H. Картинка не скачалась — клетка без неё. */
export async function renderTreasureShot(
  cells: readonly ShotCell[],
  center: { x: number; y: number },
  load: Loader = fetchImage,
): Promise<Buffer> {
  const sharp: Sharp = (await import("sharp")).default;
  const raw = new Map<string, Promise<{ buf: Buffer; w: number; h: number } | null>>();
  const source = (url: string) => {
    if (!raw.has(url)) {
      raw.set(
        url,
        load(url).then(async (buf) => {
          if (!buf) return null;
          const m = await sharp(buf)
            .metadata()
            .catch(() => null);
          return m?.width && m.height ? { buf, w: m.width, h: m.height } : null;
        }),
      );
    }
    return raw.get(url)!;
  };
  const resized = async (url: string, w: number, h: number, mask: boolean) => {
    const s = await source(url);
    if (!s) return null;
    const kernel = s.w < w ? "nearest" : "lanczos3";
    let img = sharp(s.buf).resize(w, h, { fit: "fill", kernel }).ensureAlpha();
    if (mask)
      img = sharp(await img.png().toBuffer()).composite([
        { input: hexMask(w, h), blend: "dest-in" },
      ]);
    return img
      .png()
      .toBuffer()
      .catch(() => null);
  };

  const CW = SHOT_W + 2 * M;
  const CH = SHOT_H + 2 * M;
  const at = (c: ShotCell) => {
    const p = hexPx(c.q, c.r);
    return { x: p.x - center.x + SHOT_W / 2 + M, y: p.y - center.y + SHOT_H / 2 + M };
  };
  const seen = cells
    .map((c) => ({ c, p: at(c) }))
    .filter(
      ({ p }) =>
        p.x > M - 2 * R && p.x < M + SHOT_W + 2 * R && p.y > M - R && p.y < M + SHOT_H + 3 * R,
    )
    .sort((a, b) => a.c.r - b.c.r || a.c.q - b.c.q);

  const TW = Math.ceil(R * SQ3) + 2;
  const TH = 2 * R + 2;
  const ground = seen.map(async ({ c, p }): Promise<Piece | null> => {
    const input = c.terrain ? await resized(c.terrain, TW, TH, true) : null;
    return input
      ? { input, left: Math.round(p.x - TW / 2), top: Math.round(p.y - TH / 2), w: TW, h: TH }
      : null;
  });
  const standing = seen.map(async ({ c, p }): Promise<Piece | null> => {
    const url = c.building ?? c.decor;
    const s = url ? await source(url) : null;
    if (!url || !s) return null;
    const w = Math.round(R * (c.building ? 1.7 : 1.5));
    const h = Math.max(1, Math.round((w * s.h) / s.w));
    const input = await resized(url, w, h, false);
    const top = Math.round(p.y + R * 0.55 - h);
    return input ? { input, left: Math.round(p.x - w / 2), top, w, h } : null;
  });
  const pieces = [...(await Promise.all(ground)), ...(await Promise.all(standing))].filter(
    (x): x is Piece => !!x && x.left >= 0 && x.top >= 0 && x.left + x.w <= CW && x.top + x.h <= CH,
  );
  const canvas = await sharp({
    create: { width: CW, height: CH, channels: 4, background: "#131822" },
  })
    .composite(pieces.map(({ input, left, top }) => ({ input, left, top })))
    .png()
    .toBuffer();
  return sharp(canvas)
    .extract({ left: M, top: M, width: SHOT_W, height: SHOT_H })
    .jpeg({ quality: 88 })
    .toBuffer();
}
