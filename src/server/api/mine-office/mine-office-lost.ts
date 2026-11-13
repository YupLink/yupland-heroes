// «Управление шахтами» → «Отбитые» (владелец 04.11.2026, §8.106): потери за
// 7 дней — что случилось, мир, клетка, когда. Строки остаются и после сбора и
// после «×» в «Добыче» (это история, не уведомление). Снос своего острова —
// не потеря. Кто отнял — наружу не отдаём. Только у построивших здание.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { WORLD_SQL } from "@/server/api/beta-raid/mine-lost/mine-notices";
import { noticesOf, type MineNotice } from "@/lib/mineNotice";
import { officeWho, requireMineOffice } from "./mine-office-own";

/** Сколько дней истории и строк за раз. */
export const LOST_DAYS = 7;
export const LOST_ROWS = 200;

export const officeLostSql = (account: string): string =>
  `SELECT l.id, l.kind, l.map_id, ${WORLD_SQL} AS world, l.q, l.r, l.resource, l.token,
          0 AS amount, (extract(epoch FROM l.seized_at) * 1000)::bigint AS at
     FROM yuplink.raid_mine_capture_log l
     LEFT JOIN yuplink.raid_maps m ON m.id = l.map_id
    WHERE l.old_account = ${sqlStr(account)}
      AND l.seized_at > now() - interval '${LOST_DAYS} days'
      AND l.kind <> 'island'
    ORDER BY l.seized_at DESC
    LIMIT ${LOST_ROWS}`;

export const getOfficeLost = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ lost: MineNotice[] }> => {
    const { account } = await officeWho();
    await requireMineOffice(account);
    const rows = await mcpExec(officeLostSql(account), { wrapJson: true });
    return { lost: noticesOf(rows, null) };
  },
);
