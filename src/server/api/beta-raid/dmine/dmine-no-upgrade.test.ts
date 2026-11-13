// Ускорения у гриба DARAI нет (владелец, 22.10.2026: «ускорение фарма —
// недоступно»): у постройки-гриба со следующим ярусом окно не предлагает
// «Построить», а сервер отказывает до оплаты. Прочие постройки — как раньше.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  config: { resource: "token", token: "Darai", yield: 10000 } as Record<string, unknown> | null,
  sql: [] as string[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("FROM yuplink.raid_map_cells c")) {
      return [
        {
          building_id: "b1",
          building_config: s.config,
          name: "Бедный Юпик",
          meta: {
            effect: "mine",
            tiers: [
              { name: "Росток", costs: [{ resource: "gold", amount: 10 }] },
              { name: "Гриб побольше" },
            ],
          },
          building_skin_id: null,
          skin_name: null,
          skin_image: null,
          tier: 0,
        },
      ];
    }
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "me.tg" }));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({
  myMapId: async () => "rmap_1",
  playerCell: async () => ({ q: 2, r: 2 }),
  requireAdjacent: () => {},
}));
vi.mock("@/server/api/beta-raid/voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("@/server/api/beta-raid/hero-current", () => ({ selectedHero: async () => null }));
vi.mock("@/server/api/beta-raid/building-extra", () => ({ buildingExtra: async () => null }));
vi.mock("@/server/api/achievements/gate", () => ({
  islandGateBlock: async () => null,
  islandGateText: () => "",
  requireIslandGate: async () => {},
}));
vi.mock("@/server/raidLive", () => ({ publishRaid: () => {} }));
vi.mock("@/server/api/beta-raid/econ/trade-hooks", () => ({ noteEnergyInPrices: () => {} }));

const { buildNextTier, getBuildingOffer } = await import("../building-action");
type Fn = (a: { data: { q: number; r: number } }) => Promise<Record<string, unknown>>;
const offer = getBuildingOffer as unknown as Fn;
const build = buildNextTier as unknown as Fn;

beforeEach(() => {
  s.config = { resource: "token", token: "Darai", yield: 10000 };
  s.sql.length = 0;
});

describe("гриб DARAI не улучшают", () => {
  it("окно: следующего яруса нет — кнопки «Построить» нет", async () => {
    const o = await offer({ data: { q: 3, r: 2 } });
    expect(o).toMatchObject({ canBuild: false, final: true, nextName: null, blockReason: null });
  });

  it("сервер: отказ до занятия ступени и оплаты", async () => {
    await expect(build({ data: { q: 3, r: 2 } })).rejects.toThrow("dmine.no_upgrade");
    expect(s.sql.some((x) => x.includes("beta_raid_building_state (map_id"))).toBe(false);
  });

  it("прочая шахта с ярусом выше — «Построить» по-прежнему есть", async () => {
    s.config = { resource: "token", token: "magicdust", yield: 1 };
    const o = await offer({ data: { q: 3, r: 2 } });
    expect(o).toMatchObject({ canBuild: true, final: false, nextName: "Гриб побольше" });
  });
});
