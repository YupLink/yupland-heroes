import { describe, expect, it } from "vitest";
import {
  RISK_MAX_ROUNDS,
  cardLabel,
  nextRisk,
  pickCard,
  resolvePick,
  showMissed,
  startRisk,
  type RiskState,
} from "./risk";
import { seededRng } from "./simulate";

const at = (dealer: number, hand: number[]): RiskState => ({
  ...startRisk(50, seededRng(1)),
  dealer: { rank: dealer, suit: 0 },
  hand: hand.map((rank) => ({ rank, suit: 1 })),
});
const key = (c: { rank: number; suit: number }) => `${c.rank}:${c.suit}`;

describe("риск-игра: честная колода + касса игрока", () => {
  it("старше — ×2, равно — пересдача, младше — ноль", () => {
    expect(pickCard(at(5, [9, 2, 2, 2]), 0)).toMatchObject({
      outcome: "win",
      stake: 100,
      rounds: 1,
    });
    const push = pickCard(at(8, [8, 2, 2, 2]), 0);
    expect(push).toMatchObject({ outcome: "push", stake: 50 });
    expect(nextRisk(push, seededRng(2)).picked).toBeNull();
    expect(pickCard(at(12, [3, 3, 3, 3]), 1)).toMatchObject({
      outcome: "lose",
      stake: 0,
      done: true,
    });
  });

  it("честная колода: соперник — любая карта 2…A поровну, карты без повторов", () => {
    const rng = seededRng(3);
    const ranks = new Array(15).fill(0);
    const N = 260_000;
    for (let i = 0; i < N; i++) {
      const r = startRisk(1, rng);
      expect(new Set([r.dealer, ...r.hand].map(key)).size).toBe(5);
      ranks[r.dealer.rank]++;
    }
    for (let rank = 2; rank <= 14; rank++) expect(ranks[rank] / N).toBeCloseTo(1 / 13, 2);
  });

  it("исход — сравнение карт: против 3 проигрыш редкий, против K частый; ничья как в колоде", () => {
    const rng = seededRng(5);
    const by: Record<number, [number, number, number]> = {};
    for (let i = 0; i < 400_000; i++) {
      const r = pickCard(startRisk(1, rng), i % 4);
      const d = r.dealer.rank;
      by[d] ??= [0, 0, 0];
      by[d][r.outcome === "win" ? 0 : r.outcome === "lose" ? 1 : 2]++;
    }
    const share = (d: number, k: 0 | 1 | 2) => by[d][k] / (by[d][0] + by[d][1] + by[d][2]);
    expect(share(3, 1)).toBeCloseTo(4 / 51, 2);
    expect(share(13, 0)).toBeCloseTo(4 / 51, 2);
    for (const d of [3, 8, 13]) expect(share(d, 2)).toBeCloseTo(3 / 51, 2);
  });

  it("проигрыш: среди невыбранных всегда такая же или старше; выбранная, исход и деньги те же", () => {
    const rng = seededRng(6);
    for (let i = 0; i < 60_000; i++) {
      const idx = i % 4;
      const r = pickCard(startRisk(1, rng), idx);
      const shown = showMissed(r, rng);
      if (r.outcome !== "lose") {
        expect(shown).toBe(r);
        continue;
      }
      expect(shown.hand[idx]).toEqual(r.hand[idx]);
      expect(shown.stake).toBe(0);
      expect(new Set([...shown.hand, shown.dealer].map(key)).size).toBe(5);
      expect(shown.hand.some((c, j) => j !== idx && c.rank >= shown.dealer.rank)).toBe(true);
    }
  });

  it("раздача прошлой версии (без v:3) сдаётся заново вместе с соперником; этой — не трогается", () => {
    const rng = seededRng(7);
    const fresh = startRisk(1, rng);
    expect(resolvePick(fresh, 0, rng)).toBe(fresh);
    const { v: _v, ...old } = {
      ...fresh,
      dealer: { rank: 3, suit: 0 },
      hand: [0, 0, 0, 0].map(() => ({ rank: 0, suit: 0 })),
    };
    const again = resolvePick(old as RiskState, 0, rng);
    expect(again.v).toBe(3);
    expect(again.hand.every((c) => c.rank >= 2)).toBe(true);
  });

  it("после пяти удвоений игра закрыта", () => {
    let s = startRisk(1, seededRng(11));
    for (let i = 0; i < RISK_MAX_ROUNDS; i++) {
      s = pickCard(
        { ...s, dealer: { rank: 3, suit: 0 }, hand: s.hand.map(() => ({ rank: 9, suit: 1 })) },
        0,
      );
      if (!s.done) s = nextRisk(s, seededRng(12 + i));
    }
    expect(s.done).toBe(true);
    expect(s.stake).toBe(2 ** RISK_MAX_ROUNDS);
  });

  it("подписи карт", () => {
    expect(cardLabel({ rank: 14, suit: 0 })).toBe("A♠");
    expect(cardLabel({ rank: 10, suit: 2 })).toBe("10♦");
  });
});
