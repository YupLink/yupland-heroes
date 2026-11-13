// «Корона гречневого королевства»: партия целиком на сервере. Аккаунт приходит
// параметром (вход и права — bwApi.ts), так ядро можно гонять и без браузера.
import { randomBytes, randomInt } from "node:crypto";
import { entryGold, newGameId, replay, rulesOf, stateOf, step, settleNow, toCell } from "./bwEngine";
import type { BwSettlement, BwState, BwStep, Move } from "./bwEngine";
import { loadAccount, loadGame, startGame, writeStep, type BwTotals } from "./bwStore";
import type { BwCurrency, StoredGame } from "./bwStore";
import type { BwMode } from "./bwAccess";

export type { BwCurrency } from "./bwStore";
export type BwOpen = { id: string; count: number; state: BwState; currency: BwCurrency };
/**
 * Во сколько раз партия в DARAI крупнее золотой: вход 100 000 вместо 100, корона
 * 50 000 вместо 50 (владелец, 08.11.2026). Правила и раскладка — те же.
 */
export const BW_DARAI_MULT = 1000;
const multOf = (c: BwCurrency) => (c === "darai" ? BW_DARAI_MULT : 1);
const scaled = (s: BwSettlement, c: BwCurrency): BwSettlement => {
  const k = multOf(c);
  return { entry: s.entry * k, returned: s.returned * k, net: s.net * k, grecha: s.grecha };
};
/** Кто ставит: аккаунт, кошелёк сессии (в журнал счёта), открыт ли ему DARAI. */
export type BwWho = { account: string; mode: BwMode; wallet: string | null; darai: boolean };
/**
 * demo — партия на фантики (своя открытая — по ней, иначе по режиму игрока);
 * pass — пропуск к демке уже куплен (без него первый вход — за BW_DEMO_PASS золота).
 */
export type BwInit = {
  gold: number;
  /** DARAI на счёте; daraiOpen — можно ли ставить DARAI (Google-входу — нет, как казино). */
  darai: number;
  daraiOpen: boolean;
  totals: BwTotals;
  entry: number;
  game: BwOpen | null;
  demo: boolean;
  pass: boolean;
};

/** Разовый пропуск к демке (владелец 08.11: «списав 100 золота — как разовый пропуск»). */
export const BW_DEMO_PASS = 100;
export type BwMoveResult = BwStep & {
  count: number;
  gold: number | null;
  darai: number | null;
  totals: BwTotals | null;
};
export type BwExitResult = {
  settlement: BwSettlement;
  gold: number;
  darai: number;
  totals: BwTotals;
};

/** Золото, DARAI, копилка и незаконченная партия (после обрыва связи — продолжить её). */
export async function loadFor(who: BwWho): Promise<BwInit> {
  const acc = await loadAccount(who.account);
  const game = acc.open
    ? {
        id: acc.open.id,
        count: acc.open.moves.length,
        state: stateOf(replay(acc.open.seed, acc.open.salt, acc.open.moves, rulesOf(acc.open.id))),
        currency: acc.open.currency,
      }
    : null;
  const demo = acc.open ? acc.open.demo : who.mode === "demo";
  return {
    gold: acc.gold,
    darai: acc.darai,
    daraiOpen: who.darai,
    totals: acc.totals,
    entry: entryGold(),
    game,
    demo,
    pass: acc.pass,
  };
}

/**
 * Новая партия: списать вход (демо — только разовый пропуск), раскладка по зерну, которого игрок не видит.
 * Незаконченная уже есть (вторая вкладка, двойное нажатие) — она и продолжится,
 * второй раз вход не берём.
 */
export async function startFor(who: BwWho, currency: BwCurrency = "gold"): Promise<BwInit> {
  const acc = await loadAccount(who.account);
  if (acc.open) return loadFor(who);
  const demo = who.mode === "demo";
  if (currency === "darai" && (demo || !who.darai)) throw new Error("bw.closed");
  const id = newGameId(randomBytes(12).toString("base64url"));
  const seed = randomInt(1, 2 ** 32);
  const salt = randomBytes(32).toString("hex");
  const stake = entryGold() * multOf(currency);
  try {
    const pass = demo ? BW_DEMO_PASS : 0;
    await startGame(who.account, id, seed, salt, stake, demo, pass, currency, who.wallet);
  } catch (e) {
    if (e instanceof Error && e.message === "bw.open") return loadFor(who);
    throw e;
  }
  return loadFor(who);
}

const sameMove = (a: Move | undefined, b: Move) => !!a && a.every((v, i) => v === b[i]);

/**
 * Запрос мог дойти и записаться, а ответ — потеряться (мост к базе повторяет
 * запросы сам). Тогда повтор того же хода — не ошибка: отдаём тот же итог ещё раз,
 * деньги второй раз не двигаются.
 */
async function wroteAlready(account: string, id: string, count: number, move: Move) {
  const g = await loadGame(account, id);
  return !!g && g.moves.length === count + 1 && sameMove(g.moves[count], move);
}

/** Ход игрока. Кончилась партия — тут же выплата за короны и копилка. */
export async function moveFor(
  account: string,
  id: string,
  count: number,
  move: Move,
  wallet: string | null = null,
): Promise<BwMoveResult> {
  const g = await loadGame(account, id);
  if (!g) throw new Error("bw.no_game");
  const repeat = g.moves.length === count + 1 && sameMove(g.moves[count], move);
  if (!repeat && g.done) throw new Error("bw.done");
  if (!repeat && g.moves.length !== count) throw new Error("bw.version");
  const rules = rulesOf(id);
  const game = replay(g.seed, g.salt, g.moves.slice(0, count), rules);
  const res = step(game, toCell(move[0], move[1], rules), toCell(move[2], move[3], rules), rules);
  if (!res.valid) return { ...res, count, gold: null, darai: null, totals: null };
  const settlement = res.settlement ? scaled(res.settlement, g.currency) : null;
  const done = !!settlement;
  if (!repeat) {
    try {
      await writeStep({
        account,
        id,
        count,
        moves: [...g.moves, move],
        crowns: game.crowns,
        grecha: game.grecha,
        done,
        returned: settlement?.returned ?? 0,
        wallet,
      });
    } catch (e) {
      if (!(await wroteAlready(account, id, count, move))) throw e;
    }
  }
  const acc = await loadAccount(account);
  return {
    ...res,
    settlement,
    count: count + 1,
    gold: acc.gold,
    darai: acc.darai,
    totals: done ? acc.totals : null,
  };
}

/** Итог уже рассчитанной партии — из базы, как записан (вход — ставка партии). */
function storedSettlement(g: StoredGame): BwSettlement {
  return { entry: g.stake, returned: g.returned, net: g.returned - g.stake, grecha: g.grecha };
}

/** «Выйти» посреди партии: выплата за опущенные короны, греча — в копилку. */
export async function exitFor(
  account: string,
  id: string,
  count: number,
  wallet: string | null = null,
): Promise<BwExitResult> {
  const g = await loadGame(account, id);
  if (!g) throw new Error("bw.no_game");
  if (g.moves.length !== count) throw new Error("bw.version");
  const rules = rulesOf(id);
  const game = replay(g.seed, g.salt, g.moves, rules);
  if (!g.done) {
    const settlement = scaled(settleNow(game, rules), g.currency);
    try {
      await writeStep({
        account,
        id,
        count,
        moves: g.moves,
        crowns: game.crowns,
        grecha: game.grecha,
        done: true,
        returned: settlement.returned,
        wallet,
      });
    } catch (e) {
      const again = await loadGame(account, id);
      if (!again?.done) throw e;
      return exitFor(account, id, count, wallet);
    }
  }
  // Повтор «Выйти» (или партия уже кончилась) — итог как записан, деньги не трогаем.
  const stored = g.done ? g : await loadGame(account, id);
  const acc = await loadAccount(account);
  return {
    settlement: storedSettlement(stored ?? g),
    gold: acc.gold,
    darai: acc.darai,
    totals: acc.totals,
  };
}
