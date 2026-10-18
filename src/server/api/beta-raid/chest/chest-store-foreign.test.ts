// Чужой КЛАДЁТ в чужой магический сундук (владелец, 30.09.2026): без живой
// охраны (или после победы над ней), не закопанный, открыв за энергию, — по
// тем же правилам, что хозяин: только собранное, купленное — нет, изношенная
// штука остаётся. Положенное становится сетью ХОЗЯИНА. Сундук стоит, не
// закопан и живой охраны нет — сверено тем же оператором под локом сети
// хозяина: охрана, лопата или «Забрать сундук» под рукой — вклада нет.
// Ручка и SQL настоящие, база — фейк chestStoreFake.
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
const left = (key = K) => cs.bag.get(key)?.count;

beforeEach(() => {
  resetStore();
  resetStoreMocks();
  // Кладёт чужой: свой аккаунт и свой герой, сундук — хозяина acc_o.
  Object.assign(st, { account: "acc_t", hero: "h_t" });
});

describe("чужой кладёт в сеть хозяина", () => {
  it("собранное — в сеть ХОЗЯИНА под его локом; журнал: put, контрагент — хозяин", async () => {
    cs.bag.set(K, bagRow("8", { loot: "5", mob: "3" }));
    await expect(store(K, 8)).resolves.toEqual({ ok: true, qty: 8 });
    expect(cs.bag.has(K)).toBe(false);
    expect(cs.net.get(K)).toBe(dec("8"));
    const sql = cs.sql[0];
    expect(
      sql.startsWith(
        "SELECT pg_advisory_xact_lock(hashtext('chest:acc_o')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('bp:h_t')) AS l;",
      ),
    ).toBe(true);
    expect(sql).toContain("WHERE s.account_id = 'acc_o' AND s.count > 0");
    expect(sql).toContain("SELECT 'acc_o', 'custom:cst_banana'");
    expect(st.notes).toEqual([
      expect.objectContaining({ side: "put", account: "acc_t", counterparty: "acc_o", qty: 8 }),
    ]);
  });

  it("купленное — отказ «только собранное», рюкзак и сеть не тронуты", async () => {
    cs.bag.set(K, bagRow("5"));
    await expect(store(K, 5)).rejects.toThrow("chest.not_mob");
    expect(left()).toBe(dec("5"));
    expect(cs.net.size).toBe(0);
    expect(cs.ops.size).toBe(0);
  });

  it("смешанная стопка — ложится ровно собранное, купленное остаётся", async () => {
    cs.bag.set(K, bagRow("10", { field: "4" }));
    await store(K, 4);
    expect(left()).toBe(dec("6"));
    await expect(store(K, 1)).rejects.toThrow("chest.not_mob");
    expect(cs.net.get(K)).toBe(dec("4"));
  });

  it("изношенный инструмент целиком — отказ, как у хозяина", async () => {
    const AXE = "custom:cst_axe";
    cs.bag.set(AXE, bagRow("2", { loot: "2" }, "30"));
    await expect(store(AXE, 2)).rejects.toThrow("braid.tool_worn_stays");
    await expect(store(AXE, 1)).resolves.toEqual({ ok: true, qty: 1 });
    expect(left(AXE)).toBe(dec("1"));
  });

  it("сеть хозяина полна — «нет места»", async () => {
    for (let i = 0; i < 10; i++) cs.net.set(`custom:x${i}`, dec("20"));
    cs.bag.set(K, bagRow("3", { loot: "3" }));
    await expect(store(K, 3)).rejects.toThrow("chest.net_full");
    expect(left()).toBe(dec("3"));
  });
});

describe("когда чужому нельзя", () => {
  it("живая охрана — сначала бой: отказ до оператора", async () => {
    cs.guard = true;
    cs.bag.set(K, bagRow("5", { loot: "5" }));
    await expect(store(K, 5)).rejects.toThrow("chest.guarded");
    expect(cs.sql).toEqual([]);
  });

  it("закопанный — «сундука нет»; без входа — «Сначала открой»", async () => {
    cs.bag.set(K, bagRow("5", { loot: "5" }));
    cs.chest = { owner: "acc_o", buried: true };
    await expect(store(K, 5)).rejects.toThrow("chest.gone");
    cs.chest = { owner: "acc_o", buried: false };
    st.pass = false;
    await expect(store(K, 5)).rejects.toThrow("pass.closed");
    expect(cs.sql).toEqual([]);
  });
});

describe("гонки: под рукой изменилось — оператор не кладёт", () => {
  beforeEach(() => void cs.bag.set(K, bagRow("5", { loot: "5" })));
  const untouched = () => {
    expect(left()).toBe(dec("5"));
    expect(cs.net.size).toBe(0);
    expect(cs.ops.size).toBe(0);
  };

  it("хозяин поставил охрану между проверкой и вкладом — «сначала бой»", async () => {
    st.race = () => void (cs.guard = true);
    await expect(store(K, 5)).rejects.toThrow("chest.guarded");
    untouched();
    expect(cs.sql[0]).toContain(
      "AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_guard g WHERE g.map_id = 'rmap_x' AND g.q = 1 AND g.r = 2",
    );
  });

  it("сундук закопали — «сундука нет»", async () => {
    st.race = () => void (cs.chest = { owner: "acc_o", buried: true });
    await expect(store(K, 5)).rejects.toThrow("chest.gone");
    untouched();
  });

  it("сундук забрали (последний — сеть уехала) — «сундука нет», в пустую сеть ничего не легло", async () => {
    st.race = () => void (cs.chest = null);
    await expect(store(K, 5)).rejects.toThrow("chest.gone");
    untouched();
  });

  it("сундук забрали и тут же поставил другой — в чужую сеть не кладём", async () => {
    st.race = () => void (cs.chest = { owner: "acc_x", buried: false });
    await expect(store(K, 5)).rejects.toThrow(/chest\./);
    untouched();
  });

  it("мост повторил вклад вслепую — легло один раз", async () => {
    cs.retry = true;
    await expect(store(K, 5)).resolves.toEqual({ ok: true, qty: 5 });
    expect(cs.net.get(K)).toBe(dec("5"));
    expect(cs.bag.has(K)).toBe(false);
  });
});
