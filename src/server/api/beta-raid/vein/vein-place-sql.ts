// «Положить жилу» — одним оператором «всё или ничего» (lib/veinPlace): клетка
// держит жилу (vein-rules-sql — правила minev2-30 и «жилы ещё нет»), минус
// клетка из стопки vein:<вид>, строка raid_map_vein этого вида с поворотом и
// ключ нажатия (raid_vein_place_op, migrations/vein-01). Повтор того же нажатия
// ничего не пишет и ничего не берёт. Иначе — ничего не списано, а ответ несёт
// признаки клетки: по ним понятный отказ.
//
// Локи — отдельными операторами до WITH, как у земли и посадки дерева: карта
// (godmove), рюкзак героя, клетка (те же ключи, что у посадки дерева и
// постановки шахты — порядок тот же, подмножеством). Без обёртки wrapJson:
// изменяющие CTE — верхний уровень.
import { sqlStr } from "@/server/api/raid-shared";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import { cellLockKey } from "@/server/api/beta-raid/chest/chest-cell";
import { mineLockKey } from "@/server/api/beta-raid/mine-place/mine-place-sql";
import { VEIN_ROTS, veinFactsReason, veinStackKey, type VeinKind } from "@/lib/veinPlace";
import { factsFromRow, veinFactColsSql, veinOkSql } from "./vein-rules-sql";

export type VeinPlaceAt = {
  mapId: string;
  q: number;
  r: number;
  account: string;
  heroId: string;
  kind: VeinKind;
  /** Поворот картинки 0..300 через 60 (lib/veinPlace.randomVeinRot). */
  rot: number;
  op: string;
};

/** Ответ оператора: повтор, легла ли, есть ли стопка и признаки клетки. */
export type VeinPlaceRow = {
  was: boolean;
  placed: boolean;
  /** Стопка жилы этого вида есть в рюкзаке героя. */
  box: boolean;
  /** Поворот легшей жилы; не легла — null. */
  rot: number | string | null;
  /** Клетка держит жилу (все признаки ниже — false). */
  ok: boolean;
} & Record<string, unknown>;

/** Ответ → "ok" (легла или повтор того же нажатия) либо ключ отказа словаря. */
export function veinPlaceVerdict(row: Partial<VeinPlaceRow> | null | undefined): string {
  if (row?.was || row?.placed) return "ok";
  if (!row) return "vein.busy";
  if (!row.box) return "vein.no_item";
  return veinFactsReason(factsFromRow(row)) ?? "vein.busy";
}

export function placeVeinSql(o: VeinPlaceAt): string {
  const q = Math.floor(o.q);
  const r = Math.floor(o.r);
  const m = sqlStr(o.mapId);
  const key = sqlStr(o.op);
  const kind = sqlStr(o.kind);
  const rot = (VEIN_ROTS as readonly number[]).includes(o.rot) ? o.rot : 0;
  return `${locksSql(
    `godmove:${o.mapId}`,
    `bp:${o.heroId}`,
    cellLockKey(o.mapId, q, r),
    mineLockKey(o.mapId, q, r),
  )}
     WITH prior AS (
       SELECT 1 FROM yuplink.raid_vein_place_op WHERE op = ${key}
     ),
     item AS (
       SELECT b.id, b.count
         FROM yuplink.raid_hero_backpack b
        WHERE b.hero_id = ${sqlStr(o.heroId)}
          AND b.stack_key = ${sqlStr(veinStackKey(o.kind))}
          AND b.count >= 1
          FOR UPDATE
     ),
     /* Клетки нет вовсе — одна строка с пустыми c и t: признак no_cell. */
     spot AS (
       SELECT ${veinFactColsSql()},
              (${veinOkSql()}) AS ok
         FROM (SELECT 1) one
         LEFT JOIN yuplink.raid_map_cells c
           ON c.map_id = ${m} AND c.q = ${q} AND c.r = ${r}
         LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
     ),
     go AS (
       SELECT 1 FROM item, spot WHERE spot.ok AND NOT EXISTS (SELECT 1 FROM prior)
     ),
     ins AS (
       INSERT INTO yuplink.raid_map_vein (map_id, q, r, kind, rot, placed_by)
       SELECT ${m}, ${q}, ${r}, ${kind}, ${rot}, ${sqlStr(o.account)} FROM go
       ON CONFLICT (map_id, q, r) DO NOTHING
       RETURNING q, r, kind, rot
     ),
     /* Стопка жилы — минус клетка; последняя — строки нет. */
     dec AS (
       UPDATE yuplink.raid_hero_backpack b SET count = b.count - 1, updated_at = now()
         FROM item, ins
        WHERE b.id = item.id AND item.count > 1
       RETURNING 1
     ),
     del AS (
       DELETE FROM yuplink.raid_hero_backpack b USING item, ins
        WHERE b.id = item.id AND item.count <= 1
       RETURNING 1
     ),
     mark AS (
       INSERT INTO yuplink.raid_vein_place_op (op, account_id, map_id, q, r, kind, rot)
       SELECT ${key}, ${sqlStr(o.account)}, ${m}, ins.q, ins.r, ins.kind, ins.rot
         FROM ins
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT EXISTS (SELECT 1 FROM prior) AS was,
              EXISTS (SELECT 1 FROM ins) AS placed,
              EXISTS (SELECT 1 FROM item) AS box,
              (SELECT ins.rot FROM ins) AS rot,
              s.*
         FROM spot s
     ) _t;`;
}
