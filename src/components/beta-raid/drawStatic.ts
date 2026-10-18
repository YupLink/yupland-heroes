// Статичный слой кадра: положить видимые куски (chunkLayer) и допечь
// недостающие — не больше budget за кадр, чтобы кадр не встал.
//
// Что не успели испечь, кадр рисует прямо в холст тем же bakeCells под
// обрезкой по прямоугольнику куска — пиксель в пиксель как испечённый, — а
// следующий кадр допечёт остальное: слой собирается за 2–3 кадра без фриза.
// Раньше такие куски дорисовывал drawCells ПОСЛЕ всех уложенных кусков, и
// их тайлы ложились поверх верхушек деревьев из соседних испечённых кусков:
// на шаге героя, панораме и после вытеснения ёлку «отгрызало» на 1–4 кадра.
import { ChunkLayer, HARD_BYTES, type BakeInput } from "./chunkLayer";
import { bakeCells } from "./chunkBake";
import { CHUNK, REACH, chunkId, chunkRect } from "./chunkIndex";
import type { MapIndex, WorldView } from "./mapIndex";
import type { DrawScene } from "./betaCanvasScene";
import { frameStats } from "./frameStats";

export type StaticResult = {
  /** Номера кусков, уже лежащих на холсте: их клетки местность не рисуют. */
  covered: Set<number>;
  /** Сколько кусков ещё не испечено — кадр попросит продолжение. */
  pending: number;
};

const NONE: Set<number> = new Set();

/** Часть куска, попавшая в кадр: раз печь некогда, за краем экрана не рисуем. */
function inView(r: WorldView, v: WorldView): WorldView {
  return {
    minX: Math.max(r.minX, v.minX),
    maxX: Math.min(r.maxX, v.maxX),
    minY: Math.max(r.minY, v.minY),
    maxY: Math.min(r.maxY, v.maxY),
  };
}

export function drawStatic(
  scene: DrawScene,
  index: MapIndex,
  chunks: ChunkLayer,
  dpr: number,
  /** Сколько миллисекунд кадра можно потратить на выпечку (хотя бы один кусок). */
  budgetMs: number,
): StaticResult {
  const { g, view } = scene;
  const store = index.store;
  if (store.n === 0) return { covered: NONE, pending: 0 };
  chunks.invalidation.sync(store, scene.seen, scene.revealAll, () => chunks.clear());
  const bucket = ChunkLayer.bucketFor(scene.scale, dpr);
  // Зум едет — разрешение меняется каждый кадр, печь под него бессмысленно:
  // кладём, что есть, с масштабом; остановится — допечём ровно под него.
  let allow = budgetMs;
  if (bucket !== chunks.lastBucket) {
    chunks.lastBucket = bucket;
    if (scene.moving) allow = 0;
  }
  const t0 = performance.now();
  const input: BakeInput = {
    index,
    tiles: scene.tiles,
    ribbons: scene.ribbons,
    images: scene.images,
    seen: scene.seen,
    revealAll: scene.revealAll,
  };
  const covered = new Set<number>();
  let pending = 0;
  let baked = 0;
  // Куски карты, задетые кадром: за краем карты кусков нет — пустые пропускаем
  // по рамке сетки. Рамка — по центрам клеток, а кусок режет рисунок своим
  // краем, поэтому расширяем её на вынос рисунка: иначе у крайней клетки
  // пропадал бы срез тайла, а у верхней — верхушка дерева.
  const cx0 = Math.floor(Math.max(view.minX, store.geom.x0 - REACH.x) / CHUNK);
  const cx1 = Math.floor(Math.min(view.maxX, store.geom.x1 + REACH.x) / CHUNK);
  const cy0 = Math.floor(Math.max(view.minY, store.geom.y0 - REACH.dec) / CHUNK);
  const cy1 = Math.floor(Math.min(view.maxY, store.geom.y1 + REACH.y) / CHUNK);
  // Экрану нужно столько байт кусков; больше жёсткого потолка — слой не для
  // этого экрана, кадр рисует по клеткам (covered пуст).
  const need = (cx1 - cx0 + 1) * (cy1 - cy0 + 1) * ChunkLayer.bytesPer(bucket);
  if (need > HARD_BYTES) return { covered: NONE, pending: 0 };
  chunks.need = need;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      let b = chunks.get(cx, cy, bucket, true);
      const exact = !!b && b.bucket === bucket;
      const stale = !!b && chunks.stale(b, scene.images);
      // Бюджет — временем, не штуками: на слабом телефоне кусок печётся
      // 10–15 мс, шесть штук за кадр давали кадры по 80–130 мс после зума.
      if ((!exact || stale) && allow > 0 && (baked === 0 || performance.now() - t0 < allow)) {
        baked++;
        // Не испёкся (память графики кончилась, контекста нет) — кусок не
        // считаем ожидающим: иначе кадры крутились бы вечно ради него.
        // Ниже он нарисуется в холст, попытка повторится со следующим кадром.
        const fresh = chunks.bake(cx, cy, bucket, input);
        if (fresh) b = fresh;
      } else if (!exact || stale) pending++;
      // Тот же зум — размер совпадает с канвасом куска пиксель в пиксель.
      if (b) g.drawImage(b.cv, b.x0, b.y0, b.w, b.h);
      // В движении печь некогда, а старых кусков нет — рисуем кусок в холст
      // как есть: те же клетки, тот же порядок, та же обрезка.
      else bakeCells(g, inView(chunkRect(cx, cy), view), input);
      covered.add(chunkId(cx, cy));
    }
  }
  frameStats.bakes += baked;
  return { covered, pending };
}
