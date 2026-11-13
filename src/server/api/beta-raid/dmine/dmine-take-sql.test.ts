// Вызов функции базы raid_dmine_take и разбор её ответа и отказов (minebag-02):
// чистые функции без базы — числа не уходят в SQL как есть, исключения базы —
// ключами словаря (хозяин свою не поднимает, одно поднятие до размещения).
import { describe, expect, it } from "vitest";
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import { takeDmineSql, takeErrorOf, takeResOf } from "./dmine-take-sql";

describe("dmine-take-sql", () => {
  it("ответ базы — объектом и строкой; без id — null", () => {
    expect(takeResOf([{ res: { was: true, id: "dm_1", paid: "5" } }])).toEqual({
      was: true,
      id: "dm_1",
      paid: 5,
    });
    expect(takeResOf([{ res: '{"was":false,"id":"dm_2","paid":0}' }])).toEqual({
      was: false,
      id: "dm_2",
      paid: 0,
    });
    expect(takeResOf([{ res: { was: false } }])).toBeNull();
    expect(takeResOf([])).toBeNull();
  });

  it("исключения базы → ключи словаря", () => {
    const m = (x: string) => takeErrorOf(new Error(x), 7).message;
    expect(m("not_enough_energy")).toBe('mineplace.no_energy|{"need":7}');
    expect(m("dmine_room:2")).toBe("market.backpack_need:1:2");
    expect(m("dmine_guarded")).toBe("braid.mine_guarded");
    expect(m("dmine_own")).toBe("dmine.own");
    expect(m("dmine_once")).toBe("dmine.once");
    // Защита на час: созревающий гриб — «Гриб ещё не созрел».
    expect(m("dmine_unripe")).toBe("dmine.unripe");
    // Блок клеток больше не отказ: шахта-блок берётся целиком.
    expect(m("dmine_block")).toBe("dmine_block");
    expect(m("dmine_not_darai")).toBe("dmine.not_darai");
    expect(m("dmine_gone")).toBe("dmine.gone");
    expect(m("что-то ещё")).toBe("что-то ещё");
  });

  it("вызов: отрицательные и дробные числа не уходят в базу как есть", () => {
    const sql = takeDmineSql({
      op: "o",
      mapId: "m",
      q: 1.7,
      r: -2.2,
      account: "a",
      wallet: "w",
      heroId: "h",
      capacity: -3,
      cost: Number.NaN,
    });
    expect(sql).toMatch(
      new RegExp(`'m', 1,\\s+-3, 'a', 'w', 'h',\\s+0, ${CELL_SIZE}, 0, 'Гриб DARAI'`),
    );
    // Подпись стопки — по виду гриба.
    const gold = takeDmineSql({
      op: "o",
      mapId: "m",
      q: 1,
      r: 1,
      account: "a",
      wallet: "w",
      heroId: "h",
      capacity: 8,
      cost: 5,
      name: "Золотой гриб",
    });
    expect(gold).toContain("'Золотой гриб') AS res");
  });
});
