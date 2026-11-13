// «Добыча» со всех этажей (жалоба 07.10.2026: «с шахт отдаётся только в
// основном мире»): шахты и поля аккаунта видны и собираются, где бы он ни
// стоял; чужой этаж подписан названием; события сбора — каждому этажу своё.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  claims: [] as string[],
  events: [] as Array<{ mapId: string | null; cells?: string[] }>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("../../auth", () => ({ getCurrentWallet: () => "me.near" }));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "me.near" }));
vi.mock("../currency/move", () => ({ accAccountId: async () => "acc_me" }));
vi.mock("./encounter-where", () => ({ myMapId: async () => "maze" }));
vi.mock("./floors", () => ({
  floorMaps: async (here: string) => [
    { id: here, floor: null },
    { id: "alpha", floor: "Мир Альфа" },
  ],
}));
vi.mock("./mine-pendings", () => ({
  ownedMineRows: async (mapId: string) =>
    mapId === "alpha"
      ? [
          {
            mapId,
            q: 5,
            r: 6,
            resource: "gold",
            token: null,
            yield: 2,
            claimedHours: 0,
            capturedAt: 1,
          },
        ]
      : [],
}));
vi.mock("./harvest-fields", () => ({
  myHarvestFields: async (mapId: string) =>
    mapId === "maze" ? [{ mapId, q: 1, r: 1, perHour: 1 }] : [],
}));
vi.mock("./mine-capture-log", () => ({ lostMineRows: async () => [] }));
vi.mock("../raid-rewards-pending", () => ({
  pendingRaidRewardsFor: async () => ({ sources: [], total: 0 }),
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    const m = /raid_mine_claim\('([^']+)', (-?\d+), (-?\d+)/.exec(sql);
    if (m) {
      s.claims.push(`${m[1]}:${m[2]},${m[3]}`);
      return [{ amt: 3 }];
    }
    return [];
  },
}));
vi.mock("../../raidLive", () => ({
  publishRaid: (e: { mapId: string | null; cells?: string[] }) => void s.events.push(e),
}));

const { getHarvestSummary } = await import("./harvest-summary");
const { claimAllMines } = await import("./mine-claim");
const summary = getHarvestSummary as unknown as () => Promise<{
  mines: Array<{ mapId: string; floor?: string | null }>;
  fields: Array<{ mapId: string; floor?: string | null }>;
}>;
const claimAll = claimAllMines as unknown as () => Promise<{ credited: Record<string, number> }>;

beforeEach(() => {
  s.claims = [];
  s.events = [];
});

describe("«Добыча» со всех этажей", () => {
  it("шахта главного мира видна на другом этаже — с подписью этажа", async () => {
    const r = await summary();
    expect(r.mines).toEqual([expect.objectContaining({ mapId: "alpha", floor: "Мир Альфа" })]);
    expect(r.fields).toEqual([expect.objectContaining({ mapId: "maze", floor: null })]);
  });

  it("«Собрать со всех шахт» берёт и с чужого этажа, событие — его карте", async () => {
    const r = await claimAll();
    expect(s.claims).toEqual(["alpha:5,6"]);
    expect(r.credited).toEqual({ gold: 3 });
    expect(s.events).toEqual([{ mapId: "alpha", type: "built", cells: ["5,6"], mine: true }]);
  });
});
