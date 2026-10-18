// Подарки дня подписки при получении: боксы ложатся туда же, куда любые
// выданные боксы (chip_pack_grants → «Фишки → Паки»), по одному на штуку и
// ровно один раз; энергия — подарком (тает, в журнале ref esub:<подарок>).
import { beforeEach, describe, expect, it, vi } from "vitest";

const ev: string[] = [];
const taken = new Set<string>();

vi.mock("../db/pg", () => ({
  pg: {},
  sb: {
    rpc: async (_f: string, a: { p_amount: number; p_kind: string; p_ref?: string }) => {
      ev.push(`energy:${a.p_amount}:${a.p_kind}:${a.p_ref ?? "-"}`);
      return { error: null };
    },
  },
}));
vi.mock("./user-shared", () => ({ accountOf: async () => "acc_A" }));
vi.mock("./gifts-once", () => ({
  claimDeliverOnce: async (op: string) => (taken.has(op) ? false : (taken.add(op), true)),
  releaseDeliverOnce: async (op: string) => void taken.delete(op),
}));
vi.mock("./packs", () => ({
  grantPackToUser: async (o: { packId: string; source: string; sourceRef: string }) =>
    void ev.push(`box:${o.packId}:${o.source}:${o.sourceRef}`),
}));

const { deliverGift } = await import("./gifts-deliver");

const gift = (over: Record<string, unknown>) =>
  ({
    id: "gft_1",
    account_id: "acc_A",
    kind: "pack",
    amount: 3,
    ref_id: "cp_eu1k2rl8yG",
    title: "Bonus Box",
    image: null,
    note: "esub:Продвинутый|Advanced",
    status: "claimed",
    created_at: "",
    expires_ms: null,
    ...over,
  }) as Parameters<typeof deliverGift>[1];

beforeEach(() => {
  ev.length = 0;
  taken.clear();
});

describe("подарки дня подписки", () => {
  it("боксы — по одному гранту на штуку, повтор получения не выдаёт второй раз", async () => {
    await deliverGift("w.near", gift({}));
    await deliverGift("w.near", gift({}));
    expect(ev).toEqual([
      "box:cp_eu1k2rl8yG:admin_grant:gift:gft_1:p0",
      "box:cp_eu1k2rl8yG:admin_grant:gift:gft_1:p1",
      "box:cp_eu1k2rl8yG:admin_grant:gift:gft_1:p2",
    ]);
  });

  it("энергия подписки — подарком (тает), с меткой esub в журнале", async () => {
    await deliverGift("w.near", gift({ id: "gft_2", kind: "energy", amount: 1800, ref_id: "esub" }));
    expect(ev).toEqual(["energy:1800:energy_admin:esub:gft_2"]);
  });
});
