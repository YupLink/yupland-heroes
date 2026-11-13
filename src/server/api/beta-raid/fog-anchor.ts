// Разведанное принимаем только рядом с тем, где герой был (аудит 11.11.2026;
// владелец: «закрой»). Клиент копит открытые клетки и шлёт пачкой (fogPush), и
// за это время герой мог уйти, сесть на корабль или пройти портал — поэтому
// сверяем не с одной клеткой «сейчас», а с точками, где сервер видел героя при
// прошлых отправках за неделю (raid_fog_anchor). Запас — с избытком: обзор с
// биноклем 40 клеток, принимаем до 60 от любой точки. Подделка «вся карта
// разом» отсекается: дальних клеток рядом с героем не было.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { hexDistance } from "./helpers";

/** До скольких клеток от точки стояния клетка считается увиденной. */
export const FOG_ANCHOR_RADIUS = 60;
/** Сколько последних точек стояния смотреть. */
const ANCHORS_MAX = 300;

type Pt = { q: number; r: number };

/** Клетки «q,r», что лежат не дальше FOG_ANCHOR_RADIUS от какой-нибудь точки. */
export function nearAnchors(cells: string[], anchors: Pt[]): string[] {
  if (anchors.length === 0) return [];
  return cells.filter((k) => {
    const [q, r] = k.split(",").map(Number);
    if (!Number.isFinite(q) || !Number.isFinite(r)) return false;
    return anchors.some((a) => hexDistance(q, r, a.q, a.r) <= FOG_ANCHOR_RADIUS);
  });
}

/** Запомнить, где стоит герой (если на этой карте), и вернуть точки стояния за неделю. */
export async function fogAnchors(account: string, mapId: string): Promise<Pt[]> {
  const acc = sqlStr(account);
  const map = sqlStr(mapId);
  // Отдельными командами: запись внутри WITH обёртка mcpExec не пропускает.
  await mcpExec(
    `INSERT INTO yuplink.raid_fog_anchor (account_id, map_id, q, r, at)
     SELECT ${acc}, ${map}, q, r, now() FROM yuplink.beta_raid_positions
      WHERE account_id = ${acc} AND map_id = ${map}
     ON CONFLICT (account_id, map_id, q, r) DO UPDATE SET at = now();`,
  ).catch(() => {});
  void mcpExec(
    `DELETE FROM yuplink.raid_fog_anchor
      WHERE account_id = ${acc} AND at < now() - interval '7 days';`,
  ).catch(() => {});
  const rows = (await mcpExec(
    `SELECT q, r FROM yuplink.raid_fog_anchor
      WHERE account_id = ${acc} AND map_id = ${map} AND at > now() - interval '7 days'
      ORDER BY at DESC LIMIT ${ANCHORS_MAX};`,
    { wrapJson: true },
  ).catch(() => [])) as Pt[] | null;
  return (rows ?? []).map((p) => ({ q: Number(p.q), r: Number(p.r) }));
}
