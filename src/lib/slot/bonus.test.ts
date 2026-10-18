import { describe, expect, it } from "vitest";
import {
  BONUS_COLS,
  BONUS_ROWS,
  PRIZE_TABLE,
  ROW_TRAPS,
  SUPER_ATTEMPTS,
  SUPER_PRIZE,
  findKind,
  makeBonusBoard,
  nextSuper,
  pickFloe,
  pickSide,
  reachedShore,
  rollPrize,
  startBonus,
  startSuper,
} from "./bonus";

const seq = (vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe("бонус «Раскопки»", () => {
  it("4 ряда по 5 кучек, в каждом ряду одна ловушка, призы из таблицы 1…250", () => {
    const b = makeBonusBoard(seq([0.3, 0.7, 0.1, 0.9, 0.5]));
    expect(b).toHaveLength(BONUS_ROWS);
    const allowed = new Set(PRIZE_TABLE.map(([m]) => m));
    b.forEach((row, i) => {
      expect(row).toHaveLength(BONUS_COLS);
      expect(row.filter((v) => v === 0)).toHaveLength(ROW_TRAPS[i]);
      row.filter((v) => v > 0).forEach((v) => expect(allowed.has(v)).toBe(true));
    });
    expect(rollPrize(() => 0)).toBe(1);
    expect(rollPrize(() => 0.9999)).toBe(250);
  });
  it("находка по размеру: мешочек до 10, сундук 15–50, магический от 75", () => {
    expect(findKind(1)).toBe("bag");
    expect(findKind(10)).toBe("bag");
    expect(findKind(15)).toBe("chest");
    expect(findKind(50)).toBe("chest");
    expect(findKind(75)).toBe("magic");
    expect(findKind(250)).toBe("magic");
  });
  it("приз × ставка за спин копится, ловушка — конец, 4 ряда — супер", () => {
    let s = startBonus(() => 0.999);
    const stake = 9;
    for (let row = 0; row < BONUS_ROWS; row++) {
      const col = s.board[row].findIndex((v) => v > 0);
      const before = s.won;
      s = pickFloe(s, col, stake);
      expect(s.won - before).toBe(s.board[row][col] * stake);
    }
    expect(reachedShore(s)).toBe(true);
    let t = startBonus(() => 0.001);
    t = pickFloe(t, t.board[0].indexOf(0), stake);
    expect(t.fell).toBe(true);
    expect(pickFloe(t, 1, stake)).toBe(t);
  });
});

describe("супер-бонус «Ночной раскоп»", () => {
  it("угадал — +25 ставок и следующая попытка; промах — конец, набранное остаётся", () => {
    let s = startSuper(() => 0.2); // находка всегда слева
    s = pickSide(s, 0, 10);
    expect(s).toMatchObject({ step: 1, pot: SUPER_PRIZE * 10, lastPick: "hit", done: false });
    s = nextSuper(s);
    expect(s.lastPick).toBeNull();
    s = pickSide(s, 1, 10);
    expect(s).toMatchObject({ pot: SUPER_PRIZE * 10, lastPick: "miss", done: true });
  });
  it("10 удачных попыток = 250 ставок, дальше игра закрыта", () => {
    let s = startSuper(() => 0.9);
    for (let i = 0; i < SUPER_ATTEMPTS; i++) s = pickSide(s, 1, 1);
    expect(s.done).toBe(true);
    expect(s.pot).toBe(SUPER_PRIZE * SUPER_ATTEMPTS);
    expect(pickSide(s, 1, 1)).toBe(s);
  });
});
