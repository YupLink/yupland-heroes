// «Поставить постройку» — одним оператором «всё или ничего» (lib/buildingSale):
// клетка держит постройку (bsale-rules-sql), чертёж есть, минус штука из стопки
// building:<чертёж>, постройка с обликом и настройкой чертежа на клетку, таблицы
// клетки из чертежа (витрина плавильни, заклинания — bsale-cells-sql) и ключ
// нажатия с ценой (raid_building_place_op — по нему разбор вернёт половину).
// Повтор того же нажатия ничего не пишет и ничего не берёт; отказ — ничего не
// списано, ответ несёт признаки клетки для понятного отказа.
//
// Постройка встаёт ПЕРВЫМ тиром (владелец 05.11: «сразу улучшенные — так нельзя»):
// дальше её улучшают за цену тира, как любую постройку карты. edit_seq карты
// растёт в том же операторе: черновик гекс-редактора не сотрёт постройку.
//
// Локи — отдельными операторами до WITH, как у жилы: карта (godmove), рюкзак
// героя, клетка (ключи посадки дерева и постановки шахты — порядок тот же).
import { sqlStr } from "@/server/api/raid-shared";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import { cellLockKey } from "@/server/api/beta-raid/chest/chest-cell";
import { mineLockKey } from "@/server/api/beta-raid/mine-place/mine-place-sql";
import { buildingFactsReason, buildingStackKey } from "@/lib/buildingSale";
import { bsaleFactColsSql, bsaleOkSql, factsFromRow } from "./bsale-rules-sql";
import { putCellsCtes, wipeCellsCtes } from "./bsale-cells-sql";

export type BuildingPlaceAt = {
  mapId: string;
  q: number;
  r: number;
  account: string;
  heroId: string;
  blueprintId: string;
  op: string;
};

/** Ответ оператора: повтор, встала ли, есть ли стопка и чертёж, признаки клетки. */
export type BuildingPlaceRow = {
  was: boolean;
  placed: boolean;
  box: boolean;
  /** Постройка, что встала (шаблон) — для реестра ратуш и рассылки. */
  building: string | null;
  /** Облик, настройка и тир вставшей постройки — для дельты клетки. */
  skin: string | null;
  config: Record<string, unknown> | null;
  tier: number | null;
  ok: boolean;
} & Record<string, unknown>;

/** Ответ → "ok" (встала или повтор того же нажатия) либо ключ отказа словаря. */
export function buildingPlaceVerdict(row: Partial<BuildingPlaceRow> | null | undefined): string {
  if (row?.was || row?.placed) return "ok";
  if (!row) return "bsale.busy";
  if (!row.box) return "bsale.no_item";
  return buildingFactsReason(factsFromRow(row)) ?? "bsale.busy";
}

export function placeBuildingSql(o: BuildingPlaceAt): string {
  const q = Math.floor(o.q);
  const r = Math.floor(o.r);
  const m = sqlStr(o.mapId);
  const key = sqlStr(o.op);
  const bp = sqlStr(o.blueprintId);
  // Таблицы клетки: стереть забытую витрину и положить витрину чертежа.
  const cells = [
    ...wipeCellsCtes({ m, q, r, when: "put", all: false }),
    ...putCellsCtes({ m, q, r, key }),
  ].join(",\n     ");
  return `${locksSql(
    `godmove:${o.mapId}`,
    `bp:${o.heroId}`,
    cellLockKey(o.mapId, q, r),
    mineLockKey(o.mapId, q, r),
  )}
     WITH prior AS (
       SELECT 1 FROM yuplink.raid_building_place_op WHERE op = ${key}
     ),
     plan AS (
       SELECT p.building_id, p.building_skin_id, p.building_config, p.cells, p.price
         FROM yuplink.raid_building_blueprint p
         JOIN yuplink.mystic_item_template t ON t.id = p.building_id AND t.kind = 'building'
        WHERE p.id = ${bp}
     ),
     item AS (
       SELECT b.id, b.count
         FROM yuplink.raid_hero_backpack b, plan
        WHERE b.hero_id = ${sqlStr(o.heroId)}
          AND b.stack_key = ${sqlStr(buildingStackKey(o.blueprintId))}
          AND b.count >= 1
          FOR UPDATE OF b
     ),
     /* Клетки нет вовсе — одна строка с пустыми c и t: признак no_cell. */
     spot AS (
       SELECT ${bsaleFactColsSql()},
              (${bsaleOkSql()}) AS ok
         FROM (SELECT 1) one
         LEFT JOIN yuplink.raid_map_cells c
           ON c.map_id = ${m} AND c.q = ${q} AND c.r = ${r}
         LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
     ),
     go AS (
       SELECT 1 FROM item, spot WHERE spot.ok AND NOT EXISTS (SELECT 1 FROM prior)
     ),
     put AS (
       UPDATE yuplink.raid_map_cells c
          SET building_id = plan.building_id,
              building_skin_id = plan.building_skin_id,
              building_config = plan.building_config,
              saved_at = now()
         FROM plan, go
        WHERE c.map_id = ${m} AND c.q = ${q} AND c.r = ${r} AND c.building_id IS NULL
       RETURNING c.building_id, c.building_skin_id, c.building_config
     ),
     /* Тир забытой постройки на этой клетке не наследуется — первый. */
     tier AS (
       INSERT INTO yuplink.beta_raid_building_state (map_id, q, r, tier, updated_at, updated_by)
       SELECT ${m}, ${q}, ${r}, 0, now(), 'bsale' FROM put
       ON CONFLICT (map_id, q, r) DO UPDATE SET tier = 0, updated_at = now(),
              updated_by = EXCLUDED.updated_by
       RETURNING tier
     ),
     ${cells},
     /* Игрок правит карту: черновик гекс-редактора должен это увидеть. */
     seq AS (
       UPDATE yuplink.raid_maps mp SET edit_seq = COALESCE(mp.edit_seq, 0) + 1
         FROM put WHERE mp.id = ${m}
       RETURNING 1
     ),
     /* Стопка — минус штука; последняя — строки нет. */
     dec AS (
       UPDATE yuplink.raid_hero_backpack b SET count = b.count - 1, updated_at = now()
         FROM item, put
        WHERE b.id = item.id AND item.count > 1
       RETURNING 1
     ),
     del AS (
       DELETE FROM yuplink.raid_hero_backpack b USING item, put
        WHERE b.id = item.id AND item.count <= 1
       RETURNING 1
     ),
     /* Прежний хозяин клетки (постройку снёс админ) — больше не хозяин. */
     retire AS (
       UPDATE yuplink.raid_building_place_op x SET gone_at = now() FROM put
        WHERE x.map_id = ${m} AND x.q = ${q} AND x.r = ${r} AND x.gone_at IS NULL
          AND x.op <> ${key}
       RETURNING 1
     ),
     mark AS (
       INSERT INTO yuplink.raid_building_place_op
              (op, account_id, map_id, q, r, blueprint_id, price)
       SELECT ${key}, ${sqlStr(o.account)}, ${m}, ${q}, ${r}, ${bp}, plan.price FROM put, plan
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT EXISTS (SELECT 1 FROM prior) AS was,
              EXISTS (SELECT 1 FROM put) AS placed,
              EXISTS (SELECT 1 FROM item) AS box,
              (SELECT put.building_id FROM put) AS building,
              (SELECT put.building_skin_id FROM put) AS skin,
              (SELECT put.building_config FROM put) AS config,
              (SELECT tier.tier FROM tier) AS tier,
              s.*
         FROM spot s
     ) _t;`;
}
