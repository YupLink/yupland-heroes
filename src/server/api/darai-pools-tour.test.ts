// Фонд идущего турнира — в раскладке «что уже чьё-то». Бронь уменьшает пул
// карты на фонд, а деньги остаются на кошельке: без отдельной строки
// «свободно к раздаче» выросло бы ровно на фонд, и авторассылка раздала бы
// призы турнира холдерам.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = { row: {} as Record<string, string> };

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (fn: unknown) => fn }),
}));
vi.mock("../auth", () => ({ requireAdmin: () => undefined }));
vi.mock("../db/mcpClient", () => ({ mcpExec: async () => [st.row] }));
vi.mock("./darai-pools-refresh", () => ({
  refreshPoolDeposits: async () => undefined,
  unsettledDeposits: () => 0,
}));
vi.mock("./darai-pools-sync", () => ({
  POOL_RECEIVER_WALLET: "darai_gdrop.near",
  POOL_SOURCE_WALLET: "darai_collection.near",
  syncCollectionDeposits: async () => ({ unsettled: 0 }),
}));
vi.mock("./token-free-pool", () => ({ tokenOnMap: async () => 0 }));
vi.mock("./payouts-balance", () => ({ fetchDaraiBalance: async () => 1000n }));
vi.mock("../near", () => ({ rawToHuman: () => "1000" }));

const { daraiPools } = await import("./darai-pools");
const { POOLS_SQL } = await import("./darai-pools-sql");

describe("фонды турниров в раскладке пула", () => {
  beforeEach(() => {
    // Кошелёк 1000: пул карты 700 (было 750, 50 ушло бронью турнира), счета 100.
    st.row = { map_reserved: "700", players: "100", tournaments: "0" };
  });

  it("без турниров свободно = кошелёк − пул − счета", async () => {
    const p = await daraiPools();
    expect(p.tournamentFunds).toBe(0);
    expect(p.payoutAvailable).toBe(200);
  });

  it("фонд идущего турнира свободным не считается", async () => {
    st.row.tournaments = "50";
    const p = await daraiPools();
    expect(p.tournamentFunds).toBe(50);
    expect(p.payoutAvailable).toBe(150);
  });

  it("строгий режим авторассылки вычитает фонд так же", async () => {
    st.row.tournaments = "50";
    expect((await daraiPools({ strict: true })).payoutAvailable).toBe(150);
  });

  it("запрос берёт идущие и выплачиваемые турниры, черновики и готовые — нет", () => {
    expect(POOLS_SQL).toMatch(/sum\(fund_darai\)[\s\S]*FROM yuplink\.tournament/);
    expect(POOLS_SQL).toMatch(/status IN \('running', 'paying'\) AND NOT dry\)::text\s+AS tournaments/);
  });
});
