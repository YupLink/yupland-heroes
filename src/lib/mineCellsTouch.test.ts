// Гейт перечтения «Добычи» по событию 'built': только если задета моя шахта.
import { describe, expect, it } from "vitest";
import { cellsTouchMyMines } from "./mineCellsTouch";

const mines = [
  { q: 35, r: 63 },
  { q: -13, r: 84 },
];

describe("cellsTouchMyMines", () => {
  it("клетка моей шахты в событии — перечитываем", () => {
    expect(cellsTouchMyMines(["35,63"], mines)).toBe(true);
    expect(cellsTouchMyMines(["1,1", "-13,84"], mines)).toBe(true);
  });

  it("чужие клетки (рынок, стройка, чужой сбор) — не перечитываем", () => {
    expect(cellsTouchMyMines(["56,49"], mines)).toBe(false);
    expect(cellsTouchMyMines(["35,64", "36,63"], mines)).toBe(false);
  });

  it("нет своих шахт или кэш ещё не загружен — тишина", () => {
    expect(cellsTouchMyMines(["35,63"], [])).toBe(false);
    expect(cellsTouchMyMines(["35,63"], undefined)).toBe(false);
  });

  it("событие без клеток (полная инвалидация построек) — тишина", () => {
    expect(cellsTouchMyMines([], mines)).toBe(false);
  });

  it("знак минуса и пробелы в ключе значимы: '-13,84' ≠ '13,84'", () => {
    expect(cellsTouchMyMines(["13,84"], mines)).toBe(false);
    expect(cellsTouchMyMines(["-13, 84"], mines)).toBe(false);
  });
});
