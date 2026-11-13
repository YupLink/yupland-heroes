// Токены в фонде босса/рейда/сундука/шаблона: заводит и меняет только админ
// выплат; правка без изменения токенов и конфиг без токенов — любой админ.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  prev: null as unknown,
  payouts: false,
  sql: [] as string[],
  moneyBox: "box_darai",
}));
vi.mock("../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    st.sql.push(sql);
    return st.prev == null ? [] : [{ cfg: st.prev }];
  },
}));
vi.mock("../auth", () => ({
  requirePayoutsAdmin: () => {
    if (!st.payouts) throw new Error("только для владельца");
    return "owner.near";
  },
}));
vi.mock("./mystic-money", () => ({
  assertPackMoneyRight: async (id: string) => {
    if (id === st.moneyBox && !st.payouts) throw new Error("бокс — только для владельца");
  },
}));

const { addsMoney, changedPacks, moneyKey, assertRewardMoneyRight } =
  await import("./reward-money");

const darai = (amount: number) => ({ kind: "token", token: "Darai", amount });
const likes = (amount: number) => ({ kind: "likes", amount });
const cfg = (fillers: unknown[], extra: Record<string, unknown> = {}) => ({
  fillers,
  split: [50, 50],
  packs: [],
  ...extra,
});

beforeEach(() => Object.assign(st, { prev: null, payouts: false, sql: [] }));

describe("addsMoney — конфиг добавляет или меняет токены", () => {
  it("без токенов — нет; новый токен — да", () => {
    expect(addsMoney(cfg([likes(10)]), null)).toBe(false);
    expect(addsMoney(cfg([likes(10), darai(5)]), cfg([likes(10)]))).toBe(true);
    expect(addsMoney(cfg([darai(5)]), null)).toBe(true);
  });

  it("те же токены, правка другого — нет", () => {
    const prev = cfg([darai(5), likes(10)]);
    expect(
      addsMoney(cfg([darai(5), likes(99)], { packs: [{ packId: "p", toPlace: 1 }] }), prev),
    ).toBe(false);
    // Доли те же в других числах; символ — без учёта регистра; конфиг строкой из базы.
    expect(addsMoney(cfg([{ ...darai(5), token: "DARAI" }], { split: [1, 1] }), prev)).toBe(false);
    expect(addsMoney(cfg([darai(5)]), JSON.stringify(prev))).toBe(false);
  });

  it("сумма, символ, доли мест, порядок для сундука — меняют", () => {
    const prev = cfg([likes(10), darai(5)]);
    expect(addsMoney(cfg([likes(10), darai(6)]), prev)).toBe(true);
    expect(addsMoney(cfg([likes(10), darai(4)]), prev)).toBe(true);
    expect(addsMoney(cfg([likes(10), { ...darai(5), token: "GDarai" }]), prev)).toBe(true);
    expect(addsMoney(cfg([likes(10), darai(5)], { split: [100] }), prev)).toBe(true);
    // Сундук отдаёт первый ненулевой: обнулили лайки — теперь выпадает Darai.
    expect(addsMoney(cfg([likes(0), darai(5)]), prev)).toBe(true);
  });

  it("старый kind-символ монеты — тоже деньги; токены убрали — как без токенов", () => {
    expect(moneyKey(cfg([{ kind: "Darai", amount: 3 }]))).not.toBe("");
    expect(moneyKey(cfg([{ kind: "energy", amount: 3 }, darai(0)]))).toBe("");
    expect(addsMoney(cfg([likes(10)]), cfg([darai(5)]))).toBe(false);
  });
});

describe("changedPacks", () => {
  it("новые, сдвинутые и с большим числом мест — да; те же и меньше мест — нет", () => {
    const prev = { packs: [{ packId: "a", toPlace: 3 }] };
    expect(changedPacks({ packs: [{ packId: "a", toPlace: 2 }] }, prev)).toEqual([]);
    expect(changedPacks({ packs: [{ packId: "a", toPlace: 5 }] }, prev)).toEqual(["a"]);
    expect(
      changedPacks(
        {
          packs: [
            { packId: "b", toPlace: 1 },
            { packId: "a", toPlace: 3 },
          ],
        },
        prev,
      ),
    ).toEqual(["b", "a"]);
  });
});

describe("assertRewardMoneyRight", () => {
  it("конфиг владельца, админ правит другое — сохраняется; токены выросли — отказ", async () => {
    st.prev = cfg([darai(5)], { packs: [{ packId: "box_darai", toPlace: 1 }] });
    const same = cfg([darai(5), likes(7)], { packs: [{ packId: "box_darai", toPlace: 1 }] });
    await expect(assertRewardMoneyRight(same, "chip_boss", "boss_1")).resolves.toBeUndefined();
    expect(st.sql[0]).toContain(
      "SELECT reward_tiers AS cfg FROM yuplink.chip_boss WHERE id = 'boss_1'",
    );
    await expect(assertRewardMoneyRight(cfg([darai(50)]), "chip_boss", "boss_1")).rejects.toThrow(
      "владельца",
    );
  });

  it("новая строка с токенами или бокс с деньгами — только админ выплат; без них — без базы", async () => {
    await expect(assertRewardMoneyRight(cfg([darai(1)]), "raid_location")).rejects.toThrow();
    const box = cfg([], { packs: [{ packId: "box_darai", toPlace: 1 }] });
    await expect(assertRewardMoneyRight(box, "raid_node", "n1")).rejects.toThrow("бокс");
    expect(st.sql[0]).toContain("SELECT chest_config AS cfg FROM yuplink.raid_node");
    st.sql.length = 0;
    await expect(
      assertRewardMoneyRight(cfg([likes(3)]), "chip_boss", "b"),
    ).resolves.toBeUndefined();
    await expect(assertRewardMoneyRight(null, "raid_node", "n1")).resolves.toBeUndefined();
    expect(st.sql).toHaveLength(0);
    st.payouts = true;
    await expect(
      assertRewardMoneyRight(cfg([darai(1)]), "raid_boss_template"),
    ).resolves.toBeUndefined();
  });
});
