// Уведомления о потерях в «Добыче» (владелец 04.11.2026, §8.106): «все
// уведомления только в окне добычи — цифрой на кружочке». Строка — потеря из
// журнала, пока игрок не закрыл её «×» (acknowledged_at; закрыть все — одним
// вызовом). Закрытие — только отметка прочтения: несобранное с отнятой шахты
// остаётся в списке шахт и собирается как раньше (§8.71). Снос острова игрок
// делает сам — не уведомление. Кто отнял — наружу не отдаём.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { noticesOf, type MineNotice } from "@/lib/mineNotice";

/** Сколько строк отдаём окну; цифра на кружке — все незакрытые. */
export const NOTICE_LIMIT = 50;

/** Мир строки: имя этажа, иначе карты (как в письме). */
export const WORLD_SQL = `COALESCE((SELECT f.name FROM yuplink.raid_floor f
  WHERE f.map_id = l.map_id LIMIT 1), m.name)`;

/** Незакрытые потери игрока, свежие сверху; total — сколько всего. */
export const noticesSql = (account: string): string =>
  `SELECT l.id, l.kind, l.map_id, ${WORLD_SQL} AS world, l.q, l.r, l.resource, l.token,
          CASE WHEN l.claimed_at IS NULL THEN l.amount + l.tail ELSE 0 END AS amount,
          (extract(epoch FROM l.seized_at) * 1000)::bigint AS at,
          count(*) OVER () AS total
     FROM yuplink.raid_mine_capture_log l
     LEFT JOIN yuplink.raid_maps m ON m.id = l.map_id
    WHERE l.old_account = ${sqlStr(account)}
      AND l.acknowledged_at IS NULL
      AND l.kind <> 'island'
    ORDER BY l.seized_at DESC
    LIMIT ${NOTICE_LIMIT}`;

/** Уведомления и их число; here — карта, где стоит герой. */
export async function myNotices(
  account: string,
  here: string | null,
): Promise<{ notices: MineNotice[]; count: number }> {
  const rows = (await mcpExec(noticesSql(account), { wrapJson: true })) ?? [];
  const first = (Array.isArray(rows) ? rows[0] : null) as { total?: unknown } | null;
  return { notices: noticesOf(rows, here), count: Math.max(0, Number(first?.total) || 0) };
}

/** Закрыть одну («×») или все; только свои, повтор — ничего. */
export const dismissNoticesSql = (account: string, id: string | null): string =>
  `UPDATE yuplink.raid_mine_capture_log SET acknowledged_at = now()
    WHERE old_account = ${sqlStr(account)} AND acknowledged_at IS NULL
      ${id ? `AND id = ${sqlStr(id)}` : ""}
    RETURNING id`;

export const dismissMineNotices = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(200).nullable() }).parse(d))
  .handler(async ({ data }): Promise<{ closed: number }> => {
    const { requireBetaRaid } = await import("../gate");
    const { accAccountId } = await import("../../currency/move");
    const wallet = await requireBetaRaid();
    const account = await accAccountId(wallet);
    if (!account) return { closed: 0 };
    const rows = await mcpExec(dismissNoticesSql(account, data.id), { wrapJsonCte: true });
    return { closed: Array.isArray(rows) ? rows.length : 0 };
  });
