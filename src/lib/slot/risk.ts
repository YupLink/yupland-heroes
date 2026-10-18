// Риск-игра (удвоение) — правила владельца (15–17.10.2026):
//  1. Карта соперника открыта, четыре карты игрока закрыты. Выбрал старше — ×2,
//     равная — пересдача, младше — сгорело. До 5 удвоений.
//  2. «Забрать» есть всегда, пока на кону что-то есть; других кнопок нет. После
//     выигрыша карты видны 1,5 с, потом сама новая раздача.
//  3. Игра честная: «что выпало — то и выпало». Перетасованная колода 52 карты:
//     соперник — первая карта (любая от двойки до туза), четыре карты игрока —
//     следующие; лежат на сервере закрытыми, выбор их только открывает. Подмены
//     на равную нет.
//  4. При проигрыше среди невыбранных обязательно есть такая же или старше
//     соперника (showMissed — подмена одной невыбранной, только показ).
//  5. 90 % держат барабаны: удвоение — бустер выигрыша линий, умный игрок
//     (рискует против карт до 10, при J и старше забирает) умножает выигрыш линий
//     в 1,97 раза; барабаны настроены так, чтобы у него выходило 90 % (reels.ts).
import type { Rng } from "./types";

export const RISK_MAX_ROUNDS = 5;
/** Ранги 2…14 (туз = 14). Ранг 0 — карта закрыта (так её видит браузер до выбора). */
export type Card = { rank: number; suit: number };

export type RiskState = {
  /** 3 — раздача этой версии (честная колода). Без неё — прошлые версии. */
  v?: 3;
  dealer: Card;
  hand: Card[];
  /** Выбранная карта игрока (индекс) после хода. */
  picked: number | null;
  /** Текущая сумма на кону (кредиты). */
  stake: number;
  rounds: number;
  outcome: "win" | "lose" | "push" | null;
  done: boolean;
};

/** Перетасованная колода 52 карты (Фишер — Йетс). */
function deck(rng: Rng): Card[] {
  const d: Card[] = [];
  for (let rank = 2; rank <= 14; rank++)
    for (let suit = 0; suit < 4; suit++) d.push({ rank, suit });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** Раздача: соперник и четыре карты игрока — подряд из одной перетасованной колоды. */
function deal(rng: Rng): { v: 3; dealer: Card; hand: Card[] } {
  const [dealer, ...rest] = deck(rng);
  return { v: 3, dealer, hand: rest.slice(0, 4) };
}

export function startRisk(stake: number, rng: Rng = Math.random): RiskState {
  return { ...deal(rng), picked: null, stake, rounds: 0, outcome: null, done: false };
}

/** Следующая раздача после выигрыша или ничьей. */
export function nextRisk(state: RiskState, rng: Rng = Math.random): RiskState {
  if (state.done) return state;
  return { ...state, ...deal(rng), picked: null, outcome: null };
}

/**
 * Перед выбором на сервере. Раздача этой версии лежит — не трогаем. Раздача
 * прошлых версий сдаётся заново целиком (вместе с соперником): «запарковать»
 * удобную старую раздачу нельзя.
 */
export function resolvePick(state: RiskState, index: number, rng: Rng): RiskState {
  if (state.done || state.picked !== null || !(index >= 0 && index < 4)) return state;
  if (state.v === 3 && state.hand.length === 4 && state.hand.every((c) => c.rank >= 2))
    return state;
  return { ...state, ...deal(rng) };
}

export function pickCard(state: RiskState, index: number): RiskState {
  if (state.done || state.picked !== null) return state;
  const mine = state.hand[index].rank;
  const his = state.dealer.rank;
  if (mine > his) {
    const rounds = state.rounds + 1;
    return {
      ...state,
      picked: index,
      stake: state.stake * 2,
      rounds,
      outcome: "win",
      done: rounds >= RISK_MAX_ROUNDS,
    };
  }
  if (mine === his) return { ...state, picked: index, outcome: "push" };
  return { ...state, picked: index, stake: 0, outcome: "lose", done: true };
}

/**
 * Показ после проигрыша (владелец): среди трёх невыбранных хотя бы одна такая же
 * или старше соперника. Колода такую не дала — одна невыбранная заменяется до
 * показа. Выбранная карта, исход и деньги не меняются.
 */
export function showMissed(state: RiskState, rng: Rng): RiskState {
  const i = state.picked;
  if (i === null || state.outcome !== "lose") return state;
  const his = state.dealer.rank;
  if (state.hand.some((c, j) => j !== i && c.rank >= his)) return state;
  const used = new Set([state.dealer, ...state.hand].map((c) => `${c.rank}:${c.suit}`));
  const pool: Card[] = [];
  for (let rank = his; rank <= 14; rank++)
    for (let suit = 0; suit < 4; suit++)
      if (!used.has(`${rank}:${suit}`)) pool.push({ rank, suit });
  const others = [0, 1, 2, 3].filter((j) => j !== i);
  const slot = others[Math.floor(rng() * others.length)];
  const hand = state.hand.slice();
  hand[slot] = pool[Math.floor(rng() * pool.length)];
  return { ...state, hand };
}

export function cardLabel(c: Card): string {
  const r = c.rank;
  const face = r === 14 ? "A" : r === 13 ? "K" : r === 12 ? "Q" : r === 11 ? "J" : String(r);
  return face + "♠♥♦♣"[c.suit];
}

export function cardRed(c: Card): boolean {
  return c.suit === 1 || c.suit === 2;
}
