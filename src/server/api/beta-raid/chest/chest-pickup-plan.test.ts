// «Забрать сундук» (магический): место под сундук и охрану — первым, товары
// сети последнего сундука — в то, что осталось, не влезшее — мешочком на
// клетке (дополнение №3, 29.09: ничего не пропадает). Охрана возвращается
// только целая. Чужой (дополнение №2): охраны не получает, сундук без места —
// мешочком, последний уносит всю сеть хозяина.
import { describe, expect, it } from "vitest";
import {
  pickupPlan,
  sigOf,
  type NetRow,
  type PickupSnap,
} from "@/server/api/beta-raid/chest/chest-pickup-plan";

const caps = { capacity: 4, potionCapacity: 1 };
const bagOf = (...counts: number[]) =>
  counts.map((count, i) => ({ stackKey: `custom:x${i}`, count, potion: false }));
const net = (stackKey: string, count: number, potion = false): NetRow => ({
  stackKey,
  kind: "custom",
  name: stackKey,
  image: null,
  count,
  refId: stackKey.split(":")[1] ?? null,
  itemId: null,
  potion,
});
const snap = (over: Partial<PickupSnap> = {}): PickupSnap => ({
  chest: { itemId: "cst_mc", name: "Сундук", image: null, potion: false },
  guard: { tpl: "rbt_1", name: "Тролль", image: null, whole: true },
  last: false,
  bag: [],
  net: [net("custom:cst_ore", 30)],
  bagFp: "fp",
  netFp: "nfp",
  ...over,
});
const hurt = { tpl: "rbt_1", name: "Тролль", image: null, whole: false };

describe("не последний сундук", () => {
  it("в рюкзак — сундук и живая охрана, сеть не трогается", () => {
    const plan = pickupPlan(snap(), caps);
    expect(plan.fits).toBe(true);
    expect(plan.rows).toEqual([
      expect.objectContaining({ k: "custom:cst_mc", kind: "custom", qty: 1, loot: 0 }),
      expect.objectContaining({ k: "boss:rbt_1", kind: "boss", ref: "rbt_1", qty: 1, loot: 0 }),
    ]);
    expect(plan).toMatchObject({ taken: [], left: [], bagged: [], chestBagged: false });
  });

  it("без охраны — одна строка сундука", () => {
    expect(pickupPlan(snap({ guard: null }), caps).rows).toHaveLength(1);
  });

  it("раненая охрана не возвращается: в рюкзак только сундук", () => {
    const plan = pickupPlan(snap({ guard: hurt }), caps);
    expect(plan.rows).toEqual([expect.objectContaining({ k: "custom:cst_mc", qty: 1 })]);
  });
});

describe("места нет (хозяин)", () => {
  it("под сундук нет ячейки — отказ с числами «нужно / свободно»", () => {
    const plan = pickupPlan(snap({ guard: null, bag: bagOf(20, 20, 20, 20) }), caps);
    expect(plan).toMatchObject({ fits: false, need: 1, free: 0, rows: [], bagged: [] });
  });

  it("сундук влез, а охране ячейки нет — тоже отказ: нужно две, свободна одна", () => {
    const plan = pickupPlan(snap({ bag: bagOf(20, 20, 20) }), caps);
    expect(plan).toMatchObject({ fits: false, need: 2, free: 1 });
  });

  it("под раненую охрану ячейку не держим: одна свободная — сундук влез", () => {
    const plan = pickupPlan(snap({ guard: hurt, bag: bagOf(20, 20, 20) }), caps);
    expect(plan.fits).toBe(true);
    expect(plan.rows.map((r) => r.k)).toEqual(["custom:cst_mc"]);
  });

  it("неполный стек сундуков — долив без новой ячейки", () => {
    const bag = [...bagOf(20, 20, 20), { stackKey: "custom:cst_mc", count: 1, potion: false }];
    expect(pickupPlan(snap({ guard: null, bag }), caps).fits).toBe(true);
  });
});

describe("последний сундук", () => {
  it("всё влезло — товары сети в рюкзак «собрано прочее», мешочка нет", () => {
    const plan = pickupPlan(snap({ last: true }), caps);
    expect(plan.taken).toEqual([{ stackKey: "custom:cst_ore", qty: 30 }]);
    expect(plan).toMatchObject({ left: [], bagged: [] });
    expect(plan.rows[2]).toMatchObject({ k: "custom:cst_ore", qty: 30, loot: 30, ref: "cst_ore" });
  });

  it("раненая охрана не занимает место товаров сети: им на ячейку больше", () => {
    // Ёмкость 4: одна занята, одна — сундуку; товарам две (с целой охраной — одна).
    const plan = pickupPlan(snap({ last: true, guard: hurt, bag: bagOf(20) }), caps);
    expect(plan.taken).toEqual([{ stackKey: "custom:cst_ore", qty: 30 }]);
    expect(plan.bagged).toEqual([]);
  });

  it("сначала место под сундук и охрану, товарам — остаток; не влезшее — мешочком с меткой", () => {
    // Ёмкость 4: одна занята, две уходят сундуку и охране — товарам одна ячейка.
    const plan = pickupPlan(
      snap({ last: true, bag: bagOf(20), net: [net("custom:a", 30), net("custom:b", 5)] }),
      caps,
    );
    expect(plan.taken).toEqual([{ stackKey: "custom:a", qty: 20 }]);
    expect(plan.left).toEqual([
      { stackKey: "custom:a", qty: 10 },
      { stackKey: "custom:b", qty: 5 },
    ]);
    expect(plan.bagged).toEqual([
      expect.objectContaining({ k: "custom:a", n: 10, loot: 10, ref: "a" }),
      expect.objectContaining({ k: "custom:b", n: 5, loot: 5 }),
    ]);
  });

  it("рюкзак полон после сундука — вся сеть мешочком, сундук всё равно забирается", () => {
    const plan = pickupPlan(snap({ last: true, guard: null, bag: bagOf(20, 20, 20) }), caps);
    expect(plan.fits).toBe(true);
    expect(plan.taken).toEqual([]);
    expect(plan.bagged).toEqual([expect.objectContaining({ k: "custom:cst_ore", n: 30, loot: 30 })]);
  });

  it("дробь: влез вид целиком — точно, не влез — тысячные вниз, остаток до крошки — мешочком", () => {
    const plan = pickupPlan(
      snap({ last: true, guard: null, bag: bagOf(20, 20), net: [net("custom:a", 20.0004), net("custom:b", 0.000321)] }),
      caps,
    );
    expect(plan.taken).toEqual([{ stackKey: "custom:a", qty: 20 }]);
    expect(plan.left).toEqual([
      { stackKey: "custom:a", qty: 0.0004 },
      { stackKey: "custom:b", qty: 0.000321 },
    ]);
  });

  it("зелье — только в сумку зелий, остаток — мешочком", () => {
    const plan = pickupPlan(
      snap({ last: true, guard: null, bag: bagOf(20), net: [net("custom:p", 25, true)] }),
      caps,
    );
    // Сумка на одну ячейку: 20 штук зелья, остаток — мешочком, хотя в рюкзаке
    // после сундука ещё две свободные ячейки.
    expect(plan.taken).toEqual([{ stackKey: "custom:p", qty: 20 }]);
    expect(plan.left).toEqual([{ stackKey: "custom:p", qty: 5 }]);
  });

  it("переполненная сумка: зелья сети — мешочком, товары ложатся в рюкзак", () => {
    const bag = [
      { stackKey: "custom:p", count: 12, potion: true },
      { stackKey: "custom:q", count: 20, potion: true },
    ];
    const plan = pickupPlan(
      snap({ last: true, guard: null, bag, net: [net("custom:p", 5, true), net("custom:a", 5)] }),
      caps,
    );
    expect(plan.taken).toEqual([{ stackKey: "custom:a", qty: 5 }]);
    expect(plan.left).toEqual([{ stackKey: "custom:p", qty: 5 }]);
  });

  it("сундук в сети того же вида — одна строка на ключ", () => {
    const plan = pickupPlan(snap({ last: true, guard: null, net: [net("custom:cst_mc", 2)] }), caps);
    expect(plan.rows).toEqual([expect.objectContaining({ k: "custom:cst_mc", qty: 3, loot: 2 })]);
  });
});

describe("чужой", () => {
  it("охраны не получает — ни строки, ни ячейки", () => {
    const plan = pickupPlan(snap({ bag: bagOf(20, 20, 20) }), caps, true);
    expect(plan).toMatchObject({ fits: true, chestBagged: false });
    expect(plan.rows.map((r) => r.k)).toEqual(["custom:cst_mc"]);
  });

  it("места нет — сундук мешочком без метки, план годен", () => {
    const plan = pickupPlan(snap({ guard: null, bag: bagOf(20, 20, 20, 20) }), caps, true);
    expect(plan).toMatchObject({ fits: true, chestBagged: true, rows: [], taken: [] });
    expect(plan.bagged).toEqual([expect.objectContaining({ k: "custom:cst_mc", n: 1, loot: 0 })]);
  });

  it("последний без места — сундук и сеть мешочком, долив в свою ячейку — в рюкзак", () => {
    const bag = [...bagOf(20, 20, 20), { stackKey: "custom:cst_ore", count: 15, potion: false }];
    const plan = pickupPlan(snap({ guard: null, last: true, bag }), caps, true);
    expect(plan.chestBagged).toBe(true);
    expect(plan.taken).toEqual([{ stackKey: "custom:cst_ore", qty: 5 }]);
    expect(plan.bagged).toEqual([
      expect.objectContaining({ k: "custom:cst_mc", n: 1, loot: 0 }),
      expect.objectContaining({ k: "custom:cst_ore", n: 25, loot: 25 }),
    ]);
  });

  it("сундук мешочком и тот же вид в сети — одна порция на ключ", () => {
    const plan = pickupPlan(
      snap({ guard: null, last: true, bag: bagOf(20, 20, 20, 20), net: [net("custom:cst_mc", 2)] }),
      caps,
      true,
    );
    expect(plan.bagged).toEqual([expect.objectContaining({ k: "custom:cst_mc", n: 3, loot: 2 })]);
    expect(plan.left).toEqual([{ stackKey: "custom:cst_mc", qty: 2 }]);
  });
});

describe("снимок", () => {
  it("сундука нет — план пустой и не влезающий", () => {
    expect(pickupPlan(snap({ chest: null }), caps)).toMatchObject({ fits: false, rows: [] });
  });

  it("отпечаток цифр меняется с рюкзаком, сетью и «последним»", () => {
    const base = sigOf(snap());
    expect(sigOf(snap({ bagFp: "x" }))).not.toBe(base);
    expect(sigOf(snap({ netFp: "x" }))).not.toBe(base);
    expect(sigOf(snap({ last: true }))).not.toBe(base);
  });
});
