// Выдача зелий (правило владельца 29.09): зелья живут ТОЛЬКО в сумке. Базы
// здесь нет — фейк (src/test/potionBagFake.ts) считает место тем же SQL, что
// уйдёт в Postgres, и выполняет каждый запрос атомарно, как под локом героя.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bag, bagCells, bagDb, resetBag } from "@/test/potionBagFake";
import { CELL_SIZE } from "@/lib/hero/backpackCells";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: async (sql: string) => bagDb(sql) }));
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  stackKeyFor: async (it: { kind: string; refId?: string | null; id?: string | null }) =>
    `${it.kind}:${it.refId ?? it.id}`,
  refFromStackKey: (k: string) => k.slice(k.indexOf(":") + 1) || null,
  canonCustomMeta: async () => null,
}));

import { depositToBackpack } from "@/server/api/beta-raid/market-backpack-write";
import { assertBackpackRoom } from "@/server/api/beta-raid/market-backpack";

const HEAL = "custom:cst_heal";
const SPEED = "custom:cst_speed";
const LUCK = "custom:cst_luck";

/** Выдать qty штук вида id: ёмкости рюкзака и сумки — как у героя сейчас. */
const give = (id: string, qty: number, caps: { capacity: number; pc: number }, nonce: string) =>
  depositToBackpack({
    heroId: "h1",
    account: "acc1",
    item: { kind: "custom", refId: id, name: id, image: null },
    qty,
    nonce,
    capacity: caps.capacity,
    potionCapacity: caps.pc,
  });

beforeEach(() => {
  resetBag();
  bag.potionIds = new Set(["cst_heal", "cst_speed", "cst_luck"]);
});

describe("куда ложится зелье", () => {
  it("в SQL зелья — строгое «не больше сумки», у товара — потолок рюкзака", async () => {
    await give("cst_heal", 1, { capacity: 5, pc: 3 }, "a");
    await give("cst_apple", 1, { capacity: 5, pc: 3 }, "b");
    const [potionSql, itemSql] = bag.sql.filter((s) => s.includes("AS need_occ"));
    // Лок героя — отдельным оператором ДО WITH: внутри WITH он не освежил бы
    // снимок, и две выдачи разом обе видели бы место без соседа.
    for (const sql of [potionSql, itemSql]) {
      expect(
        sql.startsWith("SELECT pg_advisory_xact_lock(hashtext('bp:h1')) AS l; WITH prior AS"),
      ).toBe(true);
      expect(sql.indexOf("pg_advisory_xact_lock")).toBe(sql.lastIndexOf("pg_advisory_xact_lock"));
    }
    expect(potionSql).toContain("WHERE NOT prior.was AND need_occ <= 3 ON CONFLICT");
    expect(potionSql).toContain("potions + d AS need_occ");
    expect(itemSql).toContain("need_occ <= GREATEST(5, occ)");
    expect(itemSql).toContain("items + d AS need_occ");
  });

  it("сумка полна, рюкзак пуст — зелье в рюкзак не переливается", async () => {
    bag.rows.set(SPEED, CELL_SIZE);
    await expect(give("cst_heal", 1, { capacity: 5, pc: 1 }, "a")).rejects.toThrow(
      "market.potion_bag_need:1:0",
    );
    expect(bag.rows.has(HEAL)).toBe(false);
    // Обычный товар в тот же рюкзак ложится как ни в чём не бывало.
    await expect(
      give("cst_apple", 3 * CELL_SIZE, { capacity: 5, pc: 1 }, "b"),
    ).resolves.toBeUndefined();
    expect(bagCells()).toEqual({ items: 3, potions: 1 });
  });

  it("сумка ровно полна: долив своей неполной ячейки — да, через край — нет", async () => {
    bag.rows.set(HEAL, CELL_SIZE - 6);
    await expect(give("cst_heal", 6, { capacity: 0, pc: 1 }, "a")).resolves.toBeUndefined();
    await expect(give("cst_heal", 1, { capacity: 9, pc: 1 }, "b")).rejects.toThrow(
      "market.potion_bag_need:1:0",
    );
    expect(bag.rows.get(HEAL)).toBe(CELL_SIZE);
  });

  it("повтор той же выдачи не удваивает стек", async () => {
    await give("cst_heal", 5, { capacity: 0, pc: 1 }, "same");
    await give("cst_heal", 5, { capacity: 0, pc: 1 }, "same");
    expect(bag.rows.get(HEAL)).toBe(5);
  });

  it("ответ не разобрался — выдачу решает ключ операции, а не слепой отказ", async () => {
    bag.garble = true;
    // Легло: ключ стоит — успех, и вызывающий не вернёт деньги поверх выданного.
    await expect(give("cst_heal", 5, { capacity: 0, pc: 1 }, "g1")).resolves.toBeUndefined();
    expect(bag.rows.get(HEAL)).toBe(5);
    // Не легло (сумка полна): ключа нет — честный отказ.
    await expect(give("cst_speed", 20, { capacity: 0, pc: 1 }, "g2")).rejects.toThrow(
      "market.potion_bag_need",
    );
  });

  it("ёмкость сумки не пришла — зелье не ложится, в SQL не уезжает NaN", async () => {
    await expect(give("cst_heal", 1, { capacity: 5, pc: Number.NaN }, "a")).rejects.toThrow(
      "market.potion_bag_need:1:0",
    );
    expect(bag.sql.join(" ")).not.toContain("NaN");
  });
});

describe("переполненный герой (перебор до 29.09)", () => {
  beforeEach(() => {
    // Три ячейки зелий при сумке на одну, пять свободных ячеек рюкзака.
    bag.rows.set(HEAL, CELL_SIZE - 6);
    bag.rows.set(SPEED, CELL_SIZE);
    bag.rows.set(LUCK, 0.4);
  });

  it("новое не приходит — даже долив; числа говорят, сколько освободить", async () => {
    await expect(give("cst_heal", 1, { capacity: 5, pc: 1 }, "a")).rejects.toThrow(
      "market.potion_bag_need:2:0",
    );
    bag.potionIds.add("cst_new");
    await expect(give("cst_new", 1, { capacity: 5, pc: 1 }, "c")).rejects.toThrow(
      "market.potion_bag_need:3:0",
    );
  });

  it("ничего не отбираем: стеки целы, ни одного списания", async () => {
    await give("cst_heal", 1, { capacity: 5, pc: 1 }, "a").catch(() => {});
    expect([...bag.rows]).toEqual([
      [HEAL, CELL_SIZE - 6],
      [SPEED, CELL_SIZE],
      [LUCK, 0.4],
    ]);
    expect(bag.sql.some((s) => /^(UPDATE|DELETE) yuplink\.raid_hero_backpack/.test(s))).toBe(false);
  });

  it("опустился до ёмкости — долив снова открыт", async () => {
    bag.rows.delete(SPEED);
    bag.rows.delete(LUCK);
    await expect(give("cst_heal", 6, { capacity: 5, pc: 1 }, "a")).resolves.toBeUndefined();
  });

  it("рюкзак зелий не считает: товары занимают все пять ячеек", async () => {
    await expect(
      give("cst_apple", 5 * CELL_SIZE, { capacity: 5, pc: 1 }, "a"),
    ).resolves.toBeUndefined();
    await expect(give("cst_milk", 1, { capacity: 5, pc: 1 }, "b")).rejects.toThrow(
      "market.backpack_need:1:0",
    );
  });
});

describe("бафф Алхимии: временная ячейка", () => {
  it("с баффом четвёртая ячейка принимает, бафф кончился — не принимает, но и не отбирает", async () => {
    for (const [i, k] of ["cst_heal", "cst_speed", "cst_luck"].entries())
      await give(k, CELL_SIZE, { capacity: 1, pc: 4 }, `f${i}`);
    bag.potionIds.add("cst_rage");
    await expect(give("cst_rage", 5, { capacity: 1, pc: 4 }, "buff")).resolves.toBeUndefined();
    expect(bagCells().potions).toBe(4);
    // Бафф сошёл: ёмкость снова 3.
    await expect(give("cst_rage", 1, { capacity: 1, pc: 3 }, "after")).rejects.toThrow(
      "market.potion_bag_need:1:0",
    );
    expect(bag.rows.get("custom:cst_rage")).toBe(5);
  });
});

describe("гонки на последней ячейке сумки", () => {
  it("два разных зелья разом в одну свободную ячейку — ложится одно", async () => {
    bag.rows.set(SPEED, CELL_SIZE);
    const res = await Promise.allSettled([
      give("cst_heal", CELL_SIZE, { capacity: 5, pc: 2 }, "a"),
      give("cst_luck", CELL_SIZE, { capacity: 5, pc: 2 }, "b"),
    ]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(lost.reason)).toContain("market.potion_bag_need:1:0");
    expect(bagCells().potions).toBe(2);
  });

  it("предпроверка пропустила обоих по старому снимку — выдача всё равно одна", async () => {
    const caps = { heroId: "h1", capacity: 5, potionCapacity: 1 };
    await Promise.all([
      assertBackpackRoom(caps, HEAL, CELL_SIZE),
      assertBackpackRoom(caps, SPEED, CELL_SIZE),
    ]);
    const res = await Promise.allSettled([
      give("cst_heal", CELL_SIZE, { capacity: 5, pc: 1 }, "a"),
      give("cst_speed", CELL_SIZE, { capacity: 5, pc: 1 }, "b"),
    ]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(bagCells()).toEqual({ items: 0, potions: 1 });
  });

  it("пять доливов одной ячейки разом — ровно до края, лишние отказаны", async () => {
    bag.rows.set(HEAL, CELL_SIZE - 6);
    const res = await Promise.allSettled(
      [0, 1, 2, 3, 4].map((i) => give("cst_heal", 2, { capacity: 5, pc: 1 }, `t${i}`)),
    );
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(bag.rows.get(HEAL)).toBe(CELL_SIZE);
  });
});
