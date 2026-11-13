// Плавание: пока игрок на корабле, ходит не он, а судно.
//
// На борту игрок — по ЗАПИСИ об экипаже (ship-crew.crew_wallet), а не потому,
// что под ногами что-то плавает. Отдельный модуль, чтобы move.ts остался про
// обычный шаг.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { ownCellSql, type Cell } from "./encounter-where";
import { isWaterName } from "@/lib/shipRules";
import type { MyShip } from "./ship-crew";
import { bridgeAxes, type BridgeAxes } from "@/lib/raid/bridgeTransit";
import { bridgeCellSql, WATER_SQL } from "./cell-sql";

/**
 * Где игрок стоит И на каком судне он записан — ОДНИМ рейсом.
 *
 * Два вопроса про одного игрока, но по сети они ходили друг за другом.
 * Позицию читает тот же ownCellSql, что и ownCell: правило «своя строка, и
 * только своя» живёт в одном месте.
 *
 * Судно ищется по экипажу, а не по координатам. Раньше это был `SELECT id …
 * WHERE q = … AND r = … LIMIT 1` — без владельца, без порядка и без воды, то
 * есть капитаном считался любой, кто встал на клетку с чужим судном.
 *
 * `cell = null` — игрока на карте ещё нет; судно при этом всё равно
 * спрашиваем: экипаж без позиции означает рассинхрон, и звать его надо, чтобы
 * шаг мог его расшить.
 */
export async function loadRide(
  wallet: string,
  mapId: string,
): Promise<{ cell: Cell | null; ship: MyShip | null; bridge: BridgeAxes | null }> {
  // Позиция и судно — на АККАУНТ (по всем сёстрам), а не на подключённый кош.
  // Иначе у ТГ с двумя кошами (браузерный + near) сервер брал позицию только
  // прямого коша → пусто → замок, а клиент (ownCell читает сёстры) показывал
  // реальную клетку: игрок тыкал соседнюю, сервер мерял от замка → «не соседняя».
  const { raidOwner } = await import("./owner");
  const acc = await raidOwner(wallet);
  const rows = (await mcpExec(
    `SELECT p.q AS pq, p.r AS pr,
            CASE WHEN ${WATER_SQL} THEN d.meta->'bridge' ELSE NULL END AS bridge,
            s.id AS ship_id, s.q AS sq, s.r AS sr, s.kind AS skind
       FROM (SELECT 1) AS one(x)
       LEFT JOIN LATERAL (${ownCellSql(acc)}) p ON true
       LEFT JOIN yuplink.raid_map_cells c
              ON c.map_id = ${sqlStr(mapId)} AND c.q = p.q AND c.r = p.r
       LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
       LEFT JOIN yuplink.mystic_item_template d ON d.id = c.decoration_id
       LEFT JOIN yuplink.beta_raid_ship s
              ON s.crew_account = ${sqlStr(acc)} AND s.map_id = ${sqlStr(mapId)};`,
    { wrapJson: true },
  )) as Array<{
    pq: number | null;
    pr: number | null;
    ship_id: string | null;
    sq: number | null;
    sr: number | null;
    skind: string | null;
    bridge: unknown;
  }>;
  const row = rows?.[0];
  if (!row) return { cell: null, ship: null, bridge: null };
  return {
    cell: row.pq === null || row.pq === undefined ? null : { q: Number(row.pq), r: Number(row.pr) },
    bridge: bridgeAxes(row.bridge),
    ship: row.ship_id
      ? {
          id: row.ship_id,
          q: Number(row.sq),
          r: Number(row.sr),
          kind: row.skind === "big" ? "big" : "small",
        }
      : null,
  };
}

/** Вода ли клетка (по названию типа местности). */
export async function isWaterCell(mapId: string, q: number, r: number): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT t.name FROM yuplink.raid_map_cells c
       JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
      WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${q} AND c.r = ${r}
        AND NOT ${bridgeCellSql("c")} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ name: string | null }>;
  return isWaterName(rows?.[0]?.name);
}
