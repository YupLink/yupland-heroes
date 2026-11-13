// Чужой шаг из живого потока: шагающий — в игре, его онлайн переезжает вместе с ним.
import { describe, expect, it } from "vitest";
import { movePlayerDot } from "./movePlayerDot";

describe("movePlayerDot", () => {
  it("онлайн уходит из клетки «откуда» и приходит в «куда»", () => {
    const out = movePlayerDot(
      [
        { q: 0, r: 0, count: 2, online: 1 },
        { q: 1, r: 0, count: 1, online: 0 },
      ],
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    );
    expect(out).toEqual([
      { q: 0, r: 0, count: 1, online: 0 },
      { q: 1, r: 0, count: 2, online: 1 },
    ]);
  });

  it("в пустую клетку — новый лагерь онлайн; опустевшая клетка пропадает", () => {
    const out = movePlayerDot([{ q: 0, r: 0, count: 1, online: 1 }], { q: 0, r: 0 }, { q: 2, r: 2 });
    expect(out).toEqual([{ q: 2, r: 2, count: 1, online: 1 }]);
  });

  it("онлайн не уходит в минус и не больше людей в клетке", () => {
    const out = movePlayerDot([{ q: 0, r: 0, count: 2, online: 0 }], { q: 0, r: 0 }, { q: 0, r: 1 });
    expect(out[0]).toEqual({ q: 0, r: 0, count: 1, online: 0 });
  });
});
