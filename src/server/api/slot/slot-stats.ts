// Статистика казино — только админу (владелец, 14.10.2026): кто со сколько
// начал, сколько круток, сколько поставил и сколько получил, % отдачи.
//
// Поставлено и число круток — из статистики автомата (slot_session.state.stats:
// её ведёт сервер на каждом ходе). Итог игрока — из журнала золота (res_ledger,
// виды slot_spin / slot_risk / slot_bonus): это настоящие движения золота.
// Отдача = (поставлено + итог) / поставлено.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { requireAdmin } from "../../auth";

export type SlotPlayerStat = {
  account: string;
  name: string;
  /** Золото перед первой круткой. */
  start: number;
  gold: number;
  spins: number;
  wagered: number;
  /** Сколько вернулось игроку (поставлено + итог). */
  paid: number;
  /** Итог игрока: + выиграл у казино, − проиграл. */
  net: number;
  bonuses: number;
  bestWin: number;
  riskIn: number;
  riskOut: number;
  lastAt: string | null;
};

type Row = {
  account: string;
  username: string | null;
  tg: string | null;
  stats: Record<string, number> | null;
  gold: number | string | null;
  net: number | string | null;
  last_at: string | null;
};

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export async function slotStatsRows(): Promise<SlotPlayerStat[]> {
  const rows = (await mcpExec(
    `SELECT s.account_id AS account, s.state->'stats' AS stats,
            (SELECT max(u.telegram_username) FROM yuplink.users u
              WHERE u.account_id = s.account_id AND u.telegram_username IS NOT NULL) AS username,
            (SELECT a.telegram_id::text FROM yuplink.accounts a WHERE a.id = s.account_id) AS tg,
            (SELECT r.amount FROM yuplink.account_resources r
              WHERE r.account_id = s.account_id AND r.resource = 'gold') AS gold,
            (SELECT sum(l.delta) FROM yuplink.res_ledger l
              WHERE l.account_id = s.account_id AND l.resource = 'gold'
                AND l.kind IN ('slot_spin', 'slot_risk', 'slot_bonus')) AS net,
            s.updated_at::text AS last_at
       FROM yuplink.slot_session s;`,
    { wrapJson: true },
  )) as Row[];
  return (rows ?? [])
    .map((r) => {
      const st = r.stats ?? {};
      const wagered = n(st.wagered);
      const net = n(r.net);
      return {
        account: r.account,
        name: r.username ? `@${r.username}` : r.tg ? `tg${r.tg}` : r.account.slice(0, 10),
        start: Math.floor(n(st.startBalance)),
        gold: Math.floor(n(r.gold)),
        spins: n(st.spins),
        wagered,
        paid: wagered + net,
        net,
        bonuses: n(st.bonuses),
        bestWin: n(st.bestWin),
        riskIn: n(st.riskIn),
        riskOut: n(st.riskOut),
        lastAt: r.last_at,
      };
    })
    .filter((p) => p.spins > 0)
    .sort((a, b) => b.wagered - a.wagered);
}

/** Итог по казино из строк игроков. */
export function slotTotals(list: SlotPlayerStat[]) {
  const sum = (k: keyof SlotPlayerStat) => list.reduce((s, p) => s + n(p[k]), 0);
  const wagered = sum("wagered");
  const net = sum("net");
  const riskIn = sum("riskIn");
  return {
    players: list.length,
    spins: sum("spins"),
    wagered,
    paid: wagered + net,
    /** Доход казино: что игроки оставили (минус — казино в убытке). */
    casino: -net,
    rtpPct: wagered > 0 ? ((wagered + net) / wagered) * 100 : null,
    bonuses: sum("bonuses"),
    riskIn,
    riskOut: sum("riskOut"),
    riskPct: riskIn > 0 ? (sum("riskOut") / riskIn) * 100 : null,
  };
}

export const getSlotStats = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  const players = await slotStatsRows();
  return { players, totals: slotTotals(players) };
});
