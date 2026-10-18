// «Положить в сундук» (владелец, 29.09.2026): в магический сундук — ВСЁ
// собранное (мобы, объекты карты, декор, грядки, шахты, награды, грабёж,
// возврат из сундука), кроме купленного. Смешанная стопка отдаёт ровно
// собранное, изношенная штука инструмента остаётся в рюкзаке. Ручка —
// настоящая, SQL — настоящий: фейк (src/test/chestStoreFake.ts) считает его
// выражения тем же мини-вычислителем на numeric. Кладёт хозяин; чужой —
// chest-store-foreign.test.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dec } from "@/test/numeric";
import { bagRow, cs, resetStore } from "@/test/chestStoreFake";
import { resetStoreMocks, st } from "@/test/chestStoreMocks";

const F = vi.hoisted(() => "@/test/chestStoreFake");
const M = vi.hoisted(() => "@/test/chestStoreMocks");
vi.mock("@/server/db/mcpClient", async () => (await import(F)).mcp);
vi.mock("@/server/api/beta-raid/open-pass/pass", async () => (await import(M)).passMod);
vi.mock("@tanstack/react-start", async () => (await import(M)).startFn);
vi.mock("@/server/api/beta-raid/market-backpack", async () => (await import(M)).backpack);
vi.mock("@/server/api/beta-raid/econ/chest-note", async () => (await import(M)).note);
vi.mock("@/server/api/beta-raid/chest/chest-row", async () => (await import(M)).row);

const { storeToChest } = await import("@/server/api/beta-raid/chest/chest-store");
const store = (stackKey: string, qty: number) =>
  (storeToChest as unknown as (a: { data: object }) => Promise<{ qty: number }>)({
    data: { q: 1, r: 2, stackKey, qty },
  });
const K = "custom:cst_banana";
const marks = (key = K) => {
  const r = cs.bag.get(key);
  return r && { count: r.count, mob: r.mob, mine: r.mine, field: r.field, loot: r.loot };
};
const row = (count: string, mob: string, mine: string, field: string, loot: string) => ({
  count: dec(count),
  mob: dec(mob),
  mine: dec(mine),
  field: dec(field),
  loot: dec(loot),
});

beforeEach(() => {
  resetStore();
  resetStoreMocks();
});

describe("вход (§8.23)", () => {
  it("без живого входа — «Сначала открой», рюкзак и сеть не тронуты", async () => {
    st.pass = false;
    cs.bag.set(K, bagRow("5", { loot: "5" }));
    await expect(store(K, 5)).rejects.toThrow("pass.closed");
    expect(cs.bag.get(K)?.count).toBe(dec("5"));
    expect(cs.net.has(K)).toBe(false);
  });
});

describe("что принимает сундук", () => {
  it.each([["loot"], ["field"], ["mine"], ["mob"]] as const)(
    "собранное с меткой %s — ложится целиком",
    async (label) => {
      cs.bag.set(K, bagRow("5", { [label]: "5" }));
      await expect(store(K, 5)).resolves.toEqual({ ok: true, qty: 5 });
      expect(cs.bag.has(K)).toBe(false);
      expect(cs.net.get(K)).toBe(dec("5"));
    },
  );

  it("купленное — отказ, рюкзак и сеть не тронуты", async () => {
    cs.bag.set(K, bagRow("5"));
    await expect(store(K, 5)).rejects.toThrow("chest.not_mob");
    expect(marks()).toEqual(row("5", "0", "0", "0", "0"));
    expect(cs.net.size).toBe(0);
    expect(cs.ops.size).toBe(0);
  });

  it("купленная крошка меньше тысячной — тот же отказ «не собрано», а не «нет товара»", async () => {
    cs.bag.set(K, bagRow("3"));
    await expect(store(K, 0.0005)).rejects.toThrow("chest.not_mob");
    expect(marks()).toEqual(row("3", "0", "0", "0", "0"));
    expect(cs.ops.size).toBe(0);
  });

  it("смешанная стопка: в сундук ровно собранное, купленное остаётся безымянным", async () => {
    // 20 бананов: 12 куплено, 5 с сундуков-объектов, 3 с грядки.
    cs.bag.set(K, bagRow("20", { loot: "5", field: "3" }));
    await store(K, 8);
    expect(marks()).toEqual(row("12", "0", "0", "0", "0"));
    expect(cs.net.get(K)).toBe(dec("8"));
    await expect(store(K, 1)).rejects.toThrow("chest.not_mob");
    expect(cs.net.get(K)).toBe(dec("8"));
  });

  it("часть собранного: прочее уходит первым, мобы — последними", async () => {
    cs.bag.set(K, bagRow("10", { mob: "2", loot: "4", field: "1" }));
    await store(K, 5);
    expect(marks()).toEqual(row("5", "2", "0", "0", "0"));
  });

  it("просят больше собранного — отказ, ничего не снято", async () => {
    cs.bag.set(K, bagRow("10", { loot: "4" }));
    await expect(store(K, 5)).rejects.toThrow("chest.not_mob");
    expect(marks()).toEqual(row("10", "0", "0", "0", "4"));
  });

  it("дробное собранное — ровно столько, без округления вверх", async () => {
    cs.bag.set(K, bagRow("25.5", { loot: "20.3456" }));
    await store(K, 20.3456);
    expect(marks()).toEqual(row("5.1544", "0", "0", "0", "0"));
    expect(cs.net.get(K)).toBe(dec("20.3456"));
  });

  it("длинная дробь базы: окно просит 9 знаков чуть больше собранного — ложится собранное", async () => {
    // Смешанная стопка с прода: собрано 2,14303321991582606, окно шлёт 2,14303322.
    cs.bag.set(K, bagRow("9.7381", { loot: "2.14303321991582606" }));
    await store(K, 2.14303322);
    expect(cs.net.get(K)).toBe(dec("2.14303321991582606"));
    expect(marks()).toEqual(row("7.59506678008417394", "0", "0", "0", "0"));
  });

  it("безымянная крошка сверх просьбы остаётся в рюкзаке, а не отменяет вклад", async () => {
    cs.bag.set(K, bagRow("12.3456", { loot: "12.3455" }));
    await store(K, 12.3455);
    expect(marks()).toEqual(row("0.0001", "0", "0", "0", "0"));
    expect(cs.net.get(K)).toBe(dec("12.3455"));
  });

  it("собранная пыль уходит со стеком целиком", async () => {
    cs.bag.set(K, bagRow("7.0004", { mob: "7.0004" }));
    await store(K, 7);
    expect(cs.bag.has(K)).toBe(false);
    expect(cs.net.get(K)).toBe(dec("7.0004"));
  });
});

describe("изношенный инструмент", () => {
  const AXE = "custom:cst_axe";

  it("вся стопка с износом — отказ; целые собранные — ложатся, изношенная остаётся", async () => {
    cs.bag.set(AXE, bagRow("3", { loot: "3" }, "40"));
    await expect(store(AXE, 3)).rejects.toThrow("braid.tool_worn_stays");
    await store(AXE, 2);
    expect(marks(AXE)).toEqual(row("1", "0", "0", "0", "1"));
    expect(cs.bag.get(AXE)?.wear).toBe(dec("40"));
  });
});

describe("повтор и гонки", () => {
  it("мост повторил вклад вслепую — в сеть легло один раз", async () => {
    cs.bag.set(K, bagRow("10", { loot: "10" }));
    cs.retry = true;
    await expect(store(K, 4)).resolves.toEqual({ ok: true, qty: 4 });
    expect(cs.net.get(K)).toBe(dec("4"));
    expect(marks()).toEqual(row("6", "0", "0", "0", "6"));
  });

  it("два вклада на последнюю ячейку — второй получает «нет места»", async () => {
    for (let i = 0; i < 9; i++) cs.net.set(`custom:x${i}`, dec("20"));
    cs.bag.set(K, bagRow("20", { loot: "20" }));
    cs.bag.set("custom:cst_ore", bagRow("5", { mob: "5" }));
    const got = await Promise.allSettled([store(K, 20), store("custom:cst_ore", 5)]);
    expect(got.map((x) => x.status)).toEqual(["fulfilled", "rejected"]);
    expect(String((got[1] as PromiseRejectedResult).reason)).toContain("chest.net_full");
    expect(marks("custom:cst_ore")).toEqual(row("5", "5", "0", "0", "0"));
  });

  it("хозяину своя охрана не помеха: кладёт при живой охране", async () => {
    cs.guard = true;
    cs.bag.set(K, bagRow("5", { mob: "5" }));
    await expect(store(K, 5)).resolves.toEqual({ ok: true, qty: 5 });
    expect(cs.net.get(K)).toBe(dec("5"));
    expect(cs.sql[0]).not.toContain("raid_mine_guard");
  });

  it("свой сундук закопали между проверкой и вкладом — оператор не кладёт, «закопан»", async () => {
    cs.bag.set(K, bagRow("5", { loot: "5" }));
    st.race = () => void (cs.chest = { owner: "acc_o", buried: true });
    await expect(store(K, 5)).rejects.toThrow("chest.buried");
    expect(marks()).toEqual(row("5", "0", "0", "0", "5"));
    expect(cs.net.size).toBe(0);
    expect(cs.ops.size).toBe(0);
  });
});
