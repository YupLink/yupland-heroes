// «Корона гречневого королевства»: чтение и запись в базе. Деньги и копилка —
// функции buckwheat_start / buckwheat_step (migrations/buckwheat-01…04.sql):
// золото — res_move, DARAI (buckwheat-04) — счёт acc_move и пул карты.
import { mcpExec } from "../../db/mcpClient";
import { sb } from "../../db/pg";
import { sqlStr } from "../raid-shared";
import type { Move } from "./bwEngine";

/** Валюта партии: золото или DARAI со счёта (вход 100 000, корона 50 000 — владелец 08.11). */
export type BwCurrency = "gold" | "darai";
export type OpenGame = {
  id: string;
  seed: number;
  salt: string;
  moves: Move[];
  demo: boolean;
  currency: BwCurrency;
};
const currencyOf = (v: unknown): BwCurrency => (v === "darai" ? "darai" : "gold");
export type BwTotals = { crowns: number; grecha: number; games: number };

/** Золото, копилка и незаконченная партия — одним запросом. */
export async function loadAccount(account: string): Promise<{
  gold: number;
  darai: number;
  totals: BwTotals;
  open: OpenGame | null;
  pass: boolean;
}> {
  const a = sqlStr(account);
  const rows = (await mcpExec(
    `SELECT (SELECT amount FROM yuplink.account_resources
              WHERE account_id = ${a} AND resource = 'gold') AS gold,
            (SELECT COALESCE(sum(delta), 0) FROM yuplink.acc_ledger
              WHERE account_id = ${a} AND token = 'Darai') AS darai,
            (SELECT to_jsonb(s) FROM yuplink.buckwheat_stats s WHERE s.account_id = ${a}) AS stats,
            (SELECT jsonb_build_object('id', g.id, 'seed', g.seed, 'salt', g.salt, 'moves', g.moves, 'demo', g.demo,
                                       'currency', g.currency)
               FROM yuplink.buckwheat_game g
              WHERE g.account_id = ${a} AND g.status = 'play') AS open,
            EXISTS (SELECT 1 FROM yuplink.res_ledger l
                     WHERE l.kind = 'buckwheat_pass' AND l.ref = 'bwpass:' || ${a}) AS pass;`,
    { wrapJson: true },
  )) as Array<{
    gold: number | null;
    darai: number | string | null;
    pass: boolean | null;
    stats: { crowns?: number; grecha?: number; games?: number } | null;
    open: {
      id: string;
      seed: number | string;
      salt: string;
      moves: Move[];
      demo?: boolean;
      currency?: string;
    } | null;
  }>;
  const row = rows?.[0];
  const open = row?.open
    ? {
        id: row.open.id,
        seed: Number(row.open.seed),
        salt: row.open.salt,
        moves: row.open.moves ?? [],
        demo: row.open.demo === true,
        currency: currencyOf(row.open.currency),
      }
    : null;
  return {
    gold: Number(row?.gold) || 0,
    darai: Number(row?.darai) || 0,
    totals: {
      crowns: Number(row?.stats?.crowns) || 0,
      grecha: Number(row?.stats?.grecha) || 0,
      games: Number(row?.stats?.games) || 0,
    },
    open,
    pass: row?.pass === true,
  };
}

export type StoredGame = OpenGame & {
  done: boolean;
  stake: number;
  returned: number;
  grecha: number;
};

/** Партия по id, только своя. */
export async function loadGame(account: string, id: string): Promise<StoredGame | null> {
  const rows = (await mcpExec(
    `SELECT id, seed, salt, moves, status, stake, returned, grecha, demo, currency
       FROM yuplink.buckwheat_game
      WHERE id = ${sqlStr(id)} AND account_id = ${sqlStr(account)};`,
    { wrapJson: true },
  )) as Array<{
    id: string;
    seed: number | string;
    salt: string;
    moves: Move[];
    status: string;
    stake: number | string;
    returned: number | string;
    grecha: number;
    demo: boolean | null;
    currency: string | null;
  }>;
  const g = rows?.[0];
  if (!g) return null;
  return {
    id: g.id,
    seed: Number(g.seed),
    salt: g.salt,
    moves: g.moves ?? [],
    done: g.status !== "play",
    stake: Number(g.stake) || 0,
    returned: Number(g.returned) || 0,
    grecha: Number(g.grecha) || 0,
    demo: g.demo === true,
    currency: currencyOf(g.currency),
  };
}

function dbError(e: { message?: string } | null): Error {
  const msg = String(e?.message ?? "");
  if (/в минус/.test(msg)) return new Error("bw.not_enough");
  if (/not_enough_currency:Darai/.test(msg)) return new Error("bw.not_enough_darai");
  if (/bw_open/.test(msg)) return new Error("bw.open");
  if (/bw_version/.test(msg)) return new Error("bw.version");
  if (/bw_done/.test(msg)) return new Error("bw.done");
  if (/bw_no_game/.test(msg)) return new Error("bw.no_game");
  return new Error(msg || "bw.error");
}

const scalar = (data: unknown): number => {
  const v = Array.isArray(data) ? data[0] : data;
  if (v && typeof v === "object") return Number(Object.values(v)[0]) || 0;
  return Number(v) || 0;
};

/** Списать вход (демо — разовый пропуск pass) и завести партию. Возвращает баланс валюты партии. */
export async function startGame(
  account: string,
  id: string,
  seed: number,
  salt: string,
  stake: number,
  demo = false,
  pass = 0,
  currency: BwCurrency = "gold",
  wallet: string | null = null,
): Promise<number> {
  const { error, data } = await sb.rpc("buckwheat_start", {
    p_account: account,
    p_id: id,
    p_seed: seed,
    p_salt: salt,
    p_stake: stake,
    p_demo: demo,
    p_pass: pass,
    p_currency: currency,
    p_wallet: wallet,
  });
  if (error) throw dbError(error);
  return scalar(data);
}

/** Записать ход; done — партия кончилась, выплата и копилка. Возвращает баланс валюты партии. */
export async function writeStep(p: {
  account: string;
  id: string;
  count: number;
  moves: Move[];
  crowns: number;
  grecha: number;
  done: boolean;
  returned: number;
  wallet?: string | null;
}): Promise<number> {
  const { error, data } = await sb.rpc("buckwheat_step", {
    p_account: p.account,
    p_id: p.id,
    p_count: p.count,
    // Строкой: массив массивов шим отдал бы как ARRAY[…], а колонка — jsonb.
    p_moves: JSON.stringify(p.moves),
    p_crowns: p.crowns,
    p_grecha: p.grecha,
    p_done: p.done,
    p_returned: p.returned,
    p_wallet: p.wallet ?? null,
  });
  if (error) throw dbError(error);
  return scalar(data);
}
