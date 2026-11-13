// Проверка места в рюкзаке: сколько ячеек ДОБАВИТ операция, а не «сколько
// всего занято». Базы здесь нет — стеки рюкзака подменены заглушкой.
//
// Обе жалобы 10.09 (тосты «market.backpack_need:0:0» и «:1:0» на скупке
// артефактов) сидели здесь: рюкзак, оказавшийся НАД ёмкостью, запирался
// насмерть, а «занято» читалось нулём, если ни одного нужного вида в рюкзаке
// ещё не было.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CELL_SIZE } from "@/lib/hero/backpackCells";

const state = vi.hoisted(() => ({
  rows: [] as Array<{ stackKey: string; count: number; potion?: boolean }>,
  /** Товары с галочкой «зелье» — ответ на вопрос potionKeysOf. */
  potions: [] as string[],
  calls: [] as string[],
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    state.calls.push(sql);
    if (/SELECT id FROM yuplink\.raid_custom_item/.test(sql)) {
      return state.potions.map((id) => ({ id }));
    }
    return state.rows;
  },
}));

import { assertBackpackRoom, assertBackpackRoomFor } from "./market-backpack";

const HERO = "hero_1";
/** Ёмкости героя: рюкзак и сумка зелий. */
const caps = (capacity: number, potionCapacity = 0) => ({ heroId: HERO, capacity, potionCapacity });

beforeEach(() => {
  state.rows = [];
  state.potions = [];
  state.calls = [];
});

describe("свободный рюкзак", () => {
  it("пустой принимает новый вид", async () => {
    await expect(assertBackpackRoom(caps(3), "custom:cst_apple", 5)).resolves.toBeUndefined();
  });

  it("занято считается по ВСЕМУ рюкзаку, а не только по нужным видам", async () => {
    // Три занятые ячейки чужих видов, ёмкость 3, кладём четвёртый вид.
    // Прежний запрос фильтровал строки по stack_key: ни один не совпал —
    // строк ноль — «занято» читалось нулём, и проверка пропускала товар.
    state.rows = [
      { stackKey: "custom:cst_milk", count: 5 },
      { stackKey: "custom:cst_wheat", count: 2 },
      { stackKey: "boss:rbt_mummy", count: 10 },
    ];
    await expect(assertBackpackRoom(caps(3), "custom:cst_apple", 1)).rejects.toThrow(
      "market.backpack_need:1:0",
    );
  });

  it("долив в неполную ячейку новых ячеек не требует", async () => {
    state.rows = [{ stackKey: "custom:cst_apple", count: CELL_SIZE - 6 }];
    await expect(assertBackpackRoom(caps(1), "custom:cst_apple", 5)).resolves.toBeUndefined();
  });

  it("перелив через край ячейки требует новую", async () => {
    state.rows = [{ stackKey: "custom:cst_apple", count: CELL_SIZE - 2 }];
    await expect(assertBackpackRoom(caps(1), "custom:cst_apple", 5)).rejects.toThrow(
      "market.backpack_need:1:0",
    );
  });
});

describe("рюкзак над ёмкостью (склад вернул вещи, снятый артефакт уронил Торговлю)", () => {
  // Ровно случай hero_e515xsmpp9: восемь стеков при ёмкости семь.
  const overfilled = [
    { stackKey: "custom:cst_wheat", count: 2 },
    { stackKey: "custom:cst_tomato", count: 5 },
    { stackKey: "custom:cst_milk", count: 5 },
    { stackKey: "boss:rbt_giant", count: 4 },
    { stackKey: "custom:cst_cucumber", count: 3 },
    { stackKey: "custom:cst_apple", count: 14 },
    { stackKey: "custom:cst_board", count: 10 },
    { stackKey: "boss:rbt_mummy", count: 10 },
  ];

  it("долив в существующий стек проходит — новых ячеек не нужно", async () => {
    state.rows = [...overfilled];
    await expect(assertBackpackRoom(caps(7), "custom:cst_apple", 5)).resolves.toBeUndefined();
  });

  it("новый вид всё равно отвергается, и «нужно» никогда не ноль", async () => {
    state.rows = [...overfilled];
    await expect(assertBackpackRoom(caps(7), "custom:cst_iron", 1)).rejects.toThrow(
      "market.backpack_need:1:0",
    );
  });
});

describe("две выплаты сразу (плавильня платит железом и золотом)", () => {
  it("считаются вместе, а не каждая как единственная", async () => {
    // Ёмкость 5, занято 4: одна свободная ячейка на два новых вида.
    state.rows = [
      { stackKey: "custom:cst_apple", count: 3 },
      { stackKey: "custom:cst_milk", count: 3 },
      { stackKey: "custom:cst_board", count: 3 },
      { stackKey: "boss:rbt_mummy", count: 3 },
    ];
    await expect(
      assertBackpackRoomFor(caps(5), [
        { stackKey: "custom:cst_iron", qty: 2 },
        { stackKey: "custom:cst_gold", qty: 1 },
      ]),
    ).rejects.toThrow("market.backpack_need:2:1");
  });

  it("один вид уже лежит — нужна только ячейка под второй", async () => {
    state.rows = [
      { stackKey: "custom:cst_iron", count: 3 },
      { stackKey: "custom:cst_milk", count: 3 },
      { stackKey: "custom:cst_board", count: 3 },
      { stackKey: "custom:cst_apple", count: 3 },
      { stackKey: "boss:rbt_mummy", count: 3 },
    ];
    await expect(
      assertBackpackRoomFor(caps(5), [
        { stackKey: "custom:cst_iron", qty: 2 },
        { stackKey: "custom:cst_gold", qty: 1 },
      ]),
    ).rejects.toThrow("market.backpack_need:1:0");
  });

  it("нулевые количества места не занимают и в базу не ходят", async () => {
    await expect(
      assertBackpackRoomFor(caps(1), [{ stackKey: "custom:cst_iron", qty: 0 }]),
    ).resolves.toBeUndefined();
    expect(state.calls).toHaveLength(0);
  });
});

describe("сумка зелий (галочка «зелье» у товара): зелья только в ней", () => {
  const fullBackpack = [
    { stackKey: "custom:cst_milk", count: 5 },
    { stackKey: "boss:rbt_mummy", count: 10 },
  ];

  it("зелье ложится в сумку, даже когда рюкзак полон", async () => {
    state.rows = [...fullBackpack];
    state.potions = ["cst_heal"];
    await expect(
      assertBackpackRoom(caps(2, 3), "custom:cst_heal", CELL_SIZE),
    ).resolves.toBeUndefined();
  });

  it("не влезшее в сумку зелье в рюкзак НЕ переливается — отказ ключом сумки", async () => {
    // Рюкзак пуст на все пять ячеек, сумка на одну — занята.
    state.rows = [{ stackKey: "custom:cst_speed", count: CELL_SIZE, potion: true }];
    state.potions = ["cst_heal"];
    await expect(assertBackpackRoom(caps(5, 1), "custom:cst_heal", 1)).rejects.toThrow(
      "market.potion_bag_need:1:0",
    );
  });

  it("сумка ровно полна — долив в неполную ячейку своего вида проходит", async () => {
    state.rows = [{ stackKey: "custom:cst_heal", count: CELL_SIZE - 6, potion: true }];
    await expect(assertBackpackRoom(caps(0, 1), "custom:cst_heal", 6)).resolves.toBeUndefined();
    await expect(assertBackpackRoom(caps(0, 1), "custom:cst_heal", 7)).rejects.toThrow(
      "market.potion_bag_need:1:0",
    );
  });

  it("переполненная сумка не берёт даже долив; need — сколько освободить", async () => {
    // Три ячейки зелий при сумке на одну (перебор до 29.09): свободно 0,
    // освободить надо две — тогда сумка снова по ёмкости.
    state.rows = [
      { stackKey: "custom:cst_heal", count: CELL_SIZE - 6, potion: true },
      { stackKey: "custom:cst_speed", count: CELL_SIZE, potion: true },
      { stackKey: "custom:cst_luck", count: 0.4, potion: true },
    ];
    await expect(assertBackpackRoom(caps(9, 1), "custom:cst_heal", 1)).rejects.toThrow(
      "market.potion_bag_need:2:0",
    );
  });

  it("рюкзак не считает зелья: перебор сумки не мешает обычному товару", async () => {
    state.rows = [
      { stackKey: "custom:cst_speed", count: CELL_SIZE, potion: true },
      { stackKey: "custom:cst_heal", count: CELL_SIZE, potion: true },
    ];
    await expect(
      assertBackpackRoom(caps(1, 1), "custom:cst_apple", CELL_SIZE),
    ).resolves.toBeUndefined();
  });

  it("зелья в сумке не занимают ячеек рюкзака", async () => {
    state.rows = [
      { stackKey: "custom:cst_speed", count: CELL_SIZE, potion: true },
      { stackKey: "custom:cst_heal", count: CELL_SIZE, potion: true },
    ];
    await expect(
      assertBackpackRoom(caps(1, 2), "custom:cst_apple", CELL_SIZE),
    ).resolves.toBeUndefined();
  });

  it(`${CELL_SIZE} штук одного зелья — одна ячейка, ${CELL_SIZE + 1} — уже две`, async () => {
    state.potions = ["cst_heal"];
    await expect(
      assertBackpackRoom(caps(0, 1), "custom:cst_heal", CELL_SIZE),
    ).resolves.toBeUndefined();
    await expect(assertBackpackRoom(caps(0, 1), "custom:cst_heal", CELL_SIZE + 1)).rejects.toThrow(
      "market.potion_bag_need:2:1",
    );
  });

  it("две выплаты — зелье и товар: каждую судит своё хранилище", async () => {
    // Рюкзак: ячейка свободна. Сумка: полна.
    state.rows = [{ stackKey: "custom:cst_speed", count: CELL_SIZE, potion: true }];
    state.potions = ["cst_heal"];
    const both = [
      { stackKey: "custom:cst_heal", qty: 1 },
      { stackKey: "custom:cst_iron", qty: 1 },
    ];
    await expect(assertBackpackRoomFor(caps(1, 1), both)).rejects.toThrow(
      "market.potion_bag_need:1:0",
    );
    // Сумка свободна, рюкзак полон — отказ уже рюкзака.
    state.rows = [{ stackKey: "custom:cst_milk", count: CELL_SIZE }];
    await expect(assertBackpackRoomFor(caps(1, 1), both)).rejects.toThrow(
      "market.backpack_need:1:0",
    );
    // Место есть в обоих — проходит.
    state.rows = [];
    await expect(assertBackpackRoomFor(caps(1, 1), both)).resolves.toBeUndefined();
  });
});
