// Статистика ставок «Короны гречневого королевства» для админов (владелец,
// 07.11.2026: «вывод статистики — поставил, заработал в ставках с золотом»).
// Поставлено — входы всех партий (и незаконченных), выплачено — за короны в
// рассчитанных партиях; итог игры = поставлено − выплачено. Демо-партии (фантики,
// 08.11) — не деньги, в статистику ставок не входят.
import { mcpExec } from "../../db/mcpClient";
import { namesOf } from "../tournament/tour-board";

export type BwStatsRow = {
  name: string;
  games: number;
  staked: number;
  returned: number;
  crowns: number;
};
/** Сводка по одной валюте ставок. */
export type BwStatsBlock = {
  games: number;
  open: number;
  players: number;
  staked: number;
  returned: number;
  crowns: number;
  rows: BwStatsRow[];
};
/**
 * Фонд игры в DARAI (buckwheat-05, владелец 09.11: «отдельный фонд — ставки в него,
 * выплаты из него»): пул darai_pool_move 'crown'. И новые кошельки со ссылки /crown
 * (метка darai_withdraw_own_only.bonus_pct > 0): сколько их, сколько ввели и вывели DARAI.
 */
export type BwFund = {
  balance: number;
  staked: number;
  paid: number;
  /** Выплачено сверх фонда — из пула карты (buckwheat-06). */
  fromMap: number;
  linkAccounts: number;
  linkDeposited: number;
  linkWithdrawn: number;
};
/** Золото и DARAI (buckwheat-04) — раздельно: это разные деньги. */
export type BwStats = { gold: BwStatsBlock; darai: BwStatsBlock; fund: BwFund };

const TOP = 50;

type Row = {
  account_id: string;
  currency: string;
  games: number;
  open: number;
  staked: number | string | null;
  returned: number | string | null;
  crowns: number | string | null;
};
const n = (v: unknown) => Number(v) || 0;

async function block(list: Row[]): Promise<BwStatsBlock> {
  const names = await namesOf(list.slice(0, TOP).map((r) => r.account_id));
  return {
    games: list.reduce((s, r) => s + n(r.games), 0),
    open: list.reduce((s, r) => s + n(r.open), 0),
    players: list.length,
    staked: list.reduce((s, r) => s + n(r.staked), 0),
    returned: list.reduce((s, r) => s + n(r.returned), 0),
    crowns: list.reduce((s, r) => s + n(r.crowns), 0),
    rows: list.slice(0, TOP).map((r) => ({
      name: names.get(r.account_id) ?? "—",
      games: n(r.games),
      staked: n(r.staked),
      returned: n(r.returned),
      crowns: n(r.crowns),
    })),
  };
}

export async function buckwheatStatsAll(): Promise<BwStats> {
  const rows = ((await mcpExec(
    `SELECT account_id, currency, count(*) AS games,
            count(*) FILTER (WHERE status = 'play') AS open,
            sum(stake) AS staked,
            sum(returned) FILTER (WHERE status = 'done') AS returned,
            sum(crowns) FILTER (WHERE status = 'done') AS crowns
       FROM yuplink.buckwheat_game
      WHERE NOT demo
      GROUP BY account_id, currency
      ORDER BY sum(stake) DESC;`,
    { wrapJson: true },
  )) ?? []) as Row[];
  const [gold, darai, fund] = await Promise.all([
    block(rows.filter((r) => r.currency !== "darai")),
    block(rows.filter((r) => r.currency === "darai")),
    fundStats(),
  ]);
  return { gold, darai, fund };
}

async function fundStats(): Promise<BwFund> {
  const rows = (await mcpExec(
    `WITH f AS (SELECT amount FROM yuplink.darai_pool_move WHERE pool = 'crown'),
          link AS (SELECT account_id FROM yuplink.darai_withdraw_own_only WHERE bonus_pct > 0),
          l AS (SELECT l.kind, l.ref, l.delta FROM yuplink.acc_ledger l
                 WHERE l.token = 'Darai' AND l.account_id IN (SELECT account_id FROM link))
     SELECT (SELECT COALESCE(sum(amount), 0) FROM f) AS balance,
            (SELECT COALESCE(sum(amount) FILTER (WHERE amount > 0), 0) FROM f) AS staked,
            (SELECT COALESCE(-sum(amount) FILTER (WHERE amount < 0), 0) FROM f) AS paid,
            (SELECT COALESCE(-sum(amount), 0) FROM yuplink.darai_pool_move
              WHERE pool = 'map' AND ref LIKE 'bwd:%:win:map') AS from_map,
            (SELECT count(*) FROM link) AS accounts,
            (SELECT COALESCE(sum(delta) FILTER (WHERE kind = 'acc_deposit'), 0) FROM l) AS deposited,
            (SELECT COALESCE(-sum(delta) FILTER (WHERE kind = 'acc_withdraw'), 0)
                  - COALESCE(sum(delta) FILTER (WHERE kind = 'acc_refund'
                      AND (ref LIKE 'wd-cancel:%' OR ref LIKE 'wdh:%:cancel')), 0) FROM l) AS withdrawn;`,
    { wrapJson: true },
  )) as Array<Record<string, number | string | null>>;
  const r = rows?.[0] ?? {};
  return {
    balance: n(r.balance),
    staked: n(r.staked),
    paid: n(r.paid),
    fromMap: n(r.from_map),
    linkAccounts: n(r.accounts),
    linkDeposited: n(r.deposited),
    linkWithdrawn: n(r.withdrawn),
  };
}
