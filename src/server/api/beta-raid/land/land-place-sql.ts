// «Положить землю» — одним оператором «всё или ничего» (lib/landPlace):
// шаблон местности, минус клетка из стопки land:<местность>, клетка карты и ключ
// нажатия (raid_land_place_op, migrations/land-01..02). Клетки нет — новая клетка
// в пустоте, даром. Клетка другой местности без объекта, декора и героя —
// перестройка: только местность, постройка, дорога и прочее остаются (под СВОЮ
// постройку — не вода: владелец 05.11.2026 «под уже поставленным зданием
// невозможно разместить или заменить тип местности»; под чужой и под шахтой —
// нельзя); энергия —
// тем же оператором и только вместе с перестройкой (нехватка, not_enough_energy,
// роняет всё). Иначе — ничего не списано.
//
// Локи — отдельными операторами до WITH, как у посадки дерева. Без обёртки
// wrapJson: изменяющие CTE — верхний уровень.
import { sqlStr } from "@/server/api/raid-shared";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import { landStackKey } from "@/lib/landPlace";
import { WATER_SQL } from "@/server/api/beta-raid/cell-sql";

export type LandPlaceAt = {
  mapId: string;
  q: number;
  r: number;
  account: string;
  wallet: string;
  heroId: string;
  terrainId: string;
  op: string;
  /** Энергия за перестройку (LAND_REBUILD_ENERGY). */
  cost: number;
};

/** Ответ оператора: повтор, легла ли и почему нет. */
export type LandPlaceRow = {
  was: boolean;
  placed: boolean;
  /** Шаблон — живая местность. */
  kind: boolean;
  /** Стопка земли есть в рюкзаке героя. */
  box: boolean;
  /** Клетка уже была на карте. */
  taken: boolean;
  /** На клетке уже эта местность. */
  same: boolean;
  /** На клетке объект или декор. */
  built: boolean;
  /** Вода под постройку. */
  wet: boolean;
  /** Постройка на клетке — не этого игрока. */
  other: boolean;
  /** На клетке стоит герой. */
  hero: boolean;
  /** Списано энергии (перестройка). */
  paid: number | string | null;
};

/** Ответ → "ok" (легла или повтор того же нажатия) либо ключ отказа словаря. */
export function landPlaceVerdict(row: Partial<LandPlaceRow> | null | undefined): string {
  if (row?.was || row?.placed) return "ok";
  if (!row) return "land.busy";
  if (!row.box) return "land.no_item";
  if (!row.kind) return "land.gone_kind";
  if (row.built) return "land.built";
  if (row.other) return "land.building_other";
  if (row.wet) return "land.water_building";
  if (row.same) return "land.same";
  if (row.hero) return "land.hero";
  return "land.busy";
}

export function placeLandSql(o: LandPlaceAt): string {
  const q = Math.floor(o.q);
  const r = Math.floor(o.r);
  const m = sqlStr(o.mapId);
  const key = sqlStr(o.op);
  const cost = Math.max(0, Number(o.cost) || 0);
  const at = `c.map_id = ${m} AND c.q = ${q} AND c.r = ${r}`;
  const bare = "c.object_id IS NULL AND c.decoration_id IS NULL";
  return `${locksSql(`godmove:${o.mapId}`, `bp:${o.heroId}`, `landcell:${o.mapId}:${q}:${r}`)}
     WITH prior AS (
       SELECT 1 FROM yuplink.raid_land_place_op WHERE op = ${key}
     ),
     tpl AS (
       SELECT t.id, ${WATER_SQL} AS water FROM yuplink.mystic_item_template t
        WHERE t.id = ${sqlStr(o.terrainId)} AND t.kind = 'terrain'
          AND COALESCE(t.active, true)
        LIMIT 1
     ),
     item AS (
       SELECT b.id, b.count
         FROM yuplink.raid_hero_backpack b
        WHERE b.hero_id = ${sqlStr(o.heroId)}
          AND b.stack_key = ${sqlStr(landStackKey(o.terrainId))}
          AND b.count >= 1
          FOR UPDATE
     ),
     was_cell AS (
       SELECT c.terrain_id, (${bare}) AS bare, (c.building_id IS NOT NULL) AS building
         FROM yuplink.raid_map_cells c WHERE ${at}
     ),
     /* Своя постройка — по ключу установки этого игрока (lib/buildingSale). */
     own_bld AS (
       SELECT 1 FROM yuplink.raid_building_place_op x
        WHERE x.map_id = ${m} AND x.q = ${q} AND x.r = ${r} AND x.gone_at IS NULL
          AND x.account_id = ${sqlStr(o.account)}
        LIMIT 1
     ),
     hero_on AS (
       SELECT 1 FROM yuplink.beta_raid_positions p
        WHERE p.map_id = ${m} AND p.q = ${q} AND p.r = ${r}
        LIMIT 1
     ),
     go AS (
       SELECT 1 FROM tpl, item WHERE NOT EXISTS (SELECT 1 FROM prior)
     ),
     ins AS (
       INSERT INTO yuplink.raid_map_cells (map_id, q, r, terrain_id, saved_at)
       SELECT ${m}, ${q}, ${r}, tpl.id, now() FROM go, tpl
        WHERE NOT EXISTS (SELECT 1 FROM was_cell)
       ON CONFLICT (map_id, q, r) DO NOTHING
       RETURNING q, r, terrain_id
     ),
     /* Перестройка: только местность; объект, декор, герой на клетке и вода под
        постройку — нет. */
     upd AS (
       UPDATE yuplink.raid_map_cells c SET terrain_id = tpl.id, saved_at = now()
         FROM go, tpl
        WHERE ${at} AND ${bare} AND c.terrain_id IS DISTINCT FROM tpl.id
          AND (c.building_id IS NULL OR (EXISTS (SELECT 1 FROM own_bld) AND NOT tpl.water))
          AND NOT EXISTS (SELECT 1 FROM hero_on)
       RETURNING c.q, c.r, c.terrain_id
     ),
     put AS (
       SELECT q, r, terrain_id FROM ins UNION ALL SELECT q, r, terrain_id FROM upd
     ),
     /* Энергия — только вместе с перестройкой; нехватка роняет всё. */
     paid AS (
       SELECT 1 FROM upd
        CROSS JOIN LATERAL yuplink.touch_energy_atomic(${sqlStr(o.wallet)}, ${cost}::numeric) e
     ),
     /* Стопка земли — минус клетка; последняя — строки нет. */
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
     /* Игрок правит карту: черновик гекс-редактора должен это увидеть. */
     seq AS (
       UPDATE yuplink.raid_maps mp SET edit_seq = COALESCE(mp.edit_seq, 0) + 1
         FROM put WHERE mp.id = ${m}
       RETURNING 1
     ),
     mark AS (
       INSERT INTO yuplink.raid_land_place_op (op, account_id, map_id, q, r, terrain_id, paid)
       SELECT ${key}, ${sqlStr(o.account)}, ${m}, put.q, put.r, put.terrain_id,
              (SELECT count(*) FROM paid) * ${cost}
         FROM put
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT EXISTS (SELECT 1 FROM prior) AS was,
              EXISTS (SELECT 1 FROM put) AS placed,
              EXISTS (SELECT 1 FROM tpl) AS kind,
              EXISTS (SELECT 1 FROM item) AS box,
              EXISTS (SELECT 1 FROM was_cell) AS taken,
              EXISTS (SELECT 1 FROM was_cell w, tpl WHERE w.terrain_id = tpl.id) AS same,
              EXISTS (SELECT 1 FROM was_cell w WHERE NOT w.bare) AS built,
              EXISTS (SELECT 1 FROM was_cell w, tpl WHERE w.building AND tpl.water) AS wet,
              EXISTS (SELECT 1 FROM was_cell w WHERE w.building)
                AND NOT EXISTS (SELECT 1 FROM own_bld) AS other,
              EXISTS (SELECT 1 FROM hero_on) AND EXISTS (SELECT 1 FROM was_cell) AS hero,
              (SELECT count(*) FROM paid)::int * ${cost} AS paid
     ) _t;`;
}
