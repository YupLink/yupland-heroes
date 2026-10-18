// Форма острова: суша кругом с рваным берегом, кольцо мелководья, дальше океан.
//
// Мир генератора берёт местность из памяти w.memo, если она там есть (field.
// terrainAt). Поэтому остров не требует своей копии движка: местность
// подкладывается заранее, а город, декор, дороги и лабиринт генератор строит
// поверх неё как обычно — и видит воду там, где море острова.
import { fbm, hexToXY } from "@/lib/raid/zonegen/noise";
import { DIRS, disk, hashCell, hexDist, keyOf } from "@/lib/raid/zonegen/town/hex";
import { axialToOffset, offsetToAxial } from "@/lib/hex-renderer";
import { pickWeighted, unit } from "@/lib/raid/worldgen/rand";
import { isWaterId, type World } from "@/lib/raid/worldgen/field";
import type { Cell } from "@/lib/raid/worldgen/geo";

/** Рамка карты острова, клеток (offset). Было 20 — «чуть территория побольше» (17.10). */
export const ISLAND_SIZE = 26;
/** Радиус суши от центра — около 19 клеток поперёк (было 7). */
export const ISLAND_LAND_R = 9;
/** Мелководье за сушей, клеток. */
const SHALLOW_RING = 2.5;
/** Насколько гуляет берег (± клеток). */
const COAST_WOBBLE = 3.2;

/** Земли острова — дешёвые для шага травы (1–1,5 энергии). Первая — чаще. */
export const ISLAND_LANDS = [
  { id: "terrain_QArF-OKH-s", w: 3 }, // трава с холмами
  { id: "terrain_A5WcpQq_bW", w: 2 }, // трава
  { id: "terrain_zZdeQieTB5", w: 1 }, // сухая трава
] as const;

export const islandCenter = (): Cell => offsetToAxial(ISLAND_SIZE / 2, ISLAND_SIZE / 2);

/** Основная земля и соседка для пятен: только те, что есть в спецификации мира. */
export function islandLands(w: World): { main: string; second: string | null } {
  const known = new Set(w.spec.land.map((l) => l.id));
  const usable = ISLAND_LANDS.filter((l) => known.has(l.id) && w.spec.decor[l.id]);
  const pool = usable.length > 0 ? usable : [{ id: w.spec.land[0].id, w: 1 }];
  const pick = pickWeighted(
    pool,
    pool.map((l) => l.w),
    unit(hashCell(w.spec.seed, 3, 11)),
  );
  const main = (pick ?? pool[0]).id;
  const second = pool.find((l) => l.id !== main)?.id ?? null;
  return { main, second };
}

/** Суша ли клетка острова: расстояние до центра с поправкой на рваный берег. */
function landReach(w: World, c: Cell, center: Cell): number {
  const { x, y } = hexToXY(c.q, c.r);
  const wob = (fbm(w.clump, x / 3.5 + 11.3, y / 3.5 - 4.1, 2) - 0.5) * COAST_WOBBLE * 2;
  return hexDist(c, center) + wob;
}

/** Край рамки и всё за ней: суше там не быть — по краю карты всегда вода. */
function atFrame(c: Cell): boolean {
  const { col, row } = axialToOffset(c.q, c.r);
  return col < 1 || row < 1 || col > ISLAND_SIZE - 2 || row > ISLAND_SIZE - 2;
}

/**
 * Подложить местность острова в память мира: суша — основная земля с пятнами
 * соседки, вокруг мелководье, дальше океан. С запасом за рамкой: город
 * смотрит на воду в кольце вокруг своей зоны.
 */
export function prefillIsland(w: World, center: Cell): { main: string; second: string | null } {
  const lands = islandLands(w);
  const area = disk(center, ISLAND_SIZE + 24);
  for (const c of area) {
    const d = landReach(w, c, center);
    let id: string;
    if (d <= ISLAND_LAND_R && !atFrame(c)) {
      const { x, y } = hexToXY(c.q, c.r);
      const patch = fbm(w.detail, x / 3 + 2.7, y / 3 - 8.9, 2) > 0.58;
      id = patch && lands.second ? lands.second : lands.main;
    } else if (d <= ISLAND_LAND_R + SHALLOW_RING) id = w.spec.water.shallow;
    else id = w.spec.water.ocean;
    w.memo.set(keyOf(c), id);
  }
  solidify(w, area, center, lands.main);
  return lands;
}

/** Клетки, до которых дойти от начальных по соседям, где можно. */
function flood(from: readonly string[], ok: (k: string) => boolean): Set<string> {
  const seen = new Set(from.filter(ok));
  const queue = [...seen];
  while (queue.length > 0) {
    const [q, r] = (queue.pop() as string).split(",").map(Number);
    for (const [dq, dr] of DIRS) {
      const k = keyOf({ q: q + dq, r: r + dr });
      if (seen.has(k) || !ok(k)) continue;
      seen.add(k);
      queue.push(k);
    }
  }
  return seen;
}

/**
 * Суша — одним куском и без озёр (владелец, 14.10: «главное, чтобы была суша;
 * по суше — до всех мест»). Рваный берег давал клочки суши в море (15 островов
 * из 100) и запертую сушей воду (6 из 100): клочки уходят под мелководье, озёра
 * засыпаются основной землёй.
 */
function solidify(w: World, area: readonly Cell[], center: Cell, land: string): void {
  const inside = new Set(area.map(keyOf));
  const isLand = (k: string) => inside.has(k) && !isWaterId(w, w.memo.get(k) ?? "");
  const main = flood([keyOf(center)], isLand);
  const rim = area.filter((c) => hexDist(c, center) === ISLAND_SIZE + 24).map(keyOf);
  const sea = flood(rim, (k) => inside.has(k) && !isLand(k));
  // Сначала разметка, потом правка: правка меняет, что считается сушей.
  const islets = [...inside].filter((k) => isLand(k) && !main.has(k));
  const lakes = [...inside].filter((k) => !isLand(k) && !sea.has(k));
  for (const k of islets) w.memo.set(k, w.spec.water.shallow);
  for (const k of lakes) w.memo.set(k, land);
}
