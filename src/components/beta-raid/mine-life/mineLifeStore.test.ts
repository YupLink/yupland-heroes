// Хранилище полос: подписка будит кадр, та же ссылка — молчит; поток
// перечитывает полосы только на событие о шахте с полосой без смены владельца.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MineBar } from "@/lib/mineLifeBars";
import {
  getMineBars,
  mineBarsNow,
  mineLifeTouched,
  setMineBars,
  subscribeMineBars,
} from "./mineLifeStore";

const bar: MineBar = { left: 1, at: 0, span: 1 };

beforeEach(() => setMineBars(new Map(), 0));

describe("mineLifeStore", () => {
  it("новые полосы будят подписчика, та же ссылка и тот же сдвиг — нет", () => {
    const fn = vi.fn();
    const stop = subscribeMineBars(fn);
    const next = new Map([["1,1", bar]]);
    setMineBars(next, 0);
    setMineBars(next, 0);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(getMineBars()).toBe(next);
    stop();
    setMineBars(new Map(), 0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("часы сервера = часы телефона − сдвиг; мусорный сдвиг — ноль", () => {
    setMineBars(new Map([["1,1", bar]]), 5000);
    expect(mineBarsNow(10_000)).toBe(5000);
    setMineBars(new Map(), Number.NaN);
    expect(mineBarsNow(10_000)).toBe(10_000);
  });
});

describe("mineLifeTouched", () => {
  beforeEach(() => setMineBars(new Map([["3,4", bar]]), 0));

  it("починка или режим чужой шахты с полосой — перечитать", () => {
    expect(mineLifeTouched({ mine: true }, ["3,4"])).toBe(true);
    expect(mineLifeTouched({ mine: true, owner: false }, ["9,9", "3,4"])).toBe(true);
  });

  it("не шахта, другая клетка, смена владельца (её везут флажки) — нет", () => {
    expect(mineLifeTouched({}, ["3,4"])).toBe(false);
    expect(mineLifeTouched({ mine: true }, ["9,9"])).toBe(false);
    expect(mineLifeTouched({ mine: true }, [])).toBe(false);
    expect(mineLifeTouched({ mine: true, owner: true }, ["3,4"])).toBe(false);
  });
});
