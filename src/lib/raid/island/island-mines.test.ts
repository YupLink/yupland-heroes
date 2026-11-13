// Остров v3, часть 2 (владелец, 20.10.2026): четыре сломанные шахты острова,
// лопата и клад — до лесопилки, шаг «Шахта» — по починке. Базы нет.
import { describe, expect, it } from "vitest";
import { DIRS, hexDist, keyOf } from "@/lib/raid/zonegen/town/hex";
import {
  ISLAND_BUILDINGS,
  ISLAND_EXTRA_MINES,
  ISLAND_MINES,
  islandMineConfig,
} from "@/lib/raid/island/catalog";
import { ISLAND_STEP_IDS, currentStep, parsePlaces, stepChapter } from "@/lib/raid/island/steps";
import { isMineCell } from "@/lib/raid/island/carve";
import { MANY, SEEDS, isWater, make, reach } from "@/lib/raid/island/island.fixture";

describe("шахты острова", () => {
  it("лесопилка + камень, золото, алмазы: шаблоны и настройка v2 острова", () => {
    const isl = make(11);
    const p = isl.places;
    const at = new Map(isl.cells.map((c) => [keyOf(c), c]));
    expect(ISLAND_BUILDINGS.mine).toBe(ISLAND_MINES.wood);
    expect(p.mines).toHaveLength(ISLAND_EXTRA_MINES.length);
    const all = [
      { c: p.mine, res: "wood" as const },
      ...p.mines.map((c, i) => ({ c, res: ISLAND_EXTRA_MINES[i] })),
    ];
    expect(all.map((m) => m.res)).toEqual(["wood", "stone", "gold", "diamonds"]);
    for (const { c, res } of all) {
      const cell = at.get(keyOf(c));
      expect(cell?.buildingId).toBe(ISLAND_MINES[res]);
      // Строки владения нет — шахта сломана; maxHours нет — движок v2.
      expect(cell?.buildingConfig).toEqual({
        effect: "mine",
        resource: res,
        island: true,
        yield: 1,
        captureCost: 0,
      });
      expect(cell?.buildingConfig).toEqual(islandMineConfig(res));
      expect(cell?.tier).toBeNull();
    }
  });

  const SLOW = { timeout: 60_000 };

  it("шахты — вглубь суши, врозь, не вплотную к дубам, камням, боссам, сундуку", SLOW, () => {
    for (const seed of [...SEEDS, ...MANY.slice(0, 6)]) {
      const isl = make(seed);
      const p = isl.places;
      const at = new Map(isl.cells.map((c) => [keyOf(c), c]));
      const walls = [...p.trees, ...p.crystals, ...p.monsters, p.chest, p.mine];
      const taken = new Set(
        [p.spawn, p.workshop, p.treasure, p.portal, ...walls, ...p.digs].map(keyOf),
      );
      p.mines.forEach((m, i) => {
        expect(taken.has(keyOf(m)), `${seed}: клетка занята`).toBe(false);
        for (const w of [...walls, ...p.mines.slice(0, i)])
          expect(hexDist(m, w), `${seed}: ${keyOf(m)} у ${keyOf(w)}`).toBeGreaterThan(1);
        for (const [dq, dr] of DIRS) {
          const n = at.get(keyOf({ q: m.q + dq, r: m.r + dr }));
          expect(n && !isWater(n.terrainId), `${seed}: берег у ${keyOf(m)}`).toBe(true);
        }
      });
    }
  });

  it("старый остров без шахт читается: mines — [], остальное как было", () => {
    const p = make(222).places;
    const { mines, ...rest } = p;
    expect(mines).toHaveLength(3);
    const old = parsePlaces(JSON.parse(JSON.stringify(rest)));
    expect(old?.mines).toEqual([]);
    expect({ ...old, mines }).toEqual(p);
  });

  it("шахта — стена: на неё не встают, но к каждой есть подход", SLOW, () => {
    for (const seed of MANY.slice(0, 10)) {
      const isl = make(seed);
      const ok = reach(isl);
      for (const m of [isl.places.mine, ...isl.places.mines]) {
        const cell = isl.cells.find((c) => keyOf(c) === keyOf(m));
        expect(cell && isMineCell(cell)).toBe(true);
        expect(ok.has(keyOf(m))).toBe(false);
        const near = DIRS.map(([dq, dr]) => keyOf({ q: m.q + dq, r: m.r + dr }));
        expect(
          near.some((k) => ok.has(k)),
          `${seed}: ${keyOf(m)}`,
        ).toBe(true);
      }
    }
  });
});

describe("проходка: лопата и клад — до лесопилки", () => {
  it("инструменты: кирка, камень, лопата, клад, шахта, «Добыча»", () => {
    const from = ISLAND_STEP_IDS.indexOf("pickaxe");
    expect(ISLAND_STEP_IDS.slice(from, from + 6)).toEqual([
      "pickaxe",
      "crystal",
      "shovel",
      "dig",
      "mine",
      "harvest",
    ]);
    for (const s of ["shovel", "dig", "mine", "harvest"] as const)
      expect(stepChapter(s)).toBe("tools");
    const p = make(11).places;
    const before = ISLAND_STEP_IDS.slice(0, ISLAND_STEP_IDS.indexOf("crystal") + 1);
    expect(currentStep(new Set(before), p)).toBe("shovel");
    expect(currentStep(new Set([...before, "shovel", "dig"]), p)).toBe("mine");
  });

  it("шаг «Шахта» — починка любой шахты острова (или лесопилка своя, по-старому)", async () => {
    const { factsSql } = await import("@/server/api/beta-raid/island/island-facts");
    const p = make(11).places;
    const sql = factsSql("acc_1", "isle_x", p);
    const part = sql.slice(sql.indexOf("AS crystal"), sql.indexOf("AS mine"));
    expect(part).toContain("FROM yuplink.raid_mine_op o");
    expect(part).toContain("o.kind = 'repair' AND o.map_id = 'isle_x' AND o.account_id = 'acc_1'");
    expect(part).toContain(`s.q = ${p.mine.q} AND s.r = ${p.mine.r}`);
    // Засчитанное не перепроверяем.
    const done = factsSql("acc_1", "isle_x", p, new Set(["mine"]));
    expect(done).toContain("true AS mine");
  });
});
