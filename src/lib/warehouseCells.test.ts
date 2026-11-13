// Раскладка по полкам склада. Главное — выбор игрока: «в свою» и «в общую»
// не должны перетекать друг в друга, а «auto» обязан вести себя как раньше.
// Плюс дроби (награды боссов) и полка, где два стека с одинаковым счётом.
import { describe, it, expect } from "vitest";
import {
  splitDeposit,
  roundQty,
  exactQty,
  moveQty,
  OWN_CELLS,
  SHARED_CELLS,
  CELL_SIZE,
} from "./warehouseCells";

const empty = { ownSame: 0, ownCounts: [], sharedSame: 0, sharedCounts: [] };

describe("splitDeposit", () => {
  it("auto: сперва свои, остаток на общую", () => {
    const all = OWN_CELLS * CELL_SIZE;
    expect(splitDeposit({ qty: all + 5, ...empty })).toEqual({
      own: all,
      shared: 5,
      rejected: 0,
    });
  });

  it("own: в общую не перетекает — лишнее отсекается", () => {
    const all = OWN_CELLS * CELL_SIZE;
    const r = splitDeposit({ qty: all + 5, scope: "own", ...empty });
    expect(r.own).toBe(all);
    expect(r.shared).toBe(0);
    expect(r.rejected).toBe(5);
  });

  it("shared: свои ячейки не занимает вовсе", () => {
    const r = splitDeposit({ qty: 10, scope: "shared", ...empty });
    expect(r).toEqual({ own: 0, shared: 10, rejected: 0 });
  });

  it("shared: больше общей полки не влезет", () => {
    const cap = SHARED_CELLS * CELL_SIZE;
    const r = splitDeposit({ qty: cap + 7, scope: "shared", ...empty });
    expect(r.shared).toBe(cap);
    expect(r.rejected).toBe(7);
  });

  it("свои ячейки заняты чужим видом — «own» отказывает, а не молчит", () => {
    const busy = Array.from({ length: OWN_CELLS }, () => CELL_SIZE);
    const r = splitDeposit({ qty: 5, scope: "own", ...empty, ownCounts: busy });
    expect(r.own).toBe(0);
    expect(r.rejected).toBe(5);
  });
});

describe("splitDeposit: дробные единицы", () => {
  it("0,79 на пустой склад ложится целиком в свою ячейку", () => {
    expect(splitDeposit({ qty: 0.79, ...empty })).toEqual({ own: 0.79, shared: 0, rejected: 0 });
  });

  it("1,5 не режется до 1 — хвост не остаётся в рюкзаке", () => {
    expect(splitDeposit({ qty: 1.5, ...empty }).own).toBe(1.5);
  });

  it("остаток ячейки дробный — без float-мусора в own/shared", () => {
    // Своего вида — ячейка без 0,1 + полный чужой стек: в личной остаётся ровно 0,1.
    const r = splitDeposit({
      qty: 0.3,
      ownSame: CELL_SIZE - 0.1,
      ownCounts: [CELL_SIZE - 0.1, CELL_SIZE],
      sharedSame: 0,
      sharedCounts: [],
    });
    expect(r).toEqual({ own: 0.1, shared: 0.2, rejected: 0 });
  });

  it("личные и общие заняты чужими видами — честный отказ и для дроби", () => {
    const r = splitDeposit({
      qty: 0.79,
      ownSame: 0,
      ownCounts: Array.from({ length: OWN_CELLS }, () => CELL_SIZE),
      sharedSame: 0,
      sharedCounts: Array.from({ length: SHARED_CELLS }, () => CELL_SIZE),
    });
    expect(r).toEqual({ own: 0, shared: 0, rejected: 0.79 });
  });
});

describe("splitDeposit: два стека с одинаковым счётом", () => {
  // Регрессия: свой стек исключался по ЗНАЧЕНИЮ count, и «Помидоры N |
  // Молоко N» считались одной занятой ячейкой вместо двух.
  it("own: полка из двух полных стеков — места нет", () => {
    const full = [CELL_SIZE, CELL_SIZE];
    const r = splitDeposit({
      qty: CELL_SIZE,
      scope: "own",
      ...empty,
      ownSame: CELL_SIZE,
      ownCounts: full,
    });
    expect(r).toEqual({ own: 0, shared: 0, rejected: CELL_SIZE });
  });

  it("auto: та же полка — всё уходит на общую", () => {
    const full = [CELL_SIZE, CELL_SIZE];
    const r = splitDeposit({ qty: CELL_SIZE, ...empty, ownSame: CELL_SIZE, ownCounts: full });
    expect(r).toEqual({ own: 0, shared: CELL_SIZE, rejected: 0 });
  });

  it("own: два стека без трёх до полной — доливается только остаток своей ячейки", () => {
    const n = CELL_SIZE - 3;
    const r = splitDeposit({ qty: 10, scope: "own", ...empty, ownSame: n, ownCounts: [n, n] });
    expect(r).toEqual({ own: 3, shared: 0, rejected: 7 });
  });

  it("shared: восемь полных стеков — отказ", () => {
    const busy = Array.from({ length: SHARED_CELLS }, () => CELL_SIZE);
    const r = splitDeposit({
      qty: 5,
      scope: "shared",
      ...empty,
      sharedSame: CELL_SIZE,
      sharedCounts: busy,
    });
    expect(r).toEqual({ own: 0, shared: 0, rejected: 5 });
  });
});

describe("roundQty", () => {
  it("режет float-мусор до тысячных", () => {
    expect(roundQty(0.3 - 0.1)).toBe(0.2);
    expect(roundQty(0.7899999999999991)).toBe(0.79);
    expect(roundQty(20.79 - 0.79)).toBe(20);
  });

  it("отрицательное и −0 не пропускает", () => {
    expect(Object.is(roundQty(-0.0001), 0)).toBe(true);
    expect(roundQty(-3)).toBe(0);
  });
});

// Перенос «всё» между рюкзаком и складом (жалоба 27.09.2026): тысячные
// оставляли в рюкзаке 0,000083 на целую ячейку, а 39,99973 до тысячных — это
// 40, и сервер отвечал «в рюкзаке столько нет».
describe("moveQty: пыль ячейкой не висит", () => {
  it("всё — весь стек точным количеством, а не до тысячных", () => {
    const have = Number("7.738083231472351586");
    expect(moveQty(have, have)).toBe(7.738083231);
    expect(moveQty(have, 7.738)).toBe(7.738083231);
  });

  it("стек, который до тысячных округляется ВВЕРХ, переносится весь", () => {
    const have = Number("39.999728747083907307");
    expect(moveQty(have, have)).toBe(39.999728747);
    expect(moveQty(have, 40)).toBe(39.999728747);
  });

  it("крошка меньше тысячной — переносится, а не «слишком мало»", () => {
    const have = Number("0.000454660540250266");
    expect(moveQty(have, have)).toBe(0.000454661);
    expect(moveQty(have, 1)).toBe(0.000454661);
  });

  it("частичный перенос — ровно просьба, остаток на месте", () => {
    expect(moveQty(25, 5)).toBe(5);
    expect(moveQty(20.79, 0.7899999999999991)).toBe(0.79);
    expect(moveQty(27.738083231472352, 7.738083231)).toBe(7.738083231);
  });

  it("нечего переносить — ноль", () => {
    expect(moveQty(0, 5)).toBe(0);
    expect(moveQty(5, 1e-12)).toBe(0);
  });

  it("exactQty: девять знаков без float-хвоста и без минуса", () => {
    expect(exactQty(0.3 - 0.1)).toBe(0.2);
    expect(exactQty(-1e-12)).toBe(0);
  });
});

describe("splitDeposit exact: ручной перенос без тысячных", () => {
  it("длинная дробь ложится целиком в свою ячейку", () => {
    expect(splitDeposit({ qty: 7.738083231, exact: true, ...empty })).toEqual({
      own: 7.738083231,
      shared: 0,
      rejected: 0,
    });
  });

  it("крошка не режется в ноль", () => {
    expect(splitDeposit({ qty: 0.000454661, exact: true, ...empty }).own).toBe(0.000454661);
    // Без exact (урожай с полей) — прежние тысячные.
    expect(splitDeposit({ qty: 0.000454661, ...empty }).own).toBe(0);
  });

  it("пыль, не влезшая в своё, не открывает ячейку на общей полке", () => {
    // Своего вида — ячейка без 7,738 + чужой стек: в личной остаётся ровно 7,738.
    const r = splitDeposit({
      qty: 7.738083231,
      exact: true,
      ownSame: CELL_SIZE - 7.738,
      ownCounts: [CELL_SIZE - 7.738, CELL_SIZE],
      sharedSame: 0,
      sharedCounts: [],
    });
    expect(r).toEqual({ own: 7.738, shared: 0, rejected: 0.000083231 });
  });

  it("не пыль — переливается на общую, как раньше", () => {
    const r = splitDeposit({
      qty: 10.5,
      exact: true,
      ownSame: CELL_SIZE - 7.738,
      ownCounts: [CELL_SIZE - 7.738, CELL_SIZE],
      sharedSame: 0,
      sharedCounts: [],
    });
    expect(r).toEqual({ own: 7.738, shared: 2.762, rejected: 0 });
  });
});
