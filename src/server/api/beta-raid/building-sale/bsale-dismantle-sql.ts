// «Разобрать свою постройку» — одним оператором (владелец 05.11.2026: «самому
// можно разобрать свою постройку, забрав 50 % стоимости»).
//
// Свою = последний ключ установки этой клетки от этого аккаунта, не разобранный,
// и на клетке стоит постройка того же шаблона (админ мог снести и поставить своё).
// Под локами проверяется, что ферма пуста (героев сняли до оператора, а урожай
// вывезен на склад) и склад пуст — чужие товары и урожай не пропадают. Дальше:
// клетка без постройки, тир, таблицы клетки (витрина, заклинания), дробные хвосты
// фермы, edit_seq карты, отметка «разобрана» и ключ нажатия с тем, что вернуть.
// Повтор того же нажатия ничего не пишет и отдаёт прежний возврат.
import { sqlStr } from "@/server/api/raid-shared";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import { cellLockKey } from "@/server/api/beta-raid/chest/chest-cell";
import type { RefundLine } from "@/lib/buildingSale";
import { wipeCellsCtes } from "./bsale-cells-sql";

export type DismantleAt = {
  mapId: string;
  q: number;
  r: number;
  account: string;
  /** Ключ установки, который считали своим до оператора. */
  placeOp: string;
  op: string;
  refund: readonly RefundLine[];
};

export type DismantleRow = {
  was: boolean;
  /** Возврат прежнего нажатия (повтор). */
  prior: RefundLine[] | null;
  done: boolean;
  own: boolean;
  workers: boolean;
  goods: boolean;
  /** Что стояло (шаблон) — для реестра города. */
  building: string | null;
};

/** Ответ → "ok" либо ключ отказа словаря. */
export function dismantleVerdict(row: Partial<DismantleRow> | null | undefined): string {
  if (row?.was || row?.done) return "ok";
  if (!row) return "bsale.busy";
  if (!row.own) return "bsale.not_owner";
  if (row.workers) return "bsale.dis_workers";
  if (row.goods) return "bsale.dis_goods";
  return "bsale.busy";
}

export function dismantleSql(o: DismantleAt): string {
  const q = Math.floor(o.q);
  const r = Math.floor(o.r);
  const m = sqlStr(o.mapId);
  const key = sqlStr(o.op);
  const at = (a: string) => `${a}.map_id = ${m} AND ${a}.q = ${q} AND ${a}.r = ${r}`;
  const wipe = wipeCellsCtes({ m, q, r, when: "clear", all: true }).join(",\n     ");
  return `${locksSql(`godmove:${o.mapId}`, cellLockKey(o.mapId, q, r), `field:${o.mapId}:${q}:${r}`)}
     WITH prior AS (
       SELECT refund FROM yuplink.raid_building_dismantle_op WHERE op = ${key}
     ),
     own AS (
       SELECT x.op, c.building_id
         FROM yuplink.raid_building_place_op x
         JOIN yuplink.raid_building_blueprint b ON b.id = x.blueprint_id
         JOIN yuplink.raid_map_cells c ON ${at("c")} AND c.building_id = b.building_id
        WHERE ${at("x")} AND x.gone_at IS NULL
          AND x.op = ${sqlStr(o.placeOp)} AND x.account_id = ${sqlStr(o.account)}
        FOR UPDATE OF x
     ),
     workers AS (
       SELECT 1 FROM yuplink.raid_field_worker w
        WHERE ${at("w")} AND (w.hero_id IS NOT NULL OR COALESCE(w.accrued, 0) >= 1)
        LIMIT 1
     ),
     goods AS (
       SELECT 1 FROM yuplink.raid_warehouse_slot s WHERE ${at("s")} AND s.count > 0 LIMIT 1
     ),
     go AS (
       SELECT own.op FROM own
        WHERE NOT EXISTS (SELECT 1 FROM prior)
          AND NOT EXISTS (SELECT 1 FROM workers) AND NOT EXISTS (SELECT 1 FROM goods)
     ),
     clear AS (
       UPDATE yuplink.raid_map_cells c
          SET building_id = NULL, building_skin_id = NULL, building_config = NULL,
              saved_at = now()
         FROM go WHERE ${at("c")}
       RETURNING 1
     ),
     st AS (
       DELETE FROM yuplink.beta_raid_building_state s USING clear WHERE ${at("s")} RETURNING 1
     ),
     ${wipe},
     /* Дробные хвосты фермы (< 1) — пустые строки, иначе ожили бы на новой ферме. */
     fw AS (
       DELETE FROM yuplink.raid_field_worker w USING clear WHERE ${at("w")} RETURNING 1
     ),
     seq AS (
       UPDATE yuplink.raid_maps mp SET edit_seq = COALESCE(mp.edit_seq, 0) + 1
         FROM clear WHERE mp.id = ${m}
       RETURNING 1
     ),
     gone AS (
       UPDATE yuplink.raid_building_place_op x SET gone_at = now()
         FROM go, clear WHERE x.op = go.op
       RETURNING 1
     ),
     mark AS (
       INSERT INTO yuplink.raid_building_dismantle_op
              (op, account_id, map_id, q, r, place_op, refund)
       SELECT ${key}, ${sqlStr(o.account)}, ${m}, ${q}, ${r}, go.op,
              ${sqlStr(JSON.stringify(o.refund))}::jsonb
         FROM go, clear
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT EXISTS (SELECT 1 FROM prior) AS was,
              (SELECT refund FROM prior) AS prior,
              EXISTS (SELECT 1 FROM clear) AS done,
              EXISTS (SELECT 1 FROM own) AS own,
              EXISTS (SELECT 1 FROM workers) AS workers,
              EXISTS (SELECT 1 FROM goods) AS goods,
              (SELECT own.building_id FROM own) AS building
     ) _t;`;
}
