// Правила «Короны гречневого королевства» — код Кайлани как есть (minigames/buckwheat/src/engine.mjs
// приходит из её репозитория сам, minigames/README.md). Каждая версия правил — в архиве engines/,
// партия доигрывается по той, с которой начата: номер партии несёт её отпечаток.
// Сервер ведёт партию сам: раскладку задаёт зерно, которое знает только база, и
// каждый ход переигрывается с начала. Браузер лишь показывает то, что вернул сервер.
//
// Случайность ходов (что упадёт сверху, куда сядут бонусы финала) — НЕ из зерна:
// генератор движка 32-битный, зерно подбирается по стартовому полю за минуты, и
// тогда все будущие фишки известны заранее (три короны почти всегда). Поэтому у
// каждого хода свой генератор из секретной соли партии (moveRandom): узнать его
// можно только после хода. Правила движка те же, меняется лишь источник случайности.
import { createHmac } from "node:crypto";
import type { Animation, Cell, Game } from "../../../../minigames/buckwheat/src/engine.mjs";
import { CURRENT_ENGINE, ENGINES, type BwRules } from "./engines";

/** Партии до 11.11.2026 (номер без версии) — на правилах, с которыми игру встроили 07.11. */
export const LEGACY_ENGINE = "28f6f3dcf034";
const current = ENGINES[CURRENT_ENGINE];

/** Номер новой партии: в нём версия правил — по ним она и доиграется. */
export const newGameId = (rand: string) => `bw_${rand}.${CURRENT_ENGINE}`;
/** Номер партии, который принимают ручки: прежний (до 11.11) или с версией правил. */
export const GAME_ID_RE = /^bw_[A-Za-z0-9_-]{8,40}(\.[0-9a-f]{12})?$/;

/** Правила партии по её номеру. Такой версии нет в архиве — партию не переиграть. */
export function rulesOf(id: string): BwRules {
  const dot = id.lastIndexOf(".");
  const rules = ENGINES[dot > 0 ? id.slice(dot + 1) : LEGACY_ENGINE];
  if (!rules) throw new Error("bw.engine");
  return rules;
}

/** Анимация хода для браузера — как есть из движка, только JSON. */
export type BwJson = string | number | boolean | null | BwJson[] | { [key: string]: BwJson };

/** Ход как его хранит база: [ряд, столбец, ряд, столбец]. */
export type Move = [number, number, number, number];

/** Что видит браузер: всё, кроме генератора случайностей. */
export type BwState = {
  board: number[][];
  moves: number;
  crowns: number;
  grecha: number;
  chain: number;
  finished: boolean;
  lastGain: number;
  lastEntryCol: number;
  finalePlayed: boolean;
};

export type BwSettlement = { entry: number; returned: number; net: number; grecha: number };

/** Ход по клеткам; соседство и границы проверяет сам движок (canSwap). */
export function toCell(row: number, col: number, e: BwRules = current): Cell {
  if (!Number.isInteger(row) || !Number.isInteger(col)) throw new Error("bw.bad_move");
  if (row < 0 || row >= e.ROWS || col < 0 || col >= e.COLS) throw new Error("bw.bad_move");
  return { row, col };
}

/** Генератор хода n: из секретной соли партии, до хода его не узнать. */
export function moveRandom(salt: string, n: number, e: BwRules = current): () => number {
  if (!salt) throw new Error("bw.no_salt");
  return e.seededRandom(createHmac("sha256", salt).update(`move:${n}`).digest().readUInt32BE(0));
}

/**
 * Партия по зерну (поле) и ходам; генератор на выходе — для следующего хода.
 * Записанный ход не прошёл — база и код разошлись.
 */
export function replay(
  seed: number,
  salt: string,
  moves: readonly Move[],
  e: BwRules = current,
): Game {
  const game = e.createGame(seed);
  game.random = moveRandom(salt, 0, e);
  moves.forEach((m, i) => {
    if (!e.playSwap(game, toCell(m[0], m[1], e), toCell(m[2], m[3], e))) throw new Error("bw.replay");
    game.random = moveRandom(salt, i + 1, e);
  });
  return game;
}

/** Снимок для браузера: копия, дальше партия может меняться (финал). */
export function stateOf(g: Game): BwState {
  return JSON.parse(
    JSON.stringify({
      board: g.board,
      moves: g.moves,
      crowns: g.crowns,
      grecha: g.grecha,
      chain: g.chain,
      finished: g.finished,
      lastGain: g.lastGain,
      lastEntryCol: g.lastEntryCol,
      finalePlayed: !!g.finalePlayed,
    }),
  ) as BwState;
}

const copy = (a: Animation | null): BwJson =>
  a ? (JSON.parse(JSON.stringify(a)) as BwJson) : null;

export type BwStep = {
  valid: boolean;
  state: BwState;
  animation: BwJson;
  /** Партия кончилась этим ходом: бонусы финала и итог. */
  finale: { animation: BwJson; state: BwState } | null;
  settlement: BwSettlement | null;
};

/** Один ход поверх партии. Неверный ход ничего не меняет. */
export function step(game: Game, a: Cell, b: Cell, e: BwRules = current): BwStep {
  if (!e.playSwap(game, a, b))
    return { valid: false, state: stateOf(game), animation: null, finale: null, settlement: null };
  const state = stateOf(game);
  const animation = copy(game.lastAnimation);
  if (!game.finished) return { valid: true, state, animation, finale: null, settlement: null };
  const finaleAnim = copy(e.finishBonuses(game));
  return {
    valid: true,
    state,
    animation,
    finale: { animation: finaleAnim, state: stateOf(game) },
    settlement: e.payout(game),
  };
}

/** «Выйти» посреди партии: выплата за уже опущенные короны, без финала. */
export function settleNow(game: Game, e: BwRules = current): BwSettlement {
  return e.payout(game);
}

/** Сколько стоит вход — из правил игры. */
export function entryGold(e: BwRules = current): number {
  return e.payout(e.createGame(1)).entry;
}
