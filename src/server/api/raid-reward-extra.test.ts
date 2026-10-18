// Выдача новых видов: ресурс зовёт кредит счёта, товар — рюкзак героя.
// Базы и сети здесь нет — проверяем, ЧТО именно позвано и с какими ключами.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  sql: [] as string[],
  hero: null as null | { heroId: string; capacity: number; potionCapacity: number },
  meta: null as null | { name: string; image: string | null },
  room: null as null | Error,
  deposits: [] as Array<Record<string, unknown>>,
}));

vi.mock("../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    state.sql.push(sql);
    return [];
  },
}));
vi.mock("./user-shared", () => ({ accountOf: async () => "acc_1" }));
vi.mock("./beta-raid/item-alias", () => ({
  canonCustomMeta: async () => state.meta,
}));
vi.mock("./beta-raid/market-backpack", () => ({
  resolveBackpack: async () => state.hero,
  stackKeyFor: async () => "custom:cst_wheat",
  assertBackpackRoom: async () => {
    if (state.room) throw state.room;
  },
  depositToBackpack: async (opts: Record<string, unknown>) => {
    state.deposits.push(opts);
  },
}));

import { grantExtraReward } from "./raid-reward-extra";

beforeEach(() => {
  state.sql = [];
  state.hero = { heroId: "hero_1", capacity: 10, potionCapacity: 3 };
  state.meta = { name: "Пшеница", image: "ipfs://wheat" };
  state.room = null;
  state.deposits = [];
});

describe("ресурс", () => {
  const flat = (s: string) => s.replace(/\s+/g, " ");

  it("зачисляется функцией счёта, ключ повтора — ref награды", async () => {
    await grantExtraReward({
      kind: "resource",
      wallet: "w.near",
      amount: 40,
      ref: "gold",
      opRef: "raidtour:map1:c3:rr_abc",
    });
    expect(state.sql).toHaveLength(1);
    const sql = flat(state.sql[0]);
    expect(sql).toContain(
      "SELECT yuplink.res_move('acc_1', 'gold', 40, 'reward', 'raidtour:map1:c3:rr_abc') FROM fresh",
    );
  });

  it("происхождение в журнале: с моба — вид 'mob', прочие награды — 'reward', не 'mine'", async () => {
    const base = { kind: "resource" as const, wallet: "w", amount: 3, ref: "stone" };
    await grantExtraReward({ ...base, opRef: "raidtour:m:c1:rr_1", origin: "mob" });
    await grantExtraReward({ ...base, opRef: "raidtour:m:c1:rr_2" });
    await grantExtraReward({ ...base, opRef: "raidtour:m:c1:rr_4", origin: "loot" });
    expect(flat(state.sql[0])).toContain("'stone', 3, 'mob', 'raidtour:m:c1:rr_1'");
    expect(flat(state.sql[1])).toContain("'stone', 3, 'reward', 'raidtour:m:c1:rr_2'");
    expect(flat(state.sql[2])).toContain("'stone', 3, 'reward', 'raidtour:m:c1:rr_4'");
    expect(state.sql.join(" ")).not.toContain("raid_mine_credit");
  });

  it("строку, уже зачисленную любым видом ('mine' до 28.09, 'mob', 'reward'), не зачисляем", async () => {
    await grantExtraReward({
      kind: "resource",
      wallet: "w",
      amount: 1,
      ref: "wood",
      opRef: "raidtour:m:c1:rr_3",
      origin: "mob",
    });
    expect(flat(state.sql[0])).toContain(
      "WHERE NOT EXISTS ( SELECT 1 FROM yuplink.res_ledger WHERE kind IN ('mine', 'mob', 'reward') AND ref = 'raidtour:m:c1:rr_3')",
    );
  });

  it("чужой код не выдаётся — награда остаётся в очереди", async () => {
    await expect(
      grantExtraReward({ kind: "resource", wallet: "w", amount: 1, ref: "Darai", opRef: "r" }),
    ).rejects.toThrow("raid.reward_bad_ref");
    expect(state.sql).toHaveLength(0);
  });

  it("без ссылки ничего не зачисляет", async () => {
    await expect(
      grantExtraReward({ kind: "resource", wallet: "w", amount: 1, ref: null, opRef: "r" }),
    ).rejects.toThrow("raid.reward_bad_ref");
    expect(state.sql).toHaveLength(0);
  });
});

describe("свой товар", () => {
  it("кладётся в рюкзак героя тем же стеком, что и покупка", async () => {
    await grantExtraReward({
      kind: "custom",
      wallet: "w.near",
      amount: 3,
      ref: "cst_wheat",
      opRef: "raidtour:map1:c3:rr_abc",
    });
    expect(state.deposits).toHaveLength(1);
    expect(state.deposits[0]).toMatchObject({
      heroId: "hero_1",
      account: "acc_1",
      qty: 3,
      nonce: "raidtour:map1:c3:rr_abc",
    });
    const item = state.deposits[0].item as { kind: string; refId: string; name: string };
    expect(item).toMatchObject({ kind: "custom", refId: "cst_wheat", name: "Пшеница" });
  });

  it("метка награды едет в рюкзак: бой — mob, объект/декор — loot, без метки — ничего", async () => {
    const base = { kind: "custom" as const, wallet: "w", amount: 1, ref: "cst_wheat" };
    await grantExtraReward({ ...base, opRef: "r1", origin: "mob" });
    await grantExtraReward({ ...base, opRef: "r2", origin: "loot" });
    await grantExtraReward({ ...base, opRef: "r3" });
    expect(state.deposits.map((d) => d.origin)).toEqual(["mob", "loot", null]);
  });

  it("нет выбранного героя — бытовой отказ, ничего не выдано", async () => {
    state.hero = null;
    await expect(
      grantExtraReward({ kind: "custom", wallet: "w", amount: 1, ref: "cst_wheat", opRef: "r" }),
    ).rejects.toThrow("market.need_hero");
    expect(state.deposits).toHaveLength(0);
  });

  it("полный рюкзак не съедает товар", async () => {
    state.room = new Error("market.backpack_need:2:0");
    await expect(
      grantExtraReward({ kind: "custom", wallet: "w", amount: 1, ref: "cst_wheat", opRef: "r" }),
    ).rejects.toThrow("market.backpack_need:2:0");
    expect(state.deposits).toHaveLength(0);
  });

  it("товара нет в справочнике — не выдаём пустой стек", async () => {
    state.meta = null;
    await expect(
      grantExtraReward({ kind: "custom", wallet: "w", amount: 1, ref: "cst_ghost", opRef: "r" }),
    ).rejects.toThrow("raid.reward_bad_ref");
    expect(state.deposits).toHaveLength(0);
  });

  it("чужой id (не cst_) не доходит до рюкзака", async () => {
    await expect(
      grantExtraReward({ kind: "custom", wallet: "w", amount: 1, ref: "mkt_1", opRef: "r" }),
    ).rejects.toThrow("raid.reward_bad_ref");
    expect(state.deposits).toHaveLength(0);
  });
});

describe("нулевая сумма", () => {
  it("ничего не трогает", async () => {
    await grantExtraReward({ kind: "resource", wallet: "w", amount: 0, ref: "gold", opRef: "r" });
    await grantExtraReward({
      kind: "custom",
      wallet: "w",
      amount: 0,
      ref: "cst_wheat",
      opRef: "r",
    });
    expect(state.sql).toHaveLength(0);
    expect(state.deposits).toHaveLength(0);
  });
});
