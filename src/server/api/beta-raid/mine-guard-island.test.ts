// Охрана шахты острова (ПРАВИЛА §8.59 п. 11): шахта живёт 7 дней и истощается —
// босс сбежал бы навсегда, поэтому охрану на шахту острова не ставят. Флаг на
// клетке мира правил острова не включает.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  mapId: "isle_abc123",
  config: { effect: "mine", resource: "wood", island: true } as Record<string, unknown>,
  cellReads: 0,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => [] }));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "me.near" }));
vi.mock("../../rateGate", () => ({ actionGate: async () => {} }));
vi.mock("./encounter-where", () => ({ myMapId: async () => s.mapId }));
vi.mock("../currency/move", () => ({ accAccountId: async () => "acc_me" }));
vi.mock("./building-action", () => ({
  loadCellBuilding: async () => ({ effect: "mine", tier: 0, tiers: [{}], config: s.config }),
}));
vi.mock("./chest/chest-row", () => ({
  isMyChestAt: async () => false,
  requireChestNear: async () => {},
  sqlRow: () => null,
}));
vi.mock("./mine-v2-read", () => ({
  loadMineCell: async () => {
    s.cellReads += 1;
    return { owner: "acc_other", view: null };
  },
}));
vi.mock("./market-backpack", () => ({ resolveBackpack: async () => null }));
vi.mock("./encounter-target", () => ({ loadEncounterTarget: async () => null }));
vi.mock("../../raidLive", () => ({ publishRaid: () => {} }));
vi.mock("./backpack-take-once", () => ({ opDone: async () => false, takeOneOrRelease: vi.fn() }));
vi.mock("./mine-guard-claim", () => ({ claimGuardSql: () => "" }));
vi.mock("@/server/api/beta-raid/chest/chest-guard-place", () => ({ placeChestGuard: vi.fn() }));
vi.mock("./mine-guard-read", () => ({
  abilityView: (x: unknown) => x,
  guardAbilities: () => [],
  guardAlive: () => false,
  guardViewIfAlive: () => null,
  loadGuardRow: async () => null,
}));

const { placeMineGuard } = await import("./mine-guard");
const place = placeMineGuard as unknown as (a: {
  data: { q: number; r: number; stackKey: string };
}) => Promise<unknown>;
const data = { q: 2, r: 3, stackKey: "boss:tpl_1" };

beforeEach(() => {
  s.mapId = "isle_abc123";
  s.config = { effect: "mine", resource: "wood", island: true };
  s.cellReads = 0;
});

describe("охрана шахты острова", () => {
  it("на острове — отказ ключом до чтения шахты", async () => {
    await expect(place({ data })).rejects.toThrow("braid.mine_island_no_guard");
    expect(s.cellReads).toBe(0);
  });

  it("в мире (флаг на клетке мира тоже) — обычные проверки владения", async () => {
    s.mapId = "maze";
    await expect(place({ data })).rejects.toThrow("Охрану можно поставить только на свою шахту");
    expect(s.cellReads).toBe(1);
  });
});
