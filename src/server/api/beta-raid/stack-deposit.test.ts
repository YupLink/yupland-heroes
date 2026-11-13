// Стопка по ссылке в рюкзак: товар — по канону справочника, босс — по шаблону
// (boss:<id>); без героя — need_hero, нет в справочнике — bad_ref. Ключ выдачи
// проверяется ПЕРВЫМ: повтор уже положенного — «already», а не «в Добычу».
// Клейм «Добычи» кладёт босса этой же дверью (grantExtraReward kind boss).
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  hero: { heroId: "h1", capacity: 8, potionCapacity: 2 } as null | Record<string, unknown>,
  boss: [{ name: "Зимний Йети", image: "ipfs://yeti" }] as unknown[],
  custom: { name: "Пшеница", image: null } as null | { name: string; image: string | null },
  deposits: [] as Array<Record<string, unknown>>,
  sql: [] as string[],
  opTaken: false,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("raid_backpack_op")) return [{ was: s.opTaken }];
    return sql.includes("raid_boss_template") ? s.boss : [];
  },
}));
vi.mock("@/server/api/beta-raid/item-alias", () => ({ canonCustomMeta: async () => s.custom }));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => s.hero,
  depositToBackpack: async (o: Record<string, unknown>) => void s.deposits.push(o),
}));
vi.mock("@/server/api/user-shared", () => ({ accountOf: async () => "acc_1" }));

const { depositRefStack } = await import("./stack-deposit");
const { grantExtraReward } = await import("../raid-reward-extra");

beforeEach(() => {
  s.hero = { heroId: "h1", capacity: 8, potionCapacity: 2 };
  s.boss = [{ name: "Зимний Йети", image: "ipfs://yeti" }];
  s.custom = { name: "Пшеница", image: null };
  s.deposits.length = 0;
  s.sql.length = 0;
  s.opTaken = false;
});

const base = { wallet: "w.tg", account: "acc_1", qty: 2, nonce: "promo:prd_x:0" };

describe("стопка по ссылке", () => {
  it("ключ уже занят — «already» до героя и справочника, без второй стопки", async () => {
    s.opTaken = true;
    s.hero = null;
    s.boss = [];
    await expect(depositRefStack({ ...base, kind: "boss", ref: "gone" })).resolves.toBe("already");
    expect(s.sql[0]).toContain("op = 'bp:promo:prd_x:0'");
    expect(s.sql).toHaveLength(1);
    expect(s.deposits).toHaveLength(0);
  });

  it("босс — стопкой boss:<шаблон> с именем и картинкой шаблона, ключом выдачи", async () => {
    await expect(depositRefStack({ ...base, kind: "boss", ref: "yeti" })).resolves.toBe("given");
    expect(s.deposits[0]).toMatchObject({
      heroId: "h1",
      account: "acc_1",
      qty: 2,
      nonce: "promo:prd_x:0",
      capacity: 8,
      potionCapacity: 2,
      item: {
        id: "boss:yeti",
        kind: "boss",
        refId: "yeti",
        name: "Зимний Йети",
        image: "ipfs://yeti",
      },
    });
  });

  it("товар — по канону справочника; не cst_ — bad_ref без похода в рюкзак", async () => {
    await depositRefStack({ ...base, kind: "custom", ref: "cst_wheat" });
    expect(s.deposits[0]).toMatchObject({
      item: { id: "cst_wheat", kind: "custom", name: "Пшеница" },
    });
    await expect(depositRefStack({ ...base, kind: "custom", ref: "wheat" })).rejects.toThrow(
      "raid.reward_bad_ref",
    );
  });

  it("нет героя — need_hero; нет шаблона — bad_ref (оба «бытовые»: ждут в «Добыче»)", async () => {
    s.hero = null;
    await expect(depositRefStack({ ...base, kind: "boss", ref: "yeti" })).rejects.toThrow(
      "market.need_hero",
    );
    s.boss = [];
    await expect(depositRefStack({ ...base, kind: "boss", ref: "gone" })).rejects.toThrow(
      "raid.reward_bad_ref",
    );
    expect(s.deposits).toHaveLength(0);
  });

  it("клейм «Добычи»: босс идёт этой же дверью, ключ — ключ начисления", async () => {
    await grantExtraReward({
      kind: "boss",
      wallet: "w.tg",
      amount: 1,
      ref: "yeti",
      opRef: "raidtour:m:c0:rr_1",
    });
    expect(s.deposits[0]).toMatchObject({ nonce: "raidtour:m:c0:rr_1", item: { id: "boss:yeti" } });
  });
});
