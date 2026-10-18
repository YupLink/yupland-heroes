// Себя из раскладки вычитаем по снимку, а не по текущей клетке — ровно та
// регрессия, которую кэш на 2 с пропустил (тень на шаг позади, 20.09).
import { describe, expect, it } from "vitest";
import { subtractSelf } from "./players-self";

const at = (pairs: Array<[string, string]>) => new Map(pairs);

describe("players-self.subtractSelf", () => {
  it("снимок видит меня в A, я уже в B — A без меня, B не тронут", () => {
    const cells = [
      { q: 0, r: 0, count: 2 },
      { q: 1, r: 0, count: 1 },
    ];
    // «me» в снимке стоит на (0,0); сосед — один на (1,0).
    const out = subtractSelf(cells, at([["me", "0,0"]]), "me");
    expect(out).toEqual([
      { q: 0, r: 0, count: 1 },
      { q: 1, r: 0, count: 1 },
    ]);
  });

  it("я один в клетке — клетка пропадает вовсе", () => {
    const out = subtractSelf([{ q: 3, r: -1, count: 1 }], at([["me", "3,-1"]]), "me");
    expect(out).toEqual([]);
  });

  it("сосед в моей клетке не вычитается", () => {
    const out = subtractSelf([{ q: 3, r: -1, count: 2 }], at([["other", "3,-1"]]), "me");
    expect(out).toEqual([{ q: 3, r: -1, count: 2 }]);
  });

  it("меня в снимке нет (ещё не вышел на карту) — раскладка как есть", () => {
    const cells = [{ q: 5, r: 5, count: 3 }];
    expect(subtractSelf(cells, new Map(), "me")).toEqual(cells);
  });
});
