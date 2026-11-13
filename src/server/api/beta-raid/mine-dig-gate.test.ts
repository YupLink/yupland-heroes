// Лопата на клетке шахты (§8.59 п. 9): ни «Копать», ни «Закопать», ни
// «Выкопать», и сундук туда не поставить.
//
// Три из четырёх уже закрывал признак здания (buildingHeldSql — шахта тоже
// здание): «Копать» (ground-dig-sql), «Закопать» (requireNotUnderBuilding),
// сундук (CELL_HELD). «Выкопать» под зданием открыт нарочно (бугорок под новым
// зданием иначе застрял бы) — для шахты его закрывает requireNotOnMine, и
// отказ приходит до энергии и лопаты.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  mine: true,
  /** Мешочек и сундук — бугорок (выкопать) или нет (закопать). */
  buried: true,
  sql: [] as string[],
  paid: 0,
  backpack: 0,
  built: 0,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let check: (d: unknown) => unknown = (d) => d;
    const fn = {
      inputValidator: (v: (d: unknown) => unknown) => ((check = v), fn),
      handler: (h: (a: { data: unknown }) => unknown) => (a: { data: unknown }) =>
        h({ data: check(a.data) }),
    };
    return fn;
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return sql.includes("AS mine FROM yuplink.raid_map_cells c") ? [{ mine: s.mine }] : [];
  },
}));
vi.mock("@/server/raidLive", () => ({ publishRaid: () => {} }));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => (s.backpack++, null),
}));
vi.mock("@/server/api/beta-raid/loot-bag/bag-dig-pay", () => ({
  payDig: async () => (s.paid++, { refund: async () => {} }),
}));
vi.mock("@/server/api/beta-raid/loot-bag/bag-actor", () => ({
  bagActor: async () => ({ wallet: "w1", mapId: "m1", account: "acc1" }),
  bagNear: async () => ({ id: "lb_1", q: 4, r: 5, buried: s.buried, alive: true }),
  blockedAt: async () => null,
  requireNotUnderBuilding: async () => {
    s.built++;
    throw new Error("dig.under_building");
  },
}));
vi.mock("@/server/api/beta-raid/plain-chest/pchest-row", () => ({
  pchestActor: async () => ({ wallet: "w1", mapId: "m1", account: "acc1" }),
  loadOp: async () => null,
  loadPlainChest: async () => ({ id: "pc_1", buried: s.buried }),
}));
vi.mock("@/server/api/beta-raid/chest/chest-row", () => ({
  loadChest: async () => null,
  requireChestNear: async () => {},
  sqlRow: () => undefined,
}));

import { requireNotOnMine } from "@/server/api/beta-raid/mine-dig-gate";
import { mineCellSql } from "@/server/api/beta-raid/mine-cell-sql";
import { buildingHeldSql } from "@/server/api/beta-raid/cell-sql";
import { groundCellSql } from "@/server/api/beta-raid/main-tool/ground-dig-sql";
import { CELL_HELD, cellFlagsSql } from "@/server/api/beta-raid/chest/chest-cell";
import { buryLootBag, digLootBag } from "@/server/api/beta-raid/loot-bag/bag-dig";
import { buryChest, digChest } from "@/server/api/beta-raid/plain-chest/pchest-dig";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const call = (fn: unknown, data: object) => (fn as Fn)({ data });
const BAG = { bagId: `lb_${"a".repeat(32)}`, op: "press-1" };
const CELL = { q: 4, r: 5, op: "press-2" };

beforeEach(() => {
  Object.assign(s, { mine: true, buried: true, sql: [], paid: 0, backpack: 0, built: 0 });
});

describe("requireNotOnMine", () => {
  it("шахта — отказ dig.under_mine; нет шахты или клетки — можно", async () => {
    await expect(requireNotOnMine("m1", 4, 5)).rejects.toThrow("dig.under_mine");
    expect(s.sql[0]).toContain(`SELECT ${mineCellSql("c")} AS mine`);
    expect(s.sql[0]).toContain("c.map_id = 'm1' AND c.q = 4 AND c.r = 5");
    s.mine = false;
    await expect(requireNotOnMine("m1", 4, 5)).resolves.toBeUndefined();
  });
});

describe("лопата на шахте: отказ до энергии и лопаты", () => {
  it("выкопать мешочек и сундук — нельзя (под прочим зданием можно)", async () => {
    await expect(call(digLootBag, BAG)).rejects.toThrow("dig.under_mine");
    await expect(call(digChest, CELL)).rejects.toThrow("dig.under_mine");
    expect(s.paid + s.backpack).toBe(0);
  });

  it("закопать — тоже нельзя, и отказ — про шахту, а не про здание", async () => {
    s.buried = false;
    s.mine = false;
    // Не шахта: закапывание упирается в обычный запрет здания (мок бросает его).
    await expect(call(buryChest, CELL)).rejects.toThrow("dig.under_building");
    s.mine = true;
    s.built = 0;
    await expect(call(buryLootBag, BAG)).rejects.toThrow("dig.under_mine");
    await expect(call(buryChest, CELL)).rejects.toThrow("dig.under_mine");
    expect(s.built + s.paid + s.backpack).toBe(0);
  });
});

describe("что уже закрыто признаком здания (шахта — здание)", () => {
  it("«Копать» землю: клетка с постройкой — ok=false", () => {
    expect(buildingHeldSql("c")).toContain("c.building_id IS NOT NULL");
    expect(groundCellSql({ mapId: "m1", q: 4, r: 5 })).toContain(`AND NOT ${buildingHeldSql("c")}`);
  });

  it("сундук на клетку шахты не встаёт: CELL_HELD держит постройку", () => {
    expect(cellFlagsSql("m1", 4, 5)).toContain(`SELECT ${buildingHeldSql("c")} AS building`);
    expect(CELL_HELD).toContain("f.building");
  });
});
