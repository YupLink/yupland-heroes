// Спасение застрявших кораблей: судно под живым объектом никому не доступно.
//
// Босса или сундук админ ставит на клетку карты, не спрашивая, стоит ли там
// судно. Шаг на такую клетку сервер запрещает («Объект блокирует путь»), и
// корабль превращается в декорацию: сесть нельзя, увести нельзя, а на карте
// он рисуется свободным. У четырёх судов так и вышло (замер 02.09.2026).
//
// Лечим переносом: судно переезжает на ближайшую свободную воду. Если рядом
// такой воды нет, оставляем как есть — пусть лучше стоит запертым, чем
// исчезнет вместе с экипажем.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { blockedSql } from "./ships";
import { WATER_SQL } from "./cell-sql";

export type StuckShip = { id: string; q: number; r: number; objectId: string | null };

/** Корабли на клетках, куда нельзя ступить: живой объект, декор или туман. */
export async function findStuckShips(mapId: string): Promise<StuckShip[]> {
  const rows = (await mcpExec(
    `SELECT s.id, s.q, s.r, c.object_id
       FROM yuplink.beta_raid_ship s
       JOIN yuplink.raid_map_cells c
         ON c.map_id = s.map_id AND c.q = s.q AND c.r = s.r
      WHERE s.map_id = ${sqlStr(mapId)} AND ${blockedSql(false)}
      ORDER BY s.q, s.r;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ id: string; q: number; r: number; object_id: string | null }>;
  return (rows ?? []).map((r) => ({
    id: r.id,
    q: Number(r.q),
    r: Number(r.r),
    objectId: r.object_id,
  }));
}

/**
 * Ближайшая свободная вода в радиусе двух колец: пустая, проходимая и без
 * другого судна. Радиус два, а не один: босса ставят посреди моря, и все шесть
 * соседей нередко тоже под ним.
 */
async function nearestFreeWater(
  mapId: string,
  q: number,
  r: number,
): Promise<{ q: number; r: number } | null> {
  const rows = (await mcpExec(
    `SELECT c.q, c.r, (abs(c.q - ${q}) + abs(c.r - ${r})) AS d
       FROM yuplink.raid_map_cells c
       JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
      WHERE c.map_id = ${sqlStr(mapId)}
        AND c.q BETWEEN ${q - 2} AND ${q + 2}
        AND c.r BETWEEN ${r - 2} AND ${r + 2}
        AND NOT (c.q = ${q} AND c.r = ${r})
        AND ${WATER_SQL}
        AND NOT ${blockedSql(false)}
        AND NOT EXISTS (
              SELECT 1 FROM yuplink.beta_raid_ship s
               WHERE s.map_id = c.map_id AND s.q = c.q AND s.r = c.r)
      ORDER BY d, c.q, c.r LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ q: number; r: number }>;
  const cell = rows?.[0];
  return cell ? { q: Number(cell.q), r: Number(cell.r) } : null;
}

export type RescueResult = { moved: number; stuck: number };

/** Перенести все запертые суда карты на свободную воду. */
export async function rescueStuckShips(mapId: string): Promise<RescueResult> {
  const stuck = await findStuckShips(mapId);
  let moved = 0;
  for (const ship of stuck) {
    const spot = await nearestFreeWater(mapId, ship.q, ship.r);
    if (!spot) continue;
    // Экипаж переезжает вместе с судном: капитан стоит в той же клетке, и
    // разъехавшись, он оказался бы «на борту» посреди чужого моря.
    await mcpExec(
      `WITH moved AS (
         UPDATE yuplink.beta_raid_ship SET q = ${spot.q}, r = ${spot.r}
          WHERE id = ${sqlStr(ship.id)} RETURNING crew_account)
       UPDATE yuplink.beta_raid_positions p SET q = ${spot.q}, r = ${spot.r}, updated_at = now()
        FROM moved m
       WHERE m.crew_account IS NOT NULL
         AND p.account_id = m.crew_account;`,
    );
    moved++;
  }
  return { moved, stuck: stuck.length };
}

/**
 * Обратная беда: игрок стоит НА ВОДЕ, а судна под ним нет. Пешком с воды не
 * уйти — тупик без выхода. Так ссаживал портал: переносил капитана и оставлял
 * корабль у входа (закрыто 06.09.2026, см. portal-ship.ts). Здесь — разбор
 * последствий: высаживаем на ближайший берег.
 */
export type Stranded = { accountId: string; q: number; r: number };

export async function findStrandedPlayers(mapId: string): Promise<Stranded[]> {
  const rows = (await mcpExec(
    `SELECT p.account_id, p.q, p.r
       FROM yuplink.beta_raid_positions p
       JOIN yuplink.raid_map_cells c ON c.map_id = ${sqlStr(mapId)} AND c.q = p.q AND c.r = p.r
       JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
      WHERE ${WATER_SQL}
        AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_ship s
                         WHERE s.map_id = ${sqlStr(mapId)} AND s.crew_account = p.account_id)
      ORDER BY p.updated_at DESC;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ account_id: string; q: number; r: number }>;
  return (rows ?? []).map((r) => ({ accountId: r.account_id, q: Number(r.q), r: Number(r.r) }));
}

/** Ближайшая проходимая СУША в радиусе двух колец. */
export async function nearestLand(
  mapId: string,
  q: number,
  r: number,
): Promise<{ q: number; r: number } | null> {
  const rows = (await mcpExec(
    `SELECT c.q, c.r, (abs(c.q - ${q}) + abs(c.r - ${r})) AS d
       FROM yuplink.raid_map_cells c
       JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
      WHERE c.map_id = ${sqlStr(mapId)}
        AND c.q BETWEEN ${q - 2} AND ${q + 2}
        AND c.r BETWEEN ${r - 2} AND ${r + 2}
        AND NOT ${WATER_SQL}
        AND NOT ${blockedSql(false)}
      ORDER BY d, c.q, c.r LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ q: number; r: number }>;
  const cell = rows?.[0];
  return cell ? { q: Number(cell.q), r: Number(cell.r) } : null;
}

/** Высадить всех застрявших на берег. */
export async function rescueStrandedPlayers(mapId: string): Promise<RescueResult> {
  const list = await findStrandedPlayers(mapId);
  let moved = 0;
  for (const p of list) {
    const spot = await nearestLand(mapId, p.q, p.r);
    if (!spot) continue;
    await mcpExec(
      `UPDATE yuplink.beta_raid_positions
          SET q = ${spot.q}, r = ${spot.r}, updated_at = now()
        WHERE account_id = ${sqlStr(p.accountId)};`,
    );
    moved++;
  }
  return { moved, stuck: list.length };
}
