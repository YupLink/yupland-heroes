// Чертёж шахты (ПРАВИЛА §8.59 п. 8, таблица raid_mine_plan, migrations/minev2-41):
// один на аккаунт — новый заменяет старый. Только метка «здесь поставлю»: не
// стена, никого не держит, другим не виден и в карту не едет. Ставит шахту
// оператор постановки (mine-place-sql) — он же стирает чертёж своей клетки.
import { boostedCaptureCost } from "@/lib/mineBoost";
import { sqlStr } from "@/server/api/raid-shared";
import { isPlaceableBlueprint, type PlaceableBlueprint } from "@/lib/minePlacement";
import type { MinePlanView } from "@/lib/mineBuild";
import {
  CELL_HELD,
  cellExtraColsSql,
  cellFlagsColsSql,
  sameCellAsC,
} from "@/server/api/beta-raid/chest/chest-cell";
import { mineCellColsSql } from "@/server/api/beta-raid/mine-place/mine-place-cell-sql";

export type MinePlanRow = {
  map_id: string;
  q: number | string;
  r: number | string;
  kind: string;
  stack_key: string;
};

/** Чертёж аккаунта (на любой карте). */
export const planReadSql = (account: string): string =>
  `SELECT map_id, q, r, kind, stack_key FROM yuplink.raid_mine_plan
    WHERE account_id = ${sqlStr(account)} LIMIT 1;`;

/**
 * Чертёж аккаунта и held — клетку заняли так, что шахту туда уже не поставить:
 * те же признаки, что держат клетку у постановки (постройка или шахта, объект,
 * вода и купол, сундук, охрана, декор, судно, блок, дорога, живой мешочек —
 * chest-cell и mine-place-cell-sql). Игрок на клетке чертёж не губит: он уйдёт.
 * Клетки нет на карте — тоже held.
 */
export const planLookSql = (account: string): string =>
  `SELECT pl.map_id, pl.q, pl.r, pl.kind, pl.stack_key,
          COALESCE((SELECT ${CELL_HELD} OR f.road OR f.taken OR f.bag
                      FROM (SELECT ${cellFlagsColsSql(sameCellAsC)},
                                   ${cellExtraColsSql(sameCellAsC)},
                                   ${mineCellColsSql(account, sameCellAsC)}
                              FROM yuplink.raid_map_cells c
                              LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
                             WHERE c.map_id = pl.map_id AND c.q = pl.q AND c.r = pl.r) f
                     CROSS JOIN LATERAL (SELECT f.decor, f.ship) ex), true) AS held
     FROM yuplink.raid_mine_plan pl
    WHERE pl.account_id = ${sqlStr(account)} LIMIT 1;`;

/** Стереть именно этот чертёж: новый, положенный тем временем, не трогаем. */
export const planDropAtSql = (account: string, mapId: string, q: number, r: number): string =>
  `DELETE FROM yuplink.raid_mine_plan
    WHERE account_id = ${sqlStr(account)} AND map_id = ${sqlStr(mapId)}
      AND q = ${Math.floor(q)} AND r = ${Math.floor(r)};`;

/** Положить чертёж: повтор того же — та же строка, другой — заменяет прежний. */
export function planPutSql(o: {
  account: string;
  mapId: string;
  q: number;
  r: number;
  kind: PlaceableBlueprint;
  stackKey: string;
}): string {
  return `INSERT INTO yuplink.raid_mine_plan AS p (account_id, map_id, q, r, kind, stack_key)
     VALUES (${sqlStr(o.account)}, ${sqlStr(o.mapId)}, ${Math.floor(o.q)}, ${Math.floor(o.r)},
             ${sqlStr(o.kind)}, ${sqlStr(o.stackKey)})
     ON CONFLICT (account_id) DO UPDATE
        SET map_id = EXCLUDED.map_id, q = EXCLUDED.q, r = EXCLUDED.r, kind = EXCLUDED.kind,
            stack_key = EXCLUDED.stack_key, created_at = now();`;
}

/** Убрать чертёж аккаунта. */
export const planDropSql = (account: string): string =>
  `DELETE FROM yuplink.raid_mine_plan WHERE account_id = ${sqlStr(account)};`;

/** Строка → чертёж для клиента; чужая карта или незнакомый вид — нет чертежа. */
export function planViewOf(
  row: MinePlanRow | null | undefined,
  mapId: string,
  /** Уровень усиления чертежа этого вида (lib/mineBoost); энергия постановки — с ним. */
  boostLevel = 0,
): MinePlanView | null {
  if (!row || row.map_id !== mapId || !isPlaceableBlueprint(row.kind as PlaceableBlueprint))
    return null;
  const kind = row.kind as PlaceableBlueprint;
  return {
    mapId: row.map_id,
    q: Number(row.q),
    r: Number(row.r),
    kind,
    stackKey: String(row.stack_key),
    energy: boostedCaptureCost(kind, boostLevel),
  };
}
