// Остров побольше (владелец, 17.10.2026: «чтобы человек поисследовал, ресурсы
// со временем спавнились»): клады, стартовая лодка, удочка в мастерской,
// возрождение простых боссов, четыре шахты (20.10). Старые острова читаются.
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
    const sql = digsSql("isle_abc", p.digs, "acc_1", 11).join("\n");
    for (const d of p.digs)
      expect(sql).toContain(`'isle_abc', ${d.q}, ${d.r}, now(), now(), 'acc_1', 'acc_1'`);
    for (const k of ["plank", "ore", "log", "stone", "goldIngot"] as const)
      expect(sql).toContain(ISLAND_ITEMS[k]);
    expect(sql).toContain("interval '90 days'");
  });

  it("готовой лодки нет — корабль строят на верфи (владелец, 17.10)", async () => {
    const { sql } = await write(11);
    expect(sql.some((q) => q.includes("INSERT INTO yuplink.beta_raid_ship"))).toBe(false);
    // Строка задания — по-прежнему последней (island-create).
    expect(sql.at(-1)).toContain("INSERT INTO yuplink.raid_island");
  });

  it("боссы — HP и цена удара шаблона (скидка энергии — при списании), награда своя", () => {
    const isl = make(11);
    const at = new Map(isl.cells.map((c) => [keyOf(c), c]));
    for (const m of isl.places.monsters) {
      const cfg = at.get(keyOf(m))?.objectConfig as Record<string, unknown>;
      expect(cfg.maxHp).toBeUndefined();
      expect(cfg.interactionCost).toBeUndefined();
      expect(cfg.rewardConfig).toBeTruthy();
    }
  });

  it("лесопилка — шахта v2 острова: без maxHours, флаг island, захвата нет", () => {
    const isl = make(11);
    const mine = isl.cells.find((c) => keyOf(c) === keyOf(isl.places.mine));
    expect(mine?.buildingConfig).toEqual({
      effect: "mine",
      resource: "wood",
      island: true,
      yield: 1,
      captureCost: 0,
    });
  });

  it("подарок острова в первом сундуке — один раз: уже получал — только доски", async () => {
    const { generateIsland } = await import("@/lib/raid/island/generate");
    const { spec } = await import("@/lib/raid/island/island.fixture");
    const { TEST_CATALOG: catalog } = await import("@/test/worldSpec");
    const chestOf = (gift: boolean) => {
      const isl = generateIsland(spec, catalog, 11, { gift });
      const at = isl.cells.find((c) => keyOf(c) === keyOf(isl.places.chest));
      return (at?.objectConfig as { rewardConfig: Record<string, unknown[]> }).rewardConfig;
    };
    const full = chestOf(true);
    expect(full.fillers).toEqual([
      expect.objectContaining({ kind: "custom", amount: 3, itemId: ISLAND_ITEMS.plank }),
      expect.objectContaining({ kind: "likes", amount: 150 }),
      expect.objectContaining({ kind: "resource", amount: 10, resource: "gold" }),
      expect.objectContaining({ kind: "energy", amount: 500 }),
    ]);
    expect(full.packs).toHaveLength(3);
    const bare = chestOf(false);
    expect(bare.fillers).toHaveLength(1);
    expect(bare.packs).toEqual([]);
  });

  it("призов на боссах нет — артефакт и пак падают с шансом (сервер)", () => {
    const isl = make(11);
    expect(isl.places.artifact).toBeNull();
    expect(isl.places.pack).toBeNull();
    const at = new Map(isl.cells.map((c) => [keyOf(c), c]));
    for (const m of isl.places.monsters) {
      const cfg = at.get(keyOf(m))?.objectConfig as { rewardConfig: Record<string, unknown[]> };
      expect(cfg.rewardConfig.items).toEqual([]);
      expect(cfg.rewardConfig.packs).toEqual([]);
    }
  });

  it("мастерская скупает камень, бревна и слитки золота — ресурсами счёта", async () => {
    const { sql } = await write(11);
    const sells = sql.filter((q) => q.includes("'sell'"));
    expect(sells).toHaveLength(3);
    const all = sells.join("\n");
    expect(all).toContain(`ci.id = '${ISLAND_ITEMS.stone}'`);
    expect(all).toContain("'stone', NULL, 1, 'sell'");
    expect(all).toContain("'wood', NULL, 2, 'sell'");
    expect(all).toContain("'gold', NULL, 10, 'sell'");
  });

  it("возрождение — всем боссам (призов нет), бродить нельзя", { timeout: 60_000 }, async () => {
    const { bossSpawnsSql } = await import("@/server/api/beta-raid/island/island-extras");
    for (const seed of MANY.slice(0, 10)) {
      const p = make(seed).places;
      const sql = bossSpawnsSql("isle_x", p).join("\n");
      const list = sql.slice(sql.indexOf("(c.q, c.r) IN ("), sql.indexOf("AND c.object_id"));
      const homes = [...list.matchAll(/\((-?\d+), (-?\d+)\)/g)].map((m) => `${m[1]},${m[2]}`);
      const plain = p.monsters.map(keyOf);
      expect(homes.sort(), `${seed}`).toEqual(plain.sort());
      expect(plain.length).toBe(50);
      expect(sql).toContain(`${ISLAND_BOSS_RESPAWN_MIN}, 0, 5`);
    }
  });

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
