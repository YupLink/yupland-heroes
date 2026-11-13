// Источники билетов платят золотом (§8.61): подарок/приз турнира, награда карты
// (сундук, моб, фонд, возврат), урожай грядки «билетов» — 100 золота за билет,
// мимо ticket_move (его подмена оставила бы след «ticket_move» в событиях).
// База и соседние выдачи — подмены.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ ev: [] as string[], sql: [] as string[] }));

vi.mock("@/server/db/pg", () => ({ pg: {}, sb: { rpc: async () => ({ error: null }) } }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => (s.sql.push(sql.replace(/\s+/g, " ")), []),
}));
vi.mock("./tickets-ledger", () => ({
  moveTickets: async () => void s.ev.push("ticket_move"),
}));
vi.mock("./gold-earn", () => ({
  creditGoldForTickets: async (o: {
    account?: string;
    wallet?: string;
    tickets: number;
    kind: string;
    ref: string;
  }) => {
    s.ev.push(`gold:${o.account ?? o.wallet}:${o.tickets * 100}:${o.kind}:${o.ref}`);
    return o.tickets * 100;
  },
}));
vi.mock("./raid-reward-extra", () => ({
  grantExtraReward: async (o: {
    kind: string;
    amount: number;
    ref: string;
    opRef: string;
    origin?: string | null;
  }) => void s.ev.push(`extra:${o.kind}:${o.ref}:${o.amount}:${o.opRef}:${o.origin ?? "-"}`),
}));
vi.mock("./user-shared", () => ({ accountOf: async () => "acc_A" }));
vi.mock("./energy-credit", () => ({ creditEnergy: async () => {} }));
vi.mock("./beta-raid/market-backpack", () => ({
  resolveBackpack: async () => null,
  depositToBackpack: async () => {},
  assertBackpackRoom: async () => {},
  stackKeyFor: async () => "",
}));

const { deliverGift } = await import("./gifts-deliver");
const { grantRaidReward } = await import("./raid-helpers");
const { giveFieldReward } = await import("./beta-raid/field-reward");

beforeEach(() => {
  s.ev.length = 0;
  s.sql.length = 0;
});

describe("билеты-награды → золото ×100", () => {
  it("подарок (и приз турнира) билетами — золото на аккаунт подарка, вид gift, ключ подарка", async () => {
    await deliverGift("w", {
      id: "gft_1",
      account_id: "acc_G",
      kind: "tickets",
      amount: 3,
      ref_id: null,
      title: null,
      image: null,
      note: null,
      status: "claimed",
      created_at: "",
      expires_ms: null,
    });
    expect(s.ev).toEqual(["gold:acc_G:300:gift:gift:gft_1"]);
  });

  it("награда карты билетами — ресурс «золото» тем же путём, что ресурс-награда", async () => {
    await grantRaidReward("w", "tickets", 2, null, "rr_1", { origin: "mob" });
    await grantRaidReward("w", "tickets", 0.5, null, "portal:x:back");
    expect(s.ev).toEqual([
      "extra:resource:gold:200:rr_1:mob",
      "extra:resource:gold:50:portal:x:back:-",
    ]);
  });

  it("грядка «билетов» — золото видом field, не шахтной функцией", async () => {
    await giveFieldReward({
      wallet: "w",
      account: "acc_1",
      reward: { kind: "resource", resource: "tickets", token: null },
      units: 3,
      ref: "field-leave:m1:1:2:acc_1:x",
      nonce: "n1",
    });
    expect(s.sql[0]).toContain(
      "SELECT yuplink.res_move('acc_1', 'gold', 300, 'field', 'field-leave:m1:1:2:acc_1:x') FROM claim",
    );
    expect(s.sql[0]).not.toContain("raid_mine_credit");
  });
});
