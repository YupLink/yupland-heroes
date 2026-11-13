// Взрыв шахты в кадре карты: кадр листа набора Ангелины (lib/mineArt) одним
// drawImage в прямоугольник шахты на клетке — тот же масштаб и опорная точка,
// что у обычной картинки шахты (mineArtRect). Кадры — как есть, без
// дорисовок, без теней, засветов и смешивания (ПРАВИЛА §9.1).
//
// Видно тем, у кого клетка разведана и попадает в кадр; лист кадров качается,
// когда взрыв впервые оказался на экране (images.get → LazyImages). Отсчёт
// кадров — с первого нарисованного, один проход; дальше кадр будится только
// к смене кадра анимации (wakeMineBlasts), а не каждые 16 мс.
import { R } from "../hexGeometry";
import { MINE_ART_W, mineArtRect } from "../mine-art/drawMineArt";
import type { WorldView } from "../mapIndex";
import type { FogView } from "../fogMask";
import {
  MINE_BLAST_COLS,
  MINE_BLAST_ROWS,
  mineBlastFrameAt,
  mineBlastKey,
  mineBlastNextIn,
} from "@/lib/mineArt";
import {
  BLAST_WAIT_MS,
  dropMineBlasts,
  getMineBlasts,
  wakeMineBlasts,
  type MineBlast,
} from "./mineBlastStore";

type Scene = {
  g: CanvasRenderingContext2D;
  toPixel: (q: number, r: number) => { x: number; y: number };
  images: Map<string, HTMLImageElement>;
  view: WorldView;
  seen: FogView;
  visible: Set<number>;
  revealAll: boolean;
};

/** Номер клетки карты по координатам; -1 — нет такой. */
type CellIndex = { index(q: number, r: number): number };

/** Насколько вверх от низа шахты достаёт кадр (в ширинах постройки) — с запасом. */
const REACH_UP = 1.4;

const ready = (img: HTMLImageElement | undefined): img is HTMLImageElement =>
  !!img && img.complete && img.naturalWidth > 0;

/** Клетка разведана (или админ видит всё): взрыв на неразведанном не показываем. */
function seenCell(s: Scene, cells: CellIndex, b: MineBlast): boolean {
  if (s.revealAll) return true;
  const i = cells.index(b.q, b.r);
  return i >= 0 && (s.visible.has(i) || s.seen.hasIndex(i));
}

/** Прямоугольник шахты задевает кадр. */
function onScreen(s: Scene, x: number, bottom: number): boolean {
  const v = s.view;
  const half = MINE_ART_W * 0.6;
  return (
    x + half >= v.minX &&
    x - half <= v.maxX &&
    bottom >= v.minY &&
    bottom - MINE_ART_W * REACH_UP <= v.maxY
  );
}

/** Взрывы этой карты — поверх клеток; отыгравшие убираются, кадр будится к следующему. */
export function drawMineBlasts(
  s: Scene,
  cells: CellIndex,
  mapId: string | null,
  now = performance.now(),
): void {
  const list = getMineBlasts();
  if (list.length === 0) return;
  const gone = new Set<MineBlast>();
  let next = Infinity;
  for (const b of list) {
    if (b.mapId && mapId && b.mapId !== mapId) {
      gone.add(b); // этаж сменился — чужой взрыв не доигрываем
      continue;
    }
    if (!b.start && now - b.at > BLAST_WAIT_MS) {
      gone.add(b); // экран или лист так и не дождались — момент прошёл
      continue;
    }
    const p = s.toPixel(b.q, b.r);
    const bottom = p.y + R * 0.55;
    if (!seenCell(s, cells, b) || !onScreen(s, p.x, bottom)) {
      if (b.start && mineBlastNextIn(now - b.start) == null) gone.add(b);
      continue;
    }
    const img = s.images.get(mineBlastKey(b.kind)); // первый запрос — загрузка листа
    if (!ready(img)) continue; // докачается — useImageCache разбудит кадр
    if (!b.start) b.start = now;
    const t = now - b.start;
    const f = mineBlastFrameAt(t);
    if (f < 0) {
      gone.add(b);
      continue;
    }
    const fw = img.naturalWidth / MINE_BLAST_COLS;
    const fh = img.naturalHeight / MINE_BLAST_ROWS;
    const a = mineArtRect({ naturalWidth: fw, naturalHeight: fh }, p.x, bottom, MINE_ART_W);
    const sx = (f % MINE_BLAST_COLS) * fw;
    const sy = Math.floor(f / MINE_BLAST_COLS) * fh;
    s.g.drawImage(img, sx, sy, fw, fh, a.x, a.y, a.w, a.h);
    next = Math.min(next, mineBlastNextIn(t) ?? Infinity);
  }
  dropMineBlasts(gone);
  if (next < Infinity) wakeMineBlasts(next);
}
