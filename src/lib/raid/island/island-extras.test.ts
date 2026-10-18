// Остров побольше (владелец, 17.10.2026: «чтобы человек поисследовал, ресурсы
// со временем спавнились»): клады, стартовая лодка, удочка в мастерской,
// возрождение простых боссов, лесопилка 6 в час. Старые острова читаются.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { keyOf } from "@/lib/raid/zonegen/town/hex";
import {
  ISLAND_BOSS_RESPAWN_MIN,
  ISLAND_BUILDINGS,
  ISLAND_ITEMS,
  ISLAND_RECIPES,
} from "@/lib/raid/island/catalog";
import { parsePlaces } from "@/lib/raid/island/steps";
import type { Cell } from "@/lib/raid/worldgen/geo";
import { MANY, make } from "@/lib/raid/island/island.fixture";

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

const write = async (seed: number) => {
  const { islandSql } = await import("@/server/api/beta-raid/island/island-write");
  const island = make(seed);
  const sql = islandSql({
    mapId: "isle_new",
    name: "Остров",
    account: "acc_1",
    seed,
    island,
    by: "w",
  });
  return { island, sql };
};

describe("остров побольше", () => {
  it("старый остров без кладов и верфи читается: клады [] и верфи нет", () => {
    const old = { ...make(11).places } as Record<string, unknown>;
    delete old.digs;
    delete old.shipyard;
    const back = parsePlaces(JSON.parse(JSON.stringify(old)));
    expect(back?.digs).toEqual([]);
    expect(back?.shipyard).toBeNull();
  });

  it("клады: id в формате ручек мешочка, у каждого свой, мешочек закопан игроком", async () => {
    const { digIdSql, digsSql } = await import("@/server/api/beta-raid/island/island-extras");
    expect(digIdSql("isle_abc", 1)).toBe("'lb_' || md5('island:isle_abc:1')");
    const ids = [1, 2, 3, 4].map((n) => `lb_${md5(`island:isle_abc:${n}`)}`);
    for (const id of ids) expect(id).toMatch(/^lb_[0-9a-f]{32}$/);
    expect(new Set([...ids, `lb_${md5("island:isle_abc")}`]).size).toBe(5);
    const p = make(11).places;
    const sql = digsSql("isle_abc", p.digs, "acc_1").join("\n");
    for (const d of p.digs)
      expect(sql).toContain(`'isle_abc', ${d.q}, ${d.r}, now(), now(), 'acc_1', 'acc_1'`);
    expect(sql).toContain(ISLAND_ITEMS.plank);
    expect(sql).toContain(ISLAND_ITEMS.ore);
    expect(sql).toContain("interval '90 days'");
  });

  it("готовой лодки нет — корабль строят на верфи (владелец, 17.10)", async () => {
    const { sql } = await write(11);
    expect(sql.some((q) => q.includes("INSERT INTO yuplink.beta_raid_ship"))).toBe(false);
    // Строка задания — по-прежнему последней (island-create).
    expect(sql.at(-1)).toContain("INSERT INTO yuplink.raid_island");
  });

  it("боссы — HP и цена удара шаблона (без скидок острова), награда своя", () => {
    const isl = make(11);
    const at = new Map(isl.cells.map((c) => [keyOf(c), c]));
    for (const m of isl.places.monsters) {
      const cfg = at.get(keyOf(m))?.objectConfig as Record<string, unknown>;
      expect(cfg.maxHp).toBeUndefined();
      expect(cfg.interactionCost).toBeUndefined();
      expect(cfg.rewardConfig).toBeTruthy();
    }
  });

  it("лесопилка: 1 дерево в час, захват за 10, не дольше недели", () => {
    const isl = make(11);
    const mine = isl.cells.find((c) => keyOf(c) === keyOf(isl.places.mine));
    expect(mine?.buildingConfig).toEqual({
      resource: "wood",
      yield: 1,
      captureCost: 10,
      maxHours: 168,
    });
  });

  it("подарочные артефакт и пак — один раз: уже получал — призовых боссов нет", async () => {
    const { generateIsland } = await import("@/lib/raid/island/generate");
    const { spec } = await import("@/lib/raid/island/island.fixture");
    const { TEST_CATALOG: catalog } = await import("@/test/worldSpec");
    const none = generateIsland(spec, catalog, 11, { artifact: false, pack: false });
    expect(none.places.artifact).toBeNull();
    expect(none.places.pack).toBeNull();
    const all = generateIsland(spec, catalog, 11, { artifact: true, pack: true });
    expect(all.places.artifact).not.toBeNull();
    expect(all.places.pack).not.toBeNull();
  });

  it(
    "возрождение — только простым боссам: призовым нет, бродить нельзя",
    { timeout: 60_000 },
    async () => {
      const { bossSpawnsSql } = await import("@/server/api/beta-raid/island/island-extras");
      for (const seed of MANY.slice(0, 10)) {
        const p = make(seed).places;
        const sql = bossSpawnsSql("isle_x", p).join("\n");
        const list = sql.slice(sql.indexOf("(c.q, c.r) IN ("), sql.indexOf("AND c.object_id"));
        const homes = [...list.matchAll(/\((-?\d+), (-?\d+)\)/g)].map((m) => `${m[1]},${m[2]}`);
        const prize = [p.artifact, p.pack].map((c) => keyOf(c as Cell));
        const plain = p.monsters.map(keyOf).filter((k) => !prize.includes(k));
        expect(homes.sort(), `${seed}`).toEqual(plain.sort());
        expect(plain.length).toBeGreaterThanOrEqual(3);
        expect(sql).toContain(`${ISLAND_BOSS_RESPAWN_MIN}, 0, 5`);
      }
    },
  );

  it("удочка в мастерской: рецепт за бревна, товар — «Удочка»", async () => {
    const rod = ISLAND_RECIPES.find((r) => r.id === "rod");
    expect(rod && ISLAND_ITEMS[rod.give]).toBe("cst_rew3z8sxs897");
    expect(rod?.cost).toEqual([{ item: "log", n: 2 }]);
    const { sql } = await write(11);
    const item = sql.find((q) => q.includes("'isle_new_rod'")) ?? "";
    expect(item).toContain("ci.id = 'cst_rew3z8sxs897'");
    expect(item).toContain(`'custom', '${ISLAND_ITEMS.log}', 2`);
  });

  it("лесопилка острова — это лесопилка", () => {
    const isl = make(11);
    const mine = isl.cells.find((c) => keyOf(c) === keyOf(isl.places.mine));
    expect(mine?.buildingId).toBe(ISLAND_BUILDINGS.mine);
  });
});
