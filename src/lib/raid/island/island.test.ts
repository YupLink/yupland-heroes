// Остров новичка: небольшой, вода по краю, одно место на каждую роль задания,
// к каждой цели есть проход ногами от старта, тот же сид — тот же остров.
import { describe, expect, it } from "vitest";
import { DIRS, keyOf } from "@/lib/raid/zonegen/town/hex";
import { axialToOffset } from "@/lib/hex-renderer";
import { ISLAND_SIZE } from "@/lib/raid/island/shape";
import {
  ISLAND_BUILDINGS,
  ISLAND_COUNTS,
  ISLAND_DECOR,
  ISLAND_OBJECTS,
  WEAK_BOSSES,
} from "@/lib/raid/island/catalog";
import { currentStep, parsePlaces, stepTarget, ISLAND_STEP_IDS } from "@/lib/raid/island/steps";
import { TEST_CATALOG, WATER } from "@/test/worldSpec";
import { generateIsland } from "@/lib/raid/island/generate";
import type { Cell } from "@/lib/raid/worldgen/geo";
import { MANY, SEEDS, isWater, make, reach, spec } from "@/lib/raid/island/island.fixture";

describe("остров новичка", () => {
  it(`рамка ${ISLAND_SIZE} × ${ISLAND_SIZE}, по краю — вода, суша посередине`, () => {
    for (const seed of SEEDS) {
      const isl = make(seed);
      expect(isl.cells).toHaveLength(ISLAND_SIZE * ISLAND_SIZE);
      const edge = isl.cells.filter((c) => {
        const { col, row } = axialToOffset(c.q, c.r);
        return col === 0 || row === 0 || col === ISLAND_SIZE - 1 || row === ISLAND_SIZE - 1;
      });
      expect(edge.every((c) => isWater(c.terrainId))).toBe(true);
      const land = isl.cells.filter((c) => !isWater(c.terrainId)).length;
      // Рамка 20 — ~150 клеток суши, 26 — ~245, 64 (19.10) — ~1450.
      expect(land).toBeGreaterThan(1200);
      expect(land).toBeLessThan(1800);
    }
  });

  it("тот же сид — тот же остров, другой сид — другой", () => {
    // Мимо кэша фикстуры: два честных прогона генератора.
    expect(generateIsland(spec, TEST_CATALOG, 11)).toEqual(generateIsland(spec, TEST_CATALOG, 11));
    expect(make(11).cells).not.toEqual(make(222).cells);
  });

  it("у каждой роли своя клетка на суше, и на ней стоит своё", () => {
    for (const seed of SEEDS) {
      const isl = make(seed);
      const p = isl.places;
      const all = [
        p.spawn,
        p.chest,
        p.workshop,
        p.mine,
        ...p.mines,
        p.treasure,
        p.portal,
        ...p.trees,
        ...p.monsters,
        ...p.crystals,
        ...p.digs,
      ];
      // Клады под дубами и камнями делят клетку с декором — остальное врозь.
      const decor = new Set([...p.trees, ...p.crystals].map(keyOf));
      const under = p.digs.filter((d) => decor.has(keyOf(d)));
      expect(under.length).toBe(ISLAND_COUNTS.digsUnderDecor);
      expect(new Set(all.map(keyOf)).size).toBe(all.length - under.length);
      expect(p.trees.length).toBe(ISLAND_COUNTS.trees);
      expect(p.crystals.length).toBe(ISLAND_COUNTS.crystals);
      expect(p.digs.length).toBe(ISLAND_COUNTS.digs);
      const at = new Map(isl.cells.map((c) => [keyOf(c), c]));
      for (const c of all) expect(isWater(at.get(keyOf(c))?.terrainId ?? WATER)).toBe(false);
      expect(at.get(keyOf(p.chest))?.objectId).toBe(ISLAND_OBJECTS.chest);
      for (const t of p.trees) expect(at.get(keyOf(t))?.decorationId).toBe(ISLAND_DECOR.oak);
      for (const c of p.crystals) expect(at.get(keyOf(c))?.decorationId).toBe(ISLAND_DECOR.stone);
      expect(at.get(keyOf(p.monsters[0]))?.objectId).toBe(ISLAND_OBJECTS.slime);
      const weak: string[] = WEAK_BOSSES.map((b) => b.id);
      for (const m of p.monsters) expect(weak).toContain(at.get(keyOf(m))?.objectId);
      expect(at.get(keyOf(p.workshop))).toMatchObject({
        buildingId: ISLAND_BUILDINGS.workshop,
        buildingConfig: { effect: "market" },
      });
      expect(at.get(keyOf(p.mine))?.buildingId).toBe(ISLAND_BUILDINGS.mine);
      expect(at.get(keyOf(p.portal))).toMatchObject({
        buildingId: ISLAND_BUILDINGS.portal,
        tier: 0,
        // Проход в мир — герою от 5 уровня (19.10).
        buildingConfig: { portal: { levelFromOn: true, levelFrom: 5, levelToOn: false } },
      });
      for (const c of [p.spawn, p.treasure, ...p.digs.filter((d) => !decor.has(keyOf(d)))])
        expect(at.get(keyOf(c))).toMatchObject({
          decorationId: null,
          objectId: null,
          buildingId: null,
        });
      // Верфь — на суше, рядом мелководье (туда спускается корабль).
      const yard = p.shipyard as Cell;
      expect(isWater(at.get(keyOf(yard))?.terrainId ?? "")).toBe(false);
      expect(at.get(keyOf(yard))?.buildingId).toBe(ISLAND_BUILDINGS.shipyard);
      const shore = DIRS.map(([dq, dr]) => at.get(keyOf({ q: yard.q + dq, r: yard.r + dr })));
      expect(shore.some((c) => c && c.terrainId === WATER)).toBe(true);
    }
  });

  // Много островов подряд: при общем прогоне (все тесты разом) дольше 5 с.
  it("от старта ногами дойти до каждой цели (или встать рядом с ней)", { timeout: 60_000 }, () => {
    for (const seed of [...SEEDS, ...MANY]) {
      const isl = make(seed);
      const ok = reach(isl);
      const p = isl.places;
      const targets = [
        p.chest,
        p.workshop,
        p.mine,
        ...p.mines,
        p.treasure,
        p.portal,
        ...p.trees,
        ...p.monsters,
        ...p.crystals,
        ...p.digs,
        p.shipyard as Cell,
      ];
      for (const t of targets) {
        const near = [t, ...DIRS.map(([dq, dr]) => ({ q: t.q + dq, r: t.r + dr }))];
        expect(
          near.some((c) => ok.has(keyOf(c))),
          `${seed}: ${keyOf(t)}`,
        ).toBe(true);
      }
    }
  });

  it("городов три (21.10): у каждого ратуша с настройкой, лавки привязаны к своей", () => {
    for (const seed of SEEDS) {
      const isl = make(seed);
      expect(isl.halls.length, `${seed}`).toBe(3);
      const halls = new Set(isl.halls.map((h) => `${h.q},${h.r}`));
      expect(halls.size).toBe(3);
      for (const h of isl.halls) expect(h.config).toBeTruthy();
      for (const s of isl.shops) expect(halls.has(`${s.hallQ},${s.hallR}`)).toBe(true);
      // Ратуша главного города — замок задания.
      expect(isl.places.hall).toEqual({ q: isl.halls[0].q, r: isl.halls[0].r });
    }
  });
});

describe("шаги задания", () => {
  it("текущий — первый незасчитанный, всё засчитано — null", () => {
    expect(currentStep(new Set())).toBe("hello");
    // Герой выбирается сразу после приветствия (25.10).
    expect(currentStep(new Set(["hello", "walk", "axe"]))).toBe("hero_pick");
    expect(currentStep(new Set(["hello", "hero_pick", "walk", "axe"]))).toBe("chest");
    expect(currentStep(new Set(ISLAND_STEP_IDS))).toBeNull();
  });

  it("роли из базы: мусор — null, цель шага — своя клетка", () => {
    expect(parsePlaces({ spawn: { q: 1 } })).toBeNull();
    const p = make(11).places;
    const back = parsePlaces(JSON.parse(JSON.stringify(p)));
    expect(back).toEqual(p);
    expect(stepTarget("chest", p)).toEqual(p.chest);
    expect(stepTarget("dig", p)).toEqual(p.treasure);
    expect(stepTarget("hello", p)).toBeNull();
  });
});

describe("снос острова", () => {
  it("сносит только карту острова — со всем оставленным; живой мир и этажи нельзя", async () => {
    const { dropIslandSql } = await import("@/server/api/beta-raid/island/island-write");
    expect(() => dropIslandSql("rmap_UthOURxc")).toThrow("island.not_island");
    const sql = dropIslandSql("isle_abc").join("\n");
    expect(sql).toContain("DELETE FROM yuplink.raid_map_journal WHERE map_id = 'isle_abc'");
    // Оставленное на острове уходит вместе с ним (владелец, 14.10).
    for (const t of [
      "raid_warehouse_slot",
      "raid_magic_chest",
      "raid_plain_chest_slot",
      "raid_plain_chest",
      "beta_raid_ship",
      "raid_field_worker",
      "raid_fishing",
      "raid_mob_spawn",
      "raid_mine_op",
    ])
      expect(sql).toMatch(new RegExp(`DELETE FROM yuplink\\.${t}\\s`));
    // Только по карте острова.
    expect(sql).not.toMatch(/WHERE map_id = '(?!isle_abc')/);
  });
});

describe("остров после выхода", () => {
  it("новый остров занимает строку только без карты — живую не перезаписывает", async () => {
    const { islandSql } = await import("@/server/api/beta-raid/island/island-write");
    const sql = islandSql({
      mapId: "isle_new",
      name: "Остров",
      account: "acc_1",
      seed: 11,
      island: make(11),
      by: "w",
    }).at(-1) as string;
    expect(sql).toContain("ON CONFLICT (account_id) DO UPDATE");
    expect(sql).toContain("WHERE yuplink.raid_island.map_id IS NULL");
    expect(sql).toContain("finished_at = NULL");
  });

  it("карта острова без строки задания — для демо-острова", async () => {
    const { islandMapSql, islandSql } = await import("@/server/api/beta-raid/island/island-write");
    const o = { mapId: "isle_demo", name: "Демо-остров", account: "acc_1", seed: 11, island: make(11), by: "w" };
    const map = islandMapSql(o);
    expect(islandSql(o)).toEqual([...map, islandSql(o).at(-1)]);
    expect(map.some((q) => q.includes("yuplink.raid_island "))).toBe(false);
  });
});

describe("клад", () => {
  it("id мешочка — в формате ручек мешочка: lb_ + md5", async () => {
    const { treasureIdSql } = await import("@/server/api/beta-raid/island/island-write");
    expect(treasureIdSql("isle_abc")).toBe("'lb_' || md5('island:isle_abc')");
    const { createHash } = await import("node:crypto");
    const id = `lb_${createHash("md5").update("island:isle_abc").digest("hex")}`;
    expect(id).toMatch(/^lb_[0-9a-f]{32}$/);
  });
});
