// Копия образца: сухопутные бойцы и клады — не в воде (владелец, 13.11.2026: «как так
// вышло, что бугорок земли заспавнился на воде?»). Образец «Бар-На» перерисовывали
// (озеро урока, море на юге), а точки возрождения бойцов и клады остались прежние:
// копия ставила ежей, хомяков, слизней и кучки кладов в воду. Образец не трогаем —
// правим копию. Водные бойцы (родная местность — вода: крабы, сирены) остаются.
// Горы (владелец, 13.11.2026: «моб как-то заспавнился на горе» → «да, убрать») —
// бойцам не место никому, ни сухопутным, ни водным.
import { hexDist, keyOf } from "@/lib/raid/zonegen/town/hex";
import type { Cell } from "@/lib/raid/worldgen/geo";
import type { WorldCell } from "@/lib/raid/worldgen/spec";
import type { IslandPlaces } from "./steps";

/** Точка возрождения бойца образца (MasterBoss): swims — родная местность вода. */
export type DryBoss = Cell & { cur: Cell | null; swims?: boolean };

export function keepOffWater<B extends DryBoss>(
  cells: readonly WorldCell[],
  bosses: readonly B[],
  places: IslandPlaces,
  water: ReadonlySet<string>,
  mountains: ReadonlySet<string> = new Set(),
  /** Бойцы (objectId), чья родная местность вода, — для стоящих на клетке без точки возрождения. */
  swimmers: ReadonlySet<string> = new Set(),
): { bosses: B[]; places: IslandPlaces; loose: Array<{ from: Cell; to: Cell }> } {
  if (water.size === 0 && mountains.size === 0) return { bosses: [...bosses], places, loose: [] };
  const at = new Map(cells.map((c) => [keyOf(c), c]));
  const wet = (p: Cell) => {
    const c = at.get(keyOf(p));
    return !c || water.has(c.terrainId);
  };
  const high = (p: Cell) => {
    const c = at.get(keyOf(p));
    return !!c && mountains.has(c.terrainId);
  };
  /** Бойцу здесь не стоять: гора — никому, вода — сухопутному. */
  const bad = (p: Cell, swims = false) => high(p) || (!swims && wet(p));
  // Занятое: бойцы (дом и где стоят), постройки задания, клады, старт.
  const taken = new Set<string>();
  const hold = (p: Cell | null | undefined) => p && taken.add(keyOf(p));
  for (const b of bosses) {
    hold(b);
    hold(b.cur);
  }
  for (const p of [places.spawn, places.chest, places.workshop, places.mine, places.treasure, places.shipyard,
    ...places.mines, ...places.digs, ...places.monsters, ...places.trees, ...places.crystals]) hold(p);
  const free = (c: WorldCell) =>
    !water.has(c.terrainId) && !mountains.has(c.terrainId) && !c.objectId && !c.buildingId && !c.decorationId && !c.roadId && !taken.has(keyOf(c));
  /** Ближайшая свободная суша; занимает её. */
  const nearestDry = (from: Cell): Cell | null => {
    let best: WorldCell | null = null;
    let dist = Infinity;
    for (const c of cells) {
      if (!free(c)) continue;
      const d = hexDist(c, from);
      if (d < dist || (d === dist && best && (c.q < best.q || (c.q === best.q && c.r < best.r)))) {
        best = c;
        dist = d;
      }
    }
    if (!best) return null;
    taken.add(keyOf(best));
    return { q: best.q, r: best.r };
  };

  const moved = new Map<string, Cell>();
  const out = bosses.map((b) => {
    if (!bad(b, b.swims)) return b;
    // На образце боец уже стоит на суше рядом — там и дом; нет — ближайшая суша.
    const to = b.cur && !bad(b.cur) && !wet(b.cur) ? b.cur : nearestDry(b);
    if (!to) return b;
    moved.set(keyOf(b), to);
    // cur — клетка, где боец стоит на образце (в воде): placeBosses её очистит, иначе
    // в копии остался бы второй такой же боец в воде.
    return { ...b, q: to.q, r: to.r, cur: to === b.cur ? null : b.cur };
  });
  // Боец на клетке образца без точки возрождения — тоже прочь с горы и (сухопутный) из воды.
  const spawnAt = new Set(bosses.flatMap((b) => [keyOf(b), ...(b.cur ? [keyOf(b.cur)] : [])]));
  const loose: Array<{ from: Cell; to: Cell }> = [];
  for (const c of cells) {
    if (!c.objectId?.startsWith("boss:") || spawnAt.has(keyOf(c)) || !bad(c, swimmers.has(c.objectId))) continue;
    const to = nearestDry(c);
    if (!to) continue;
    loose.push({ from: { q: c.q, r: c.r }, to });
    moved.set(keyOf(c), to);
  }
  // Боец задания без точки возрождения (featurePatches ставит его по клетке) — тоже на сушу.
  const swimHome = new Set(bosses.filter((b) => b.swims).map((b) => keyOf(b)));
  const monsters = places.monsters.map((p) => {
    const m = moved.get(keyOf(p));
    if (m || !bad(p, swimHome.has(keyOf(p)))) return m ?? p;
    return nearestDry(p) ?? p;
  });
  const dry = (list: Cell[]) =>
    list.flatMap((p) => {
      if (!wet(p)) return [p];
      const to = nearestDry(p);
      return to ? [to] : [];
    });
  const treasure = wet(places.treasure) ? (nearestDry(places.treasure) ?? places.treasure) : places.treasure;
  return {
    loose,
    bosses: out,
    places: {
      ...places,
      monsters,
      digs: dry(places.digs),
      treasure,
    },
  };
}
