// Сход на берег: где игрок, под ним ли корабль и куда сходить — ОДНИМ рейсом.
//
// Раньше это были три вопроса подряд по сети: позиция (ownCell), судно на ней
// (shipAt) и самая дешёвая суша вокруг (landAround). Причём второй был чистой
// потерей: искал корабль по координатам игрока, а обратно из него брали ровно
// эти же координаты — полезен был только факт «судно там есть». Три рейса по
// 100–150 мс стояли и в подсказке «куда сойдём и почём», и в самом сходе.
//
// Правила не переписаны: и берег, и его цена считаются теми же кусками SQL,
// что и раньше (ships.landAround) — WATER_SQL, blockedSql, CELL_COST_SQL. Цена
// на кнопке обязана совпасть со списанной, а совпасть ей проще всего тогда,
// когда её считает один и тот же текст запроса.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { ownCellSql, type Cell } from "./encounter-where";
import { CELL_COST_JOIN, CELL_COST_SQL, WATER_SQL } from "./cell-sql";
import { blockedSql, type LandingCell } from "./ships";

export type AshoreFacts = {
  /** null — игрока на карте ещё нет. */
  cell: Cell | null;
  /** Свой корабль (по записи об экипаже) — с него и сходим. null — не на борту. */
  ship: { id: string } | null;
  /** Куда сойти и почём. null — берега рядом нет. */
  land: LandingCell | null;
};

type Row = {
  pq: number;
  pr: number;
  ship_id: string | null;
  lq: number | null;
  lr: number | null;
  lcost: number | string | null;
};

/**
 * Соседи клетки прямо в SQL: шесть смещений flat-top гекса, те же, что у
 * helpers.getNeighbors. Считать их в JS нельзя — координаты игрока приезжают
 * этим же запросом, а ждать их значило бы второй рейс.
 */
const NEIGHBORS_SQL = `((p.q + 1, p.r), (p.q + 1, p.r - 1), (p.q, p.r - 1),
                        (p.q - 1, p.r), (p.q - 1, p.r + 1), (p.q, p.r + 1))`;

/**
 * Позиция игрока + ЕГО корабль + берег для схода.
 *
 * Позицию читает ТОТ ЖЕ ownCellSql, что и ownCell: правило «своя строка, и
 * только своя» живёт в одном месте, иначе сестринский кошелёк снова показывал
 * бы одну клетку, а сходил бы с другой.
 *
 * Судно ищется по экипажу, а не по координатам: раньше «на борту» означало
 * «на моей клетке что-то плавает», и сойти на берег мог любой прохожий,
 * оказавшийся на клетке с чужим судном.
 */
export async function loadAshore(
  mapId: string,
  wallet: string,
  /** Админу глухой туман не преграда — тот же флаг, что у landAround. */
  bypassVoid: boolean,
): Promise<AshoreFacts> {
  // Позиция и экипаж — на аккаунте, поэтому спрашиваем один ключ.
  const { raidOwner } = await import("./owner");
  const acc = await raidOwner(wallet);
  const rows = (await mcpExec(
    `WITH p AS (${ownCellSql(acc)})
     SELECT p.q AS pq, p.r AS pr, sh.id AS ship_id,
            land.q AS lq, land.r AS lr, land.cost AS lcost
       FROM p
       LEFT JOIN LATERAL (
         SELECT s.id FROM yuplink.beta_raid_ship s
          WHERE s.map_id = ${sqlStr(mapId)} AND s.crew_account = ${sqlStr(acc)}
            AND s.q = p.q AND s.r = p.r
          LIMIT 1
       ) sh ON true
       LEFT JOIN LATERAL (
         SELECT c.q, c.r, ${CELL_COST_SQL} AS cost
           FROM yuplink.raid_map_cells c
           JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
           ${CELL_COST_JOIN}
          WHERE c.map_id = ${sqlStr(mapId)}
            AND (c.q, c.r) IN ${NEIGHBORS_SQL}
            AND NOT ${WATER_SQL}
            AND NOT ${blockedSql(bypassVoid)}
          ORDER BY cost, c.q, c.r
          LIMIT 1
       ) land ON true;`,
    { wrapJson: true },
  )) as Row[];

  const row = rows?.[0];
  if (!row) return { cell: null, ship: null, land: null };
  return {
    cell: { q: Number(row.pq), r: Number(row.pr) },
    ship: row.ship_id ? { id: row.ship_id } : null,
    land:
      row.lq === null || row.lq === undefined
        ? null
        : { q: Number(row.lq), r: Number(row.lr), cost: Number(row.lcost) || 1 },
  };
}
