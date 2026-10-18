// Отдача и механики слота на больших числах: точный расчёт, симуляция,
// удвоение и полная игра через состояние со случайными решениями игрока.
import { describe, expect, it } from "vitest";
import {
  BONUS_COLS,
  nextSuper,
  pickFloe,
  pickSide,
  PRIZE_TABLE,
  reachedShore,
  startBonus,
  startSuper,
} from "./bonus";
import { evaluateSpin } from "./evaluate";
import { rollGrid } from "./reels";
import { nextRisk, pickCard, resolvePick, startRisk } from "./risk";
import { SMART_BOOST, rtpReport, smartBoost } from "./rtp";
import { RISK_STYLES, seededRng, simulate } from "./simulate";

const seeded = seededRng;

describe("отдача слота", () => {
  it("точный расчёт: без удвоения 58 % (линии ≈ 33 %, бонус ≈ 25 %); у умного с удвоением — 90 %", () => {
    const r = rtpReport();
    expect(r.total).toBeGreaterThan(0.576);
    expect(r.total).toBeLessThan(0.588);
    expect(r.lines).toBeGreaterThan(0.32);
    expect(r.lines).toBeLessThan(0.34);
    expect(r.bonusChance).toBeGreaterThan(0.0105);
    expect(r.bonusChance).toBeLessThan(0.012);
    // Умный игрок умножает выигрыш линий в SMART_BOOST раз (бонус не удваивается,
    // выигрыш линий на спине с бонусом — тоже: ~0,17 п.п. линий, поправка ниже).
    const smart = r.lines * SMART_BOOST + r.bonus - 0.0017 * (SMART_BOOST - 1);
    expect(smart).toBeGreaterThan(0.899);
    expect(smart).toBeLessThan(0.901);
  });

  it("лучшая стратегия удвоения при честной колоде: ×1,969 (точный расчёт)", () => {
    expect(smartBoost()).toBeCloseTo(SMART_BOOST, 3);
  });

  it("призы бонуса: крупнее в N раз — реже в N раз (вес × икс одинаков)", () => {
    const products = PRIZE_TABLE.map(([m, w]) => m * w);
    for (const p of products) expect(p).toBeCloseTo(products[0], 6);
    const w = new Map(PRIZE_TABLE);
    expect(w.get(1)! / w.get(250)!).toBeCloseTo(250, 6);
  });

  it("симуляция 300 тыс. спинов совпадает с расчётом", () => {
    const rng = seeded(42);
    let wag = 0;
    let won = 0;
    for (let i = 0; i < 300_000; i++) {
      wag += 9;
      const res = evaluateSpin(rollGrid(rng), 9, 1);
      won += res.totalWin;
      if (!res.bonus) continue;
      let b = startBonus(rng);
      while (!b.fell && !reachedShore(b)) b = pickFloe(b, Math.floor(rng() * BONUS_COLS), 9);
      won += b.won;
      if (!reachedShore(b)) continue;
      let s = startSuper(rng);
      while (!s.done) s = nextSuper(pickSide(s, rng() < 0.5 ? 0 : 1, 9));
      won += s.pot;
    }
    expect(won / wag).toBeGreaterThan(0.55);
    expect(won / wag).toBeLessThan(0.61);
  });
});

describe("удвоение", () => {
  it("удвоить k раз и забрать, выбирая против любой карты — отдача 100 % при любом k", () => {
    for (const k of [1, 2, 5]) {
      const rng = seededRng(100 + k);
      let paid = 0;
      const N = 400_000;
      for (let i = 0; i < N; i++) {
        let r = startRisk(1, rng);
        for (;;) {
          const i = Math.floor(rng() * 4);
          r = pickCard(resolvePick(r, i, rng), i);
          if (r.outcome === "lose" || r.done || (r.outcome === "win" && r.rounds >= k)) break;
          r = nextRisk(r, rng);
        }
        paid += r.stake;
      }
      expect(paid / N).toBeGreaterThan(0.98);
      expect(paid / N).toBeLessThan(1.02);
    }
  }, 60_000);
});

describe("полная игра через состояние (бот жмёт кнопки)", () => {
  // Ожидаемая отдача автомата по стилю (прогоны 17.10 по 8 млн спинов) и допуск.
  const EXPECT: Record<string, number> = {
    never: 0.581,
    once: 0.581,
    two: 0.581,
    max: 0.581,
    random: 0.581,
    peek: 0.86,
    low: 0.724,
    ace: 0.707,
    smart: 0.9,
  };
  for (const style of RISK_STYLES) {
    it(`удвоение «${style}»: учёт сходится, автомат ≈ ${Math.round(EXPECT[style] * 100)} %`, () => {
      const r = simulate(300_000, style, 2026);
      const st = r.state.stats;
      expect(r.ledgerBroken).toBe(false);
      expect(st.spins).toBe(300_000);
      const band = style === "smart" || style === "peek" || style === "max" ? 0.07 : 0.05;
      expect(st.won / st.wagered).toBeGreaterThan(EXPECT[style] - band);
      expect(st.won / st.wagered).toBeLessThan(EXPECT[style] + band);
      // Никакой стиль не выше 90 % (с допуском на разброс).
      expect(st.won / st.wagered).toBeLessThan(0.97);
      if (style === "never") expect(st.riskGames).toBe(0);
      else expect(st.riskGames).toBeGreaterThan(1000);
    }, 120_000);
  }

  it("отдача не зависит от числа линий и ставки на линию", () => {
    for (const [lines, bet] of [
      [1, 1],
      [5, 2],
      [9, 100],
    ] as const) {
      const r = simulate(300_000, "never", 77 + lines, { lines, bet });
      const st = r.state.stats;
      expect(r.ledgerBroken).toBe(false);
      expect(st.won / st.wagered).toBeGreaterThan(0.53);
      expect(st.won / st.wagered).toBeLessThan(0.63);
    }
  }, 60_000);

  it("без пополнений бот останавливается на нуле, баланс не уходит в минус", () => {
    const r = simulate(5000, "max", 3, { bet: 10, start: 1000, stopWhenBroke: true });
    expect(r.ledgerBroken).toBe(false);
    expect(r.state.balance).toBeGreaterThanOrEqual(0);
    if (r.broke) expect(r.state.balance).toBeLessThan(90);
  });
});
