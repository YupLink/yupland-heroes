import { describe, expect, it } from "vitest";
import { HIDDEN, publicView } from "./publicView";
import { SlotRefused, moneyKind, serverStep } from "./serverStep";
import { seededRng } from "./simulate";
import { initialSlotState, type SlotState } from "./state";

const rng = seededRng(5);

/** Крутить до нужного исхода (детерминированно по зерну). */
function spinUntil(pred: (s: SlotState) => boolean, start = 10_000): SlotState {
  const r = seededRng(11);
  for (let i = 0; i < 5000; i++) {
    const s = serverStep({ ...initialSlotState(start) }, { type: "spin", lines: 9, bet: 1 }, r);
    if (pred(s)) return s;
  }
  throw new Error("не выпало");
}

describe("ход на сервере", () => {
  it("спин: ставка списана, выигрыш линий зачислен, барабаны уже остановлены", () => {
    const s = serverStep(initialSlotState(100), { type: "spin", lines: 9, bet: 1 }, rng);
    expect(s.phase).not.toBe("spinning");
    expect(s.balance).toBe(100 - 9 + (s.result?.totalWin ?? 0));
    expect(s.stats.spins).toBe(1);
  });

  it("отказ: нет такой ставки, мало золота, ход не в той фазе", () => {
    expect(() =>
      serverStep(initialSlotState(100), { type: "spin", lines: 2, bet: 1 }, rng),
    ).toThrow(SlotRefused);
    expect(() =>
      serverStep(initialSlotState(100), { type: "spin", lines: 9, bet: 7 }, rng),
    ).toThrow(SlotRefused);
    expect(() => serverStep(initialSlotState(5), { type: "spin", lines: 9, bet: 1 }, rng)).toThrow(
      "slot.not_enough",
    );
    const bonus = { ...initialSlotState(100), phase: "bonus" as const };
    expect(() => serverStep(bonus, { type: "spin", lines: 9, bet: 1 }, rng)).toThrow("slot.busy");
  });

  it("бонус: доска разыгрывается сервером, браузер видит только открытые кучки", () => {
    let s = spinUntil((x) => x.phase === "bonus-won");
    s = serverStep(s, { type: "bonus-enter" }, rng);
    expect(s.phase).toBe("bonus");
    expect(s.bonus?.board).toHaveLength(4);
    const pv = publicView(s);
    expect(pv.bonus!.board.flat().every((v) => v === HIDDEN)).toBe(true);
    s = serverStep(s, { type: "bonus-pick", col: 2 }, rng);
    const pv2 = publicView(s);
    expect(pv2.bonus!.board[0][2]).toBe(s.bonus!.board[0][2]);
    expect(pv2.bonus!.board[0].filter((v) => v !== HIDDEN)).toHaveLength(1);
  });

  it("удвоение: карты игрока скрыты до выбора и открыты все после, деньги снимаются на кон", () => {
    let s = spinUntil((x) => x.phase === "won" && x.lastWin > 0);
    const before = s.balance;
    const win = s.lastWin;
    s = serverStep(s, { type: "risk-start" }, rng);
    expect(s.balance).toBe(before - win);
    expect(moneyKind({ type: "risk-start" })).toBe("slot_risk");
    const pv = publicView(s);
    expect(pv.risk!.hand.every((c) => c.rank === 0)).toBe(true);
    s = serverStep(s, { type: "risk-pick", index: 1 }, rng);
    expect(publicView(s).risk!.hand).toEqual(s.risk!.hand);
    // Следующий раунд — новая раздача, снова закрытая.
    if (s.risk!.outcome !== "lose" && !s.risk!.done) {
      s = serverStep(s, { type: "risk-next" }, rng);
      expect(publicView(s).risk!.hand.every((c) => c.rank === 0)).toBe(true);
    }
  });

  it("супер-бонус: где клад на будущих попытках — скрыто", () => {
    let s = spinUntil((x) => x.phase === "bonus-won");
    s = serverStep(s, { type: "bonus-enter" }, rng);
    // Пройти раскоп: открываем любую кучку без ловушки (сервер знает доску).
    for (let row = 0; row < 4; row++) {
      const col = s.bonus!.board[row].findIndex((v) => v > 0);
      s = serverStep(s, { type: "bonus-pick", col }, rng);
    }
    s = serverStep(s, { type: "super-enter" }, rng);
    expect(s.phase).toBe("super");
    expect(publicView(s).superGame!.friend.every((f) => f === HIDDEN)).toBe(true);
    s = serverStep(s, { type: "super-pick", side: s.superGame!.friend[0] as 0 | 1 }, rng);
    const pv = publicView(s);
    expect(pv.superGame!.friend[0]).toBe(s.superGame!.friend[0]);
    expect(pv.superGame!.friend.slice(1).every((f) => f === HIDDEN)).toBe(true);
  });

  /** Начатое удвоение на 10 кредитов. */
  const riskOn = (r = rng): SlotState =>
    serverStep(
      { ...initialSlotState(100), phase: "won", lastWin: 10, pending: 10 },
      { type: "risk-start" },
      r,
    );

  it("удвоение: «Забрать» работает при открытой карте соперника — кон возвращается целиком", () => {
    const s = riskOn();
    expect(s.phase).toBe("risk");
    expect(s.balance).toBe(90);
    const took = serverStep(s, { type: "risk-take" }, rng);
    expect(took.phase).toBe("idle");
    expect(took.balance).toBe(100);
    expect(took.risk).toBeNull();
    expect(serverStep(took, { type: "risk-start" }, rng)).toBe(took);
  });

  it("удвоение: выбор открывает сданные карты; исход — сравнение; при проигрыше есть старшая", () => {
    const r = seededRng(31);
    for (let i = 0; i < 3000; i++) {
      const on = riskOn(r);
      const dealt = on.risk!.hand.map((c) => `${c.rank}:${c.suit}`);
      const s = serverStep(on, { type: "risk-pick", index: i % 4 }, r);
      const k = s.risk!;
      const mine = k.hand[i % 4].rank;
      expect(`${k.hand[i % 4].rank}:${k.hand[i % 4].suit}`).toBe(dealt[i % 4]);
      if (k.outcome === "win") expect(mine).toBeGreaterThan(k.dealer.rank);
      if (k.outcome === "push") expect(mine).toBe(k.dealer.rank);
      if (k.outcome === "lose") {
        expect(mine).toBeLessThan(k.dealer.rank);
        expect(k.hand.some((c, j) => j !== i % 4 && c.rank >= k.dealer.rank)).toBe(true);
        expect(serverStep(s, { type: "risk-take" }, r)).toBe(s);
      }
    }
  });

  it("удвоение: пока карта не выбрана, пересдать соперника нельзя", () => {
    const r = seededRng(32);
    const s = riskOn(r);
    expect(serverStep(s, { type: "risk-next" }, r)).toBe(s);
  });

  it("удвоение: раздача прошлой версии (без v:3) сдаётся заново целиком", () => {
    const s = riskOn();
    const { v: _v, ...old } = s.risk!;
    const legacy = {
      ...s,
      risk: {
        ...old,
        dealer: { rank: 3, suit: 0 },
        hand: old.hand.map(() => ({ rank: 0, suit: 0 })),
      },
    };
    for (let i = 0; i < 200; i++) {
      const k = serverStep(legacy, { type: "risk-pick", index: i % 4 }, seededRng(i)).risk!;
      expect(k.v).toBe(3);
      expect(k.picked).toBe(i % 4);
    }
  });

  it("удвоение: повтор выбора (двойной тап) ничего не меняет", () => {
    const s = serverStep(riskOn(), { type: "risk-pick", index: 2 }, rng);
    expect(serverStep(s, { type: "risk-pick", index: 1 }, rng)).toBe(s);
  });

  it("ход без изменений (повтор нажатия) возвращает то же состояние", () => {
    const s = initialSlotState(100);
    expect(serverStep(s, { type: "bonus-finish" }, rng)).toBe(s);
    expect(serverStep(s, { type: "risk-take" }, rng)).toBe(s);
  });
});
