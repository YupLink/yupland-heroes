// Турнирная таблица бета-рейда: сумма урона по аккаунту из лога ударов
// yuplink.beta_raid_object_run (аналог chip_boss_run у обычного рейда).
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { requireWallet } from "../../auth";
import { raidOwner } from "./owner";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { customNameSql } from "@/server/api/player-name/player-name-sql";

/** Сколько строк отдаём в таблицу. Своя строка добавляется сверх лимита. */
const TOP_LIMIT = 200;

type Row = {
  wallet: string;
  name: string | null;
  total: number | string;
  kills: number;
  mine: boolean;
  rank: number;
};

export type BetaTournamentPlayer = {
  wallet: string;
  name: string;
  totalDamage: number;
  bossesDefeated: number;
  /** Строка принадлежит текущему игроку (по кошельку или сестринским). */
  mine: boolean;
  place: number;
};

const shortWallet = (w: string) => (w.length > 12 ? `${w.slice(0, 8)}…` : w);

export const getBetaRaidTournament = createServerFn({ method: "GET" }).handler(async () => {
  await requireBetaRaid();
  // Гость тоже может открыть таблицу — просто без подсветки своей строки.
  let myAccount = "";
  try {
    myAccount = await raidOwner(requireWallet());
  } catch {
    /* не вошёл */
  }
  const sisSql = myAccount ? sqlStr(myAccount) : "''";

  // ОДИН запрос вместо N+1: имя игрока берём JOIN-ом с users, а не в цикле.
  // Группируем по аккаунту — игрок один, сколько бы адресов ни подключил.
  const rows = (await mcpExec(
    `WITH agg AS (
       SELECT min(r.wallet) AS wallet,
              COALESCE(${customNameSql("r.account_id")}, '@' || NULLIF(max(u.telegram_username), ''), min(r.wallet)) AS name,
              SUM(r.damage)::bigint AS total,
              COUNT(*) FILTER (WHERE r.killed)::int AS kills,
              min(r.created_at) AS first_at,
              bool_or(r.account_id IN (${sisSql})) AS mine
         FROM yuplink.beta_raid_object_run r
         LEFT JOIN yuplink.users u ON u.wallet = r.wallet
        GROUP BY r.account_id
     ), ranked AS (
       SELECT agg.*,
              (ROW_NUMBER() OVER (ORDER BY total DESC, first_at ASC))::int AS rank
         FROM agg
     )
     SELECT wallet, name, total, kills, mine, rank FROM ranked
      WHERE rank <= ${TOP_LIMIT} OR mine
      ORDER BY rank;`,
    { wrapJson: true },
  )) as Row[];

  // Telegram-номер (кошелёк tg<id>) наружу — меткой (publicWallet, аудит 11.11.2026).
  const { publicRows } = await import("../../publicWallet");
  const safe = await publicRows(rows ?? []);
  const players: BetaTournamentPlayer[] = safe.map((r) => ({
    wallet: r.wallet,
    name: r.name && r.name !== r.wallet ? r.name : shortWallet(r.wallet),
    totalDamage: Number(r.total ?? 0),
    bossesDefeated: Number(r.kills ?? 0),
    mine: !!r.mine,
    place: Number(r.rank ?? 0),
  }));

  const me = players.find((p) => p.mine) ?? null;
  return {
    players,
    myRank: me?.place ?? null,
    myDamage: me?.totalDamage ?? 0,
  };
});
