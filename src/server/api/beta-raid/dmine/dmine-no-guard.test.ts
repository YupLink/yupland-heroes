// На DARAI-шахту охрану не ставят (владелец, 22.10.2026: «на DARAI-шахту нельзя
// установить босса»): ручка отказывает до чтения владения и рюкзака, а закреп
// под локом шахты (mine-guard-claim) DARAI-клетку не признаёт «своей шахтой».
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  config: { resource: "token", token: "Darai", yield: 1000 } as Record<string, unknown>,
  cellReads: 0,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/db/mcpClient", () => ({ mcpExec: async () => [] }));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "me.tg" }));
vi.mock("@/server/rateGate", () => ({ actionGate: async () => {} }));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({ myMapId: async () => "rmap_1" }));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => "acc_me" }));
vi.mock("@/server/api/beta-raid/building-action", () => ({
  loadCellBuilding: async () => ({ effect: "mine", tier: 0, tiers: [{}], config: s.config }),
}));
vi.mock("@/server/api/beta-raid/chest/chest-row", () => ({
  isMyChestAt: async () => false,
  requireChestNear: async () => {},
  sqlRow: () => null,
}));
vi.mock("@/server/api/beta-raid/mine-v2-read", () => ({
  loadMineCell: async () => {
    s.cellReads += 1;
    return { owner: "acc_me", view: null };
  },
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({ resolveBackpack: async () => null }));
vi.mock("@/server/api/beta-raid/encounter-target", () => ({
  loadEncounterTarget: async () => null,
}));
vi.mock("@/server/raidLive", () => ({ publishRaid: () => {} }));
vi.mock("@/server/api/beta-raid/backpack-take-once", () => ({
  opDone: async () => false,
  takeOneOrRelease: vi.fn(),
}));
vi.mock("@/server/api/beta-raid/chest/chest-guard-place", () => ({ placeChestGuard: vi.fn() }));
vi.mock("@/server/api/beta-raid/mine-guard-read", () => ({
  abilityView: (x: unknown) => x,
  guardAbilities: () => [],
  guardAlive: () => false,
  guardViewIfAlive: () => null,
  loadGuardRow: async () => null,
}));

const { placeMineGuard } = await import("../mine-guard");
const { claimGuardSql } = await import("../mine-guard-claim");
const place = placeMineGuard as unknown as (a: {
  data: { q: number; r: number; stackKey: string };
}) => Promise<unknown>;
const data = { q: 2, r: 3, stackKey: "boss:tpl_1" };

beforeEach(() => {
  s.config = { resource: "token", token: "Darai", yield: 1000 };
  s.cellReads = 0;
});

describe("охрана на DARAI-шахту", () => {
  it("своя DARAI-шахта — отказ ключом до чтения владения", async () => {
    await expect(place({ data })).rejects.toThrow("dmine.no_guard");
    s.config = { resource: "token", token: "DARAI", yield: 1 };
    await expect(place({ data })).rejects.toThrow("dmine.no_guard");
    expect(s.cellReads).toBe(0);
  });

  it("прочие шахты (пыль, дерево) — прежние проверки", async () => {
    s.config = { resource: "token", token: "magicdust", yield: 1 };
    await expect(place({ data })).rejects.not.toThrow("dmine.no_guard");
    expect(s.cellReads).toBe(1);
  });

  it("закреп под локом шахты: DARAI-клетка «своей шахтой» не считается", () => {
    const sql = claimGuardSql({
      mapId: "rmap_1",
      q: 2,
      r: 3,
      account: "acc_me",
      templateId: "tpl_1",
      tpl: { name: "Тролль", maxHp: 10, interactionCost: 1 } as never,
      op: "guardplace:x",
    }).replace(/\s+/g, " ");
    expect(sql).toContain(
      "c.building_id IS NOT NULL AND NOT (yuplink.raid_mushroom_kind(c.building_config) IS NOT NULL))",
    );
  });
});
