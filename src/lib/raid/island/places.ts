// Где что стоит на острове: старт, сундук, дубы, слизни, мастерская, шахта,
// кристаллы, клады, лодка, портал. Чистая функция клеток и сида — тот же
// остров даёт ту же раскладку.
//
// Задание ведёт игрока от старта у берега напротив города: рядом сундук и
// первые дубы, дальше первый слизень и мастерская у города, за ними шахта и
// первые кристаллы, в дальнем конце — разрушенный портал с кладом рядом. Прочие
// слабые боссы (их число — от сида), дубы, кристаллы и клады разбросаны по
// острову врозь; артефакт и тренировочный пак — у двух случайных боссов, не у
// первого. Лодка — на мелководье у берега, поближе к старту.
import { BOSS_COUNT, ISLAND_COUNTS } from "@/lib/raid/island/catalog";
import { ISLAND_LAND_R } from "@/lib/raid/island/shape";
import { DIRS, hashCell, hexDist, keyOf } from "@/lib/raid/zonegen/town/hex";
import type { Cell } from "@/lib/raid/worldgen/geo";
import type { WorldCell } from "@/lib/raid/worldgen/spec";
import type { IslandPlaces } from "@/lib/raid/island/steps";

/** Дальше этого от центра города — дикая земля, где стоит всё задание. */
const TOWN_KEEP = 4;
/** Расстояния задания задуманы на остров радиусом 7 — растут вместе с сушей. */
const far = (n: number) => Math.round((n * ISLAND_LAND_R) / 7);
/** Лодке — куда плыть: мелководья, связанного с её клеткой, не меньше стольких клеток. */
const BOAT_WATER = 30;

/** Клетка мелководья → сколько мелководья с ней связано (кусок целиком). */
function waterRoom(shallow: ReadonlySet<string>): Map<string, number> {
  const size = new Map<string, number>();
  for (const k of shallow) {
    if (size.has(k)) continue;
    const part = [k];
    const seen = new Set(part);
    for (let i = 0; i < part.length; i++) {
      const [q, r] = part[i].split(",").map(Number);
      for (const [dq, dr] of DIRS) {
        const n = keyOf({ q: q + dq, r: r + dr });
        if (!shallow.has(n) || seen.has(n)) continue;
        seen.add(n);
        part.push(n);
      }
    }
    for (const x of part) size.set(x, part.length);
  }
  return size;
}

export type PlaceInput = {
  cells: readonly WorldCell[];
  water: ReadonlySet<string>;
  /** Мелководье (часть water): здесь стоит лодка. */
  shallow: ReadonlySet<string>;
  town: Cell;
  hall: Cell | null;
  seed: number;
};

export function pickPlaces(inp: PlaceInput): IslandPlaces {
  const byKey = new Map(inp.cells.map((c) => [keyOf(c), c]));
  const used = new Set<string>();
  const land = (c: Cell) => byKey.has(keyOf(c)) && !inp.water.has(keyOf(c));
  const coastal = (c: Cell) => DIRS.some(([dq, dr]) => !land({ q: c.q + dq, r: c.r + dr }));
  const free = inp.cells.filter(
    (c) => land(c) && !c.buildingId && !c.roadId && !c.objectId && !inp.water.has(keyOf(c)),
  );
  const wild = free.filter((c) => hexDist(c, inp.town) > TOWN_KEEP);
  const roll = (c: Cell, salt: number) => hashCell(inp.seed ^ salt, c.q, c.r);

  /** Лучшая по оценке свободная клетка; ничья — хеш клетки. */
  const take = (
    from: readonly WorldCell[],
    score: (c: Cell) => number,
    salt: number,
    ok: (c: Cell) => boolean = () => true,
  ): Cell => {
    let best: WorldCell | null = null;
    let bestS = -Infinity;
    for (const c of from) {
      if (used.has(keyOf(c)) || !ok(c)) continue;
      const s = score(c) + (roll(c, salt) % 1000) / 1e6;
      if (s > bestS) [best, bestS] = [c, s];
    }
    const pick = best ?? from.find((c) => !used.has(keyOf(c))) ?? inp.cells[0];
    used.add(keyOf(pick));
    return { q: pick.q, r: pick.r };
  };
  const many = (n: number, f: () => Cell): Cell[] => Array.from({ length: n }, f);
  const near = (to: Cell, want: number) => (c: Cell) => -Math.abs(hexDist(c, to) - want);
  const inland = (c: Cell) => !coastal(c);
  // Дубы и кристаллы задания — не на берегу и не вплотную друг к другу: на мысе
  // дуб с соседом (или с сундуком) запирали клетку между собой — к дальнему
  // не подойти, не срубив ближний (1 остров из 300 на рамке 26).
  const decor: Cell[] = [];
  const lone = (c: Cell) => inland(c) && decor.every((d) => hexDist(c, d) > 1);
  const plant = (c: Cell): Cell => {
    decor.push(c);
    return c;
  };
  /** n клеток врозь — подальше от from и друг от друга (дальше far(4) — всё равно). */
  const spread = (n: number, from: readonly Cell[], salt: number, ok = inland, then = plant) => {
    const out: Cell[] = [];
    while (out.length < n) {
      const all = [...from, ...out];
      const apart = (c: Cell) => Math.min(far(4), ...all.map((m) => hexDist(c, m)));
      out.push(then(take(wild, apart, salt + out.length, ok)));
    }
    return out;
  };

  const spawn = take(wild, (c) => hexDist(c, inp.town), 1, inland);
  const chest = take(wild, near(spawn, 2), 2);
  const trees = many(ISLAND_COUNTS.treesNearStart, () =>
    plant(take(wild, near(spawn, 3), 3, (c) => hexDist(c, chest) > 1 && lone(c))),
  );
  const portal = take(wild, (c) => hexDist(c, spawn) + hexDist(c, inp.town) / 4, 4, inland);
  const treasure = take(wild, near(portal, 2), 5);
  const awayFromStart = (c: Cell) => hexDist(c, spawn) > 2;
  const monsters = [
    take(wild, (c) => near(spawn, far(5))(c) - hexDist(c, inp.town) / 8, 6, awayFromStart),
  ];
  const span = BOSS_COUNT.max - BOSS_COUNT.min + 1;
  const count = BOSS_COUNT.min + (roll(spawn, 11) % span);
  // Остальные — врозь: подальше от уже поставленных боссов и от старта, не на
  // берегу — на мысе босс мог встать в тупик за деревьями задания.
  const deep = (c: Cell) => awayFromStart(c) && inland(c);
  while (monsters.length < count) {
    const apart = (c: Cell) => Math.min(far(6), ...monsters.map((m) => hexDist(c, m)));
    monsters.push(
      take(wild, (c) => apart(c) + Math.min(hexDist(c, spawn), 5) / 4, 20 + monsters.length, deep),
    );
  }
  // Призы — двум разным случайным боссам, кроме первого.
  const rest = monsters.slice(1);
  const a = roll(spawn, 12) % rest.length;
  const b = (a + 1 + (roll(spawn, 13) % (rest.length - 1))) % rest.length;
  const workshop = take(
    free,
    (c) => -hexDist(c, spawn) - 3 * Math.abs(hexDist(c, inp.town) - 3),
    7,
    inland,
  );
  const mine = take(wild, (c) => near(spawn, far(6))(c) + hexDist(c, portal) / 4, 8, inland);
  const crystals = many(ISLAND_COUNTS.crystalsNearMine, () =>
    plant(take(wild, near(mine, 2), 9, (c) => hexDist(c, mine) > 1 && lone(c))),
  );
  // Прочие дубы и кристаллы — врозь по острову: ходить за ними, а не стоять.
  trees.push(...spread(ISLAND_COUNTS.trees - trees.length, trees, 30, lone));
  crystals.push(...spread(ISLAND_COUNTS.crystals - crystals.length, crystals, 40, lone));
  // Клады — врозь от старта и от главного клада; можно и у берега, клетка
  // под кладом расчищается (features) — декором задания не считается.
  const anyCell = () => true;
  const digs = spread(ISLAND_COUNTS.digs, [spawn, treasure], 50, anyCell, (c) => c);
  // Верфь (владелец, 17.10.2026: «игрок должен построить себе корабль») —
  // свободная суша у мелководья (корабль спускается на соседнюю воду), ближе
  // к старту; по возможности — у большого куска мелководья (у рамки рвётся).
  const room = waterRoom(inp.shallow);
  const beside = (c: Cell, min: number) =>
    !used.has(keyOf(c)) &&
    DIRS.some(([dq, dr]) => {
      const k = keyOf({ q: c.q + dq, r: c.r + dr });
      return inp.shallow.has(k) && (room.get(k) ?? 0) >= min;
    });
  const roomy = free.filter((c) => beside(c, BOAT_WATER));
  const yard = roomy.length > 0 ? roomy : free.filter((c) => beside(c, 1));
  const shipyard = yard.length > 0 ? take(yard, (c) => -hexDist(c, spawn), 60) : null;
  return {
    spawn,
    chest,
    workshop,
    trees,
    monsters,
    artifact: rest[a],
    pack: rest[b],
    crystals,
    mine,
    treasure,
    digs,
    shipyard,
    portal,
    hall: inp.hall,
  };
}
