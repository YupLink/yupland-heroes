// Серая плёнка тумана (третий проход drawCells): две фигуры — лёгкая (активная
// зона, 20 клеток) и тёмная (разведанное вне неё).
//
// Раньше обе собирались заново КАЖДЫЙ кадр из всех клеток экрана — на телефоне
// это треть кадра (стенд 12.11.2026, ×16, 40 шагов: 0,45 с из 1,36 с; владелец:
// «карта лагает и при передвижениях и вообще»). Теперь фигуры собираются на
// область с запасом MARGIN экрана с каждой стороны и живут, пока не сменились
// туман, обзор, зоны или карта, а экран не вышел за собранную область. Кадр —
// два fill; лишнее за краем холст отсекает сам.
import { hexPath2D } from "./hexGeometry";
import { forEachVisible, type MapIndex, type WorldView } from "./mapIndex";
import { touchesSeen } from "./drawGround";
import type { DrawScene } from "./betaCanvasScene";

type IdxSet = { has(i: number): boolean };
export type FogFilm = { light: Path2D; dark: Path2D };

/** Запас области сборки — доля экрана с каждой стороны. */
const MARGIN = 0.25;

let film: (FogFilm & { area: WorldView; deps: unknown[] }) | null = null;

const inside = (v: WorldView, a: WorldView): boolean =>
  v.minX >= a.minX && v.maxX <= a.maxX && v.minY >= a.minY && v.maxY <= a.maxY;

/**
 * Плёнка для кадра. Зоны: visible и bright — без плёнки, active — лёгкая,
 * прочее разведанное — тёмная; неразведанная клетка на границе с разведанной
 * тоже под плёнкой (на неё «свисают» картинки соседей).
 */
export function fogFilm(scene: DrawScene, index: MapIndex, active: IdxSet, bright: IdxSet): FogFilm {
  const { seen, visible, view } = scene;
  const deps: unknown[] = [index.store, seen, (seen as { version?: number }).version, visible, active, bright];
  if (film && inside(view, film.area) && film.deps.every((d, k) => d === deps[k])) return film;
  const w = view.maxX - view.minX;
  const h = view.maxY - view.minY;
  const area = {
    minX: view.minX - w * MARGIN,
    maxX: view.maxX + w * MARGIN,
    minY: view.minY - h * MARGIN,
    maxY: view.maxY + h * MARGIN,
  };
  const light = new Path2D();
  const dark = new Path2D();
  const hex = hexPath2D();
  const m = new DOMMatrix();
  const store = index.store;
  const p = store.packed;
  forEachVisible(index, area, (c) => {
    if (visible.has(c.i) || bright.has(c.i)) return;
    if (!seen.hasIndex(c.i) && !touchesSeen(store, seen, p.q[c.i], p.r[c.i])) return;
    m.e = c.x;
    m.f = c.y;
    (active.has(c.i) ? light : dark).addPath(hex, m);
  });
  film = { light, dark, area, deps };
  return film;
}
