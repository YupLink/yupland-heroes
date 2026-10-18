import { describe, expect, it } from "vitest";
import { evaluateSpin } from "./evaluate";
import { slotReducer } from "./reducer";
import { initialSlotState } from "./state";
import { startBonus, startSuper } from "./bonus";
import { startRisk } from "./risk";
import type { Grid, SymbolId } from "./types";

const fill = (s: SymbolId): Grid => [0, 1, 2, 3, 4].map(() => [s, s, s]);
const bonusGrid: Grid = [
  ["bonus", "bar1", "bar2"],
  ["bar2", "bonus", "bar1"],
  ["bar1", "bar2", "bonus"],
  ["bar2", "bar1", "bar2"],
  ["bar1", "bar2", "bar1"],
];

describe("slot reducer", () => {
  it("спин списывает ставку, выигрыш зачисляется сам, статистика считается", () => {
    let s = initialSlotState(100);
    s = slotReducer(s, { type: "set-lines", lines: 3 });
    s = slotReducer(s, { type: "next-bet" }); // 1 → 2
    expect(s.bet).toBe(2);
    s = slotReducer(s, { type: "spin", result: evaluateSpin(fill("bar1"), 3, 2) });
    expect(s).toMatchObject({ phase: "spinning", balance: 94 });
    s = slotReducer(s, { type: "stopped" });
    // bar1×5 = 20 на линию, 3 линии, ставка 2 → 120, уже на балансе
    expect(s).toMatchObject({ phase: "won", lastWin: 120, balance: 214 });
    expect(s.stats).toMatchObject({ spins: 1, wagered: 6, won: 120, bestWin: 120 });
  });
  it("баланс за сессию: начало, минимум, максимум, пополнения", () => {
    let s = initialSlotState(100);
    s = slotReducer(s, { type: "set-balance", balance: 50 });
    expect(s.stats).toMatchObject({ spins: 0, topups: 0 });
    s = slotReducer(s, { type: "spin", result: evaluateSpin(fill("bonus"), 9, 1) });
    expect(s.stats).toMatchObject({ startBalance: 50, minBalance: 41, maxBalance: 50 });
    s = slotReducer(s, { type: "stopped" });
    s = slotReducer(s, { type: "bonus-enter" });
    s = slotReducer(s, { type: "topup", amount: 1000 });
    expect(s.stats).toMatchObject({ topups: 1000, minBalance: 41, maxBalance: 1041 });
    s = slotReducer(s, { type: "stats-reset" });
    expect(s.stats).toMatchObject({ spins: 0, startBalance: 0, topups: 0 });
  });

  it("ставка идёт по кругу: после 100 снова 1", () => {
    let s = initialSlotState(100);
    for (let i = 0; i < 9; i++) s = slotReducer(s, { type: "next-bet" });
    expect(s.bet).toBe(100);
    s = slotReducer(s, { type: "next-bet" });
    expect(s.bet).toBe(1);
  });
  it("не хватает на ставку — спина нет, автокрутка выключается", () => {
    let s = slotReducer(initialSlotState(5), { type: "toggle-auto" });
    s = slotReducer(s, { type: "spin", result: evaluateSpin(fill("bar2"), 9, 1) });
    expect(s).toMatchObject({ phase: "idle", balance: 5, auto: false });
  });
  it("бонус открывается после остановки, автокрутка при этом выключается", () => {
    let s = slotReducer(initialSlotState(100), { type: "toggle-auto" });
    s = slotReducer(s, { type: "spin", result: evaluateSpin(bonusGrid, 9, 1) });
    s = slotReducer(s, { type: "stopped" });
    expect(s).toMatchObject({ phase: "bonus-won", bonusStake: 9, auto: false });
    s = slotReducer(s, { type: "bonus-enter" });
    expect(s.phase).toBe("bonus");
    s = slotReducer(s, { type: "bonus-start", bonus: startBonus(() => 0.999) });
    const col = s.bonus!.board[0].findIndex((v) => v > 0);
    s = slotReducer(s, { type: "bonus-pick", col });
    expect(s.bonus!.won).toBe(s.bonus!.board[0][col] * 9);
    const trap = s.bonus!.board[1].indexOf(0);
    s = slotReducer(s, { type: "bonus-pick", col: trap });
    // ловушка остаётся на экране, закрытие — отдельным действием
    expect(s.phase).toBe("bonus");
    s = slotReducer(s, { type: "bonus-close" });
    expect(s.phase).toBe("bonus-end");
    const won = s.bonusTotal;
    const lineWin = s.result!.totalWin;
    s = slotReducer(s, { type: "bonus-finish" });
    expect(s).toMatchObject({ phase: "idle", balance: 91 + lineWin + won, bonus: null });
  });
  it("прошёл 4 ряда — последняя находка остаётся, супер-бонус после паузы; промах закрывает его, набранное остаётся", () => {
    let s = slotReducer(initialSlotState(100), { type: "set-lines", lines: 1 });
    s = slotReducer(s, { type: "spin", result: evaluateSpin(bonusGrid, 1, 1) });
    s = slotReducer(s, { type: "stopped" });
    s = slotReducer(s, { type: "bonus-enter" });
    s = slotReducer(s, { type: "bonus-start", bonus: startBonus(() => 0.999) });
    for (let row = 0; row < 4; row++) {
      const col = s.bonus!.board[row].findIndex((v) => v > 0);
      s = slotReducer(s, { type: "bonus-pick", col });
    }
    expect(s.phase).toBe("bonus");
    s = slotReducer(s, { type: "super-enter" });
    expect(s.phase).toBe("super");
    s = slotReducer(s, { type: "super-start", superGame: startSuper(() => 0.1) });
    s = slotReducer(s, { type: "super-pick", side: 0 });
    expect(s.superGame!.pot).toBe(25);
    s = slotReducer(s, { type: "super-next" });
    s = slotReducer(s, { type: "super-pick", side: 1 }); // промах
    expect(s.phase).toBe("super");
    s = slotReducer(s, { type: "bonus-close" });
    expect(s.phase).toBe("bonus-end");
    expect(s.bonusTotal).toBe(s.bonus!.won + 25);
  });
  it("риск снимает выигрыш с баланса; проигрыш — ноль, «забрать» возвращает", () => {
    let s = slotReducer(initialSlotState(100), { type: "set-lines", lines: 1 });
    s = slotReducer(s, { type: "spin", result: evaluateSpin(fill("bar1"), 1, 1) });
    s = slotReducer(s, { type: "stopped" });
    expect(s).toMatchObject({ lastWin: 20, balance: 119 });
    // Карты под исход раскладывает сервер (resolvePick); здесь — сразу ничья.
    const dealt = startRisk(20, () => 0.5);
    const push = { ...dealt, hand: dealt.hand.map(() => ({ ...dealt.dealer, suit: 0 })) };
    s = slotReducer(s, { type: "risk-start", risk: push });
    expect(s).toMatchObject({ phase: "risk", pending: 20, balance: 99 });
    s = slotReducer(s, { type: "risk-pick", index: 0 }); // равно → переигровка
    expect(s.phase).toBe("risk");
    s = slotReducer(s, { type: "risk-take" });
    expect(s).toMatchObject({ phase: "idle", balance: 119, pending: 0 });
    expect(s.stats).toMatchObject({
      riskGames: 1,
      riskWins: 0,
      riskLosses: 0,
      riskIn: 20,
      riskOut: 20,
      won: 20,
    });
    const lose = slotReducer(
      {
        ...s,
        phase: "risk",
        pending: 20,
        balance: 99,
        risk: { ...startRisk(20, () => 0.5), dealer: { rank: 14, suit: 0 } },
      },
      { type: "risk-pick", index: 0 },
    );
    expect(lose).toMatchObject({ phase: "risk", balance: 99, pending: 0, lastWin: 0 });
    expect(lose.risk?.outcome).toBe("lose");
    expect(lose.stats).toMatchObject({ riskLosses: 1 });
    expect(slotReducer(lose, { type: "risk-close" })).toMatchObject({
      phase: "idle",
      balance: 99,
      risk: null,
    });
  });
});
