// Фонд «Короны гречневого королевства» кончился — выплату добрал пул карты (buckwheat-06).
// Владелец, 09.11.2026: выплаты добирать из пула карты, но в этом случае владельцу, партнёру
// и дизайнеру писать в ТГ с бота YupLink, что баланс игры Кайлани ушёл в минус.
// Не чаще раза в час: отметка в settings ставится атомарно, рабочих процессов несколько.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { teamDesignerTg, teamOwnerTg, teamPartnerTg, teamTgIds } from "../../team";

/** Владелец, партнёр, дизайнер — TG id из env (server/team); незаданные пропускаем. */
export const fundAlertTg = (): number[] =>
  teamTgIds(teamOwnerTg(), teamPartnerTg(), teamDesignerTg());
const KEY = "crown_fund_alert_at";

const fmt = (v: number) => Math.round(v).toLocaleString("ru-RU");

/** Выплата партии брала из пула карты — сообщить (раз в час). */
export async function alertFundIfShort(gameId: string): Promise<void> {
  const rows = (await mcpExec(
    `SELECT -m.amount AS from_map,
            (SELECT COALESCE(-sum(amount), 0) FROM yuplink.darai_pool_move
              WHERE pool = 'map' AND ref LIKE 'bwd:%:win:map') AS map_total
       FROM yuplink.darai_pool_move m
      WHERE m.ref = ${sqlStr(`bwd:${gameId}:win:map`)};`,
    { wrapJson: true },
  )) as Array<{ from_map: number | string; map_total: number | string }> | null;
  const row = rows?.[0];
  if (!row) return;
  const claimed = (await mcpExec(
    `INSERT INTO yuplink.settings (key, value) VALUES (${sqlStr(KEY)}, now()::text)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      WHERE yuplink.settings.value::timestamptz < now() - interval '1 hour'
     RETURNING key;`,
    { wrapJsonCte: true },
  )) as unknown[] | null;
  if (!claimed?.length) return;
  const text =
    "⚠️ <b>Баланс игры Кайлани ушёл в минус</b>\n" +
    "Фонд «Короны гречневого королевства» пуст — выплата " +
    `${fmt(Number(row.from_map))} DARAI взята из пула карты.\n` +
    `Всего из пула карты на игру: ${fmt(Number(row.map_total))} DARAI.`;
  const { tgSendMessage } = await import("../../tg");
  for (const id of fundAlertTg()) await tgSendMessage(id, text).catch(() => false);
}
