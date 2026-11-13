// Досягаемость в неразведанном (владелец, 11.11.2026): «радиус возможного
// нажатия не 2 клетки по обзору, а 10 (с биноклем 20); клетки чуть светлее
// самой темноты, туда можно нажать — чтобы начал строиться маршрут; для всех».
//
// Что лежит под туманом, не раскрываем: клетка только светлее (без местности
// и объектов), а тап по ней — один маршрут, без окон построек и действий.
import { hexPath2D } from "../hexGeometry";
import type { DrawScene } from "../betaCanvasScene";
import type { MapStore } from "../mapStore";

/** Круг досягаемости: центр — герой, радиус — 10 или 20 под биноклем. */
export type FogReach = { q: number; r: number; radius: number };

/** Досягаемая клетка — на тон светлее чёрного тумана (COLOR.fogTile #0a0e16). */
export const REACH_TILE = "#182031";
/** Клетка чуть меньше гекса: тёмный шов между соседями читается сеткой. */
const INSET = 0.9;

export function inReach(reach: FogReach | null | undefined, q: number, r: number): boolean {
  if (!reach) return false;
  const dq = q - reach.q;
  const dr = r - reach.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) <= reach.radius;
}

type KeySet = { has(key: string): boolean };

/**
 * Что делать с тапом по клетке: "full" — обычный тап, "blind" — только
 * маршрут (неразведанная клетка в досягаемости), null — мимо.
 *
 * Туман вслепую не трогаем. Исключения прежние: режим бога (кистью наливают
 * территорию в пустоту на краю карты), вещь в руке (земля кладётся и в пустоту
 * мира строителей), карта, открытая целиком, и остров новичка — там маршрут
 * ставится в туман целиком (владелец, 05.11.2026).
 */
export function fogTapKind(a: {
  q: number;
  r: number;
  free: boolean;
  seen: KeySet;
  visible: KeySet;
  reach: FogReach | null | undefined;
  store: MapStore | null;
}): "full" | "blind" | null {
  const key = `${a.q},${a.r}`;
  if (a.free || a.seen.has(key) || a.visible.has(key)) return "full";
  if (!inReach(a.reach, a.q, a.r) || !a.store) return null;
  // Вне карты и под глухим туманом (store.dome) — не досягаемо.
  const i = a.store.index(a.q, a.r);
  return i < 0 || a.store.dome.has(i) ? null : "blind";
}

let cache: { deps: unknown[]; path: Path2D } | null = null;

/** Гексы неразведанных клеток круга одной фигурой; пересобирается на шаг/разведку. */
function reachPath(scene: DrawScene, store: MapStore, reach: FogReach): Path2D {
  const deps = [store, scene.seen, scene.visible, reach.q, reach.r, reach.radius];
  if (cache && cache.deps.every((d, k) => d === deps[k])) return cache.path;
  const path = new Path2D();
  const hex = hexPath2D();
  const m = new DOMMatrix([INSET, 0, 0, INSET, 0, 0]);
  const n = reach.radius;
  for (let dq = -n; dq <= n; dq++) {
    for (let dr = Math.max(-n, -dq - n); dr <= Math.min(n, n - dq); dr++) {
      const q = reach.q + dq;
      const r = reach.r + dr;
      const i = store.index(q, r);
      if (i < 0 || store.dome.has(i) || scene.seen.hasIndex(i) || scene.visible.has(i)) continue;
      const p = scene.toPixel(q, r);
      m.e = p.x;
      m.f = p.y;
      path.addPath(hex, m);
    }
  }
  cache = { deps, path };
  return path;
}

/**
 * Подсветить досягаемые клетки. Смешение «lighten» поднимает только то, что
 * темнее цвета клетки: чёрный туман и его плёнку у края разведанного; свесы
 * деревьев и построек соседей остаются как были.
 */
export function drawFogReach(scene: DrawScene, store: MapStore): void {
  const reach = scene.fogZones?.reach;
  if (!reach || scene.revealAll) return;
  const { g } = scene;
  const path = reachPath(scene, store, reach);
  const op = g.globalCompositeOperation;
  g.globalCompositeOperation = "lighten";
  g.fillStyle = REACH_TILE;
  g.fill(path);
  g.globalCompositeOperation = op;
}
