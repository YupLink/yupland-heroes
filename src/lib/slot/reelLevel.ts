// Мягкая тяга (владелец, 09.11.2026: «делай мягкую тягу») — вместо ступеней 28.10.
// • Отдача игрока — всё полученное из автомата (линии, бонус, итог удвоения) к
//   поставленному в спинах, за ВСЮ прошлую игру (stats автомата = журнал золота).
// • Раз в 20 спинов сервер ставит цель на следующие спины: 90 % + долг / 2000, где
//   долг — (90 % поставленного − полученное) в средних ставках игрока. Недоплатил —
//   барабаны щедрее, переплатил — скупее; разницу возвращает постепенно (~2000
//   спинов), поэтому по пути игрока может качнуть и в плюс, и в минус. Внутри
//   20 спинов барабаны не меняются: что выпало, то выпало.
// • Подстройка под манеру удвоения: m — во сколько раз удвоение игрока умножает
//   выигрыш линий, по матожиданию его выборов карт (сервер знает карту соперника в
//   момент выбора). Наугад или до упора — m≈1, с умом — ≈2. Барабаны берутся с
//   отдачей линий (цель − бонус) / m — так 90 % выходит у всех, как бы ни играл.
//   Пока манера не видна — считается умной (новичок и игравшие до 09.11 не получают
//   всплеска); две памяти — долгая (~1000 спинов) и короткая (~60): короткой верит,
//   когда она явно выше (стал удваивать умнее — заметно за десятки спинов).
// • Бонус и супер-игра — одинаково часто на любых барабанах (reelGrid.ts).
// • Щедрее, чем «90 % для умного», — только на ставку не выше привычной (средней за
//   всю игру или за последние ~200 спинов): поднял ставку — барабаны «на 90 % для
//   умного». Хитрости «ставка ×10 после удачи» и «копил манеру мелочью» не работают.
// • Знает только сервер — publicView прячет. Холостая игра гостя — цель 105 %.
// Прогоны 09.11 (150 игроков × 10 000 спинов, манеры и хитрецы) — reelLevel.test.ts.
import { GRID_MID, gridIndexFor, gridWeights } from "./reelGrid";
import { REEL_WEIGHTS, type Weights } from "./reels";
import { SMART_BOOST, bonusChance, bonusValue, reelProbs } from "./rtp";
import type { RiskState } from "./risk";
import type { SlotState, SlotReels } from "./state";
import type { SpinResult } from "./types";

export const TARGET_RTP = 0.9;
export const REBUILD_EVERY = 20;
/** За сколько спинов примерно возвращается долг. */
export const PULL_SPINS = 2000;
const WANT_MIN = 0.3;
const WANT_MAX = 1.6;
/** Память удвоения: долгая и короткая (спинов) и «умные» ставки линий до первых данных. */
const LONG = { decay: 1 - 1 / 600, prior: 10 };
const SHORT = { decay: 1 - 1 / 60, prior: 3 };
/** Поправка на шум короткой памяти. */
const SHORT_NOISE = 0.15;
/** Ниже — не верим: «плохое» удвоение не копится в щедрость. */
const FACTOR_MIN = 0.8;
/** Привычная ставка — средняя за последние ~200 спинов. */
const STAKE_DECAY = 1 - 1 / 200;

/** Бонус и супер-игра в отдаче за спин — одинаковы на любых барабанах. */
export const BONUS_RTP = bonusChance(reelProbs()) * bonusValue();

/** Матожидание выбора карты против соперника `dealer` (ничья — ставка остаётся). */
export const pickValue = (dealer: number) => (8 * (14 - dealer) + 3) / 51;

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const own = (s: SlotState): SlotReels | undefined =>
  s.reels && "set" in s.reels ? s.reels : undefined;

const factor = (raw: number, edge: number, prior: number) =>
  (raw + edge + prior * SMART_BOOST) / (raw + prior);

/** Во сколько раз удвоение игрока умножает выигрыш линий (1 … умный). */
export function doublingFactor(r: SlotReels | undefined, avg: number): number {
  const long = factor(r?.raw ?? 0, r?.edge ?? 0, LONG.prior * avg);
  const short = factor(r?.rawS ?? 0, r?.edgeS ?? 0, SHORT.prior * avg);
  // Короткая — за вычетом её шума: стал удваивать умнее — заметно сразу.
  return clamp(Math.max(long, short - SHORT_NOISE), FACTOR_MIN, SMART_BOOST);
}

/**
 * Перед спином (ставка — уже новая): пора ли поставить новую цель. Раз в 20 спинов,
 * с первого. Старые ступени 28.10 (`level`) — сразу по всей прошлой игре.
 */
export function rebuildReels(s: SlotState, target = TARGET_RTP): SlotState {
  const spins = num(s.stats.spins);
  const wagered = num(s.stats.wagered);
  const won = num(s.stats.won);
  const r = own(s);
  if (r && spins >= r.at && spins - r.at < REBUILD_EVERY) return s;
  const avg = spins > 0 && wagered > 0 ? wagered / spins : Math.max(1, s.lines * s.bet);
  const m = doublingFactor(r, avg);
  const want = clamp(target + (target * wagered - won) / avg / PULL_SPINS, WANT_MIN, WANT_MAX);
  const reels: SlotReels = {
    at: spins,
    set: gridIndexFor((want - BONUS_RTP) / m),
    safe: gridIndexFor((target - BONUS_RTP) / SMART_BOOST),
    cap: Math.round(avg * 100) / 100,
    stake: r?.stake ?? 0,
    raw: r?.raw ?? 0,
    edge: r?.edge ?? 0,
    rawS: r?.rawS ?? 0,
    edgeS: r?.edgeS ?? 0,
  };
  return { ...s, reels };
}

/** Веса для спина: ставка выше привычной — не щедрее «90 % для умного». */
export function spinWeights(s: SlotState): Weights[] {
  const r = own(s);
  if (!r) return REEL_WEIGHTS;
  const usual = Math.max(r.cap, r.stake);
  const raised = s.lines * s.bet > usual + 1e-9;
  return gridWeights(raised ? Math.min(r.set, r.safe) : r.set);
}

/** После спина: выигрыш линий в память удвоения (при бонусе его не удвоить), ставка — в привычную. */
export function noteSpin(s: SlotState, result: SpinResult): SlotState {
  const r = own(s);
  if (!r) return s;
  const lines = result.bonus ? 0 : result.totalWin;
  const bet = s.lines * s.bet;
  return {
    ...s,
    reels: {
      ...r,
      stake: r.stake > 0 ? r.stake * STAKE_DECAY + bet * (1 - STAKE_DECAY) : bet,
      raw: r.raw * LONG.decay + lines,
      edge: r.edge * LONG.decay,
      rawS: r.rawS * SHORT.decay + lines,
      edgeS: r.edgeS * SHORT.decay,
    },
  };
}

/** Игрок открыл карту в удвоении: его выбор — плюс или минус к множителю. */
export function noteRiskPick(s: SlotState, risk: RiskState): SlotState {
  const r = own(s);
  if (!r) return s;
  const e = risk.stake * (pickValue(risk.dealer.rank) - 1);
  return { ...s, reels: { ...r, edge: r.edge + e, edgeS: r.edgeS + e } };
}

/** Для проверок: обычный набор сетки. */
export const NORMAL_SET = GRID_MID;
