// «Посадить дерево» из рюкзака — одним оператором «всё или ничего» (lib/treePlant):
// клетка, шаблон, энергия, минус штука из стопки tree:<шаблон>, очередь рассылки
// декора и ключ нажатия.
//
// Клетка — правила tree-cell-sql (как у шахт, но кучке можно). Шаблон ещё раз
// сверяется: срубаемое дерево (админ мог выключить «Срубить» после продажи).
// Энергия — тем же оператором и только вместе с деревом (paid от setc, как у
// грибов): нехватка (not_enough_energy) роняет всё — ни дерева, ни траты;
// клетку перехватили — ни траты. Ключ нажатия — raid_tree_plant_op
// (migrations/trees-01): повтор второе дерево не сажает и не платит.
//
// Рассылка — тем же путём, что у отросшего декора (decor-respawn): строка
// raid_decor_respawn с placed_at = «встал, ещё не разослан». Ручка сразу зовёт
// проход рассылки, сбой дошлёт минутный цикл — «невидимой стены» не будет.
// Ждавший отрастания срубленный декор клетки не теряется (владелец 25.10.2026):
// его шаблон уходит в under_decor той же строки, после рассылки строка снова
// ждёт его — «держит дерево»; посаженное срубили — таймер «Респавн, мин» с этой
// минуты (decor-respawn-sql, tree-chop-sql).
//
// Метка «посадил игрок» — planted_decor клетки = шаблон (migrations/trees-02),
// тем же UPDATE, что и декор: срубленное посаженное не отрастает (tree-chop-sql).
//
// Локи — отдельными операторами до WITH, в порядке постановки шахт и грибов.
// Без обёртки wrapJson: изменяющие CTE — верхний уровень.
import { sqlStr } from "@/server/api/raid-shared";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import { cellAt, cellLockKey } from "@/server/api/beta-raid/chest/chest-cell";
import { mineLockKey } from "@/server/api/beta-raid/mine-place/mine-place-sql";
import {
  TREE_HELD,
  plantableSql,
  treeCellColsSql,
} from "@/server/api/beta-raid/tree/tree-cell-sql";
import {
  plantStackKey,
  treeCellVerdict,
  type PlantKind,
  type TreeCellFlags,
} from "@/lib/treePlant";

export type TreePlantAt = {
  mapId: string;
  q: number;
  r: number;
  account: string;
  /** Кошелёк плательщика энергии. */
  wallet: string;
  heroId: string;
  /** Шаблон дерева или камня (decoration_…). */
  decorId: string;
  /** Дерево (по умолчанию) или камень: от него стопка и проверка шаблона. */
  kind?: PlantKind;
  op: string;
  /** Энергия за посадку. */
  cost: number;
};

/** Ответ оператора: повтор, посажено и почему нет. */
export type TreePlantRow = {
  was: boolean;
  placed: boolean;
  /** Клетка есть на карте. */
  cell: boolean;
  /** Шаблон всё ещё срубаемое дерево. */
  kind: boolean;
  /** Стопка дерева есть в рюкзаке героя. */
  box: boolean;
  /** Признаки клетки (tree-cell-sql). */
  flags: TreeCellFlags | null;
  /** Сколько энергии списано (только если встало). */
  paid?: number | string | null;
};

/** Ответ оператора → "ok" (встало или повтор того же нажатия) либо ключ отказа словаря. */
export function treePlantVerdict(row: Partial<TreePlantRow> | null | undefined): string {
  if (row?.was || row?.placed) return "ok";
  if (!row || !row.cell) return "tree.busy";
  if (!row.box) return "tree.no_item";
  if (!row.kind) return "tree.gone_kind";
  return treeCellVerdict(row.flags) ?? "tree.busy";
}

export function plantTreeSql(o: TreePlantAt): string {
  const q = Math.floor(o.q);
  const r = Math.floor(o.r);
  const m = sqlStr(o.mapId);
  const key = sqlStr(o.op);
  const at = cellAt(o.mapId, q, r);
  const cost = Math.max(0, Math.floor(Number(o.cost) || 0));
  const kind = o.kind ?? "tree";
  return `${locksSql(
    `godmove:${o.mapId}`,
    `bp:${o.heroId}`,
    "decor-respawn",
    cellLockKey(o.mapId, q, r),
    `lootdrop:${o.mapId}:${q}:${r}`,
    mineLockKey(o.mapId, q, r),
  )}
     WITH prior AS (
       SELECT 1 FROM yuplink.raid_tree_plant_op WHERE op = ${key}
     ),
     tf AS (
       SELECT ${treeCellColsSql(o.account, at)}
         FROM yuplink.raid_map_cells c
         LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
        WHERE ${at("c")}
        LIMIT 1
     ),
     tpl AS (
       SELECT d.id FROM yuplink.mystic_item_template d
        WHERE d.id = ${sqlStr(o.decorId)} AND ${plantableSql(kind, "d")}
        LIMIT 1
     ),
     item AS (
       SELECT b.id, b.count
         FROM yuplink.raid_hero_backpack b
        WHERE b.hero_id = ${sqlStr(o.heroId)}
          AND b.stack_key = ${sqlStr(plantStackKey(kind, o.decorId))}
          AND b.count >= 1
          FOR UPDATE
     ),
     go AS (
       SELECT 1 FROM tf, tpl, item
        WHERE NOT EXISTS (SELECT 1 FROM prior) AND NOT ${TREE_HELD}
     ),
     setc AS (
       UPDATE yuplink.raid_map_cells c
          SET decoration_id = tpl.id, planted_decor = tpl.id, saved_at = now()
         FROM go, tpl
        WHERE ${at("c")} AND c.decoration_id IS NULL AND c.building_id IS NULL
          AND c.object_id IS NULL
       RETURNING c.map_id, c.q, c.r, c.decoration_id, c.terrain_id, c.road_id, c.building_id,
                 c.object_id, c.group_id
     ),
     /* Энергия — только вместе с деревом; нехватка (not_enough_energy) роняет всё. */
     paid AS (
       SELECT 1 FROM setc
        CROSS JOIN LATERAL yuplink.touch_energy_atomic(${sqlStr(o.wallet)}, ${cost}::numeric) e
     ),
     /* Стопка дерева — минус штука; последняя — строки нет. */
     dec AS (
       UPDATE yuplink.raid_hero_backpack b SET count = b.count - 1, updated_at = now()
         FROM item, setc
        WHERE b.id = item.id AND item.count > 1
       RETURNING 1
     ),
     del AS (
       DELETE FROM yuplink.raid_hero_backpack b USING item, setc
        WHERE b.id = item.id AND item.count <= 1
       RETURNING 1
     ),
     /* «Встал, не разослан» — рассылает decor-respawn; ждавший отрастания декор —
        в under_decor (после рассылки строка снова ждёт его). */
     pub AS (
       INSERT INTO yuplink.raid_decor_respawn AS x
         (map_id, q, r, decor_id, due_at, terrain_id, road_id, building_id, object_id,
          group_id, placed_at, created_at)
       SELECT s.map_id, s.q, s.r, s.decoration_id, now(), s.terrain_id, s.road_id,
              s.building_id, s.object_id, s.group_id, now(), now()
         FROM setc s
       ON CONFLICT (map_id, q, r) DO UPDATE
          SET under_decor = CASE WHEN x.placed_at IS NULL THEN x.decor_id ELSE x.under_decor END,
              held_at = NULL,
              decor_id = EXCLUDED.decor_id, due_at = EXCLUDED.due_at,
              terrain_id = EXCLUDED.terrain_id, road_id = EXCLUDED.road_id,
              building_id = EXCLUDED.building_id, object_id = EXCLUDED.object_id,
              group_id = EXCLUDED.group_id, placed_at = EXCLUDED.placed_at,
              created_at = EXCLUDED.created_at
       RETURNING 1
     ),
     /* Игрок правит клетку карты: черновик гекс-редактора должен это увидеть. */
     seq AS (
       UPDATE yuplink.raid_maps mp SET edit_seq = COALESCE(mp.edit_seq, 0) + 1
         FROM setc WHERE mp.id = ${m}
       RETURNING 1
     ),
     mark AS (
       INSERT INTO yuplink.raid_tree_plant_op (op, account_id, map_id, q, r, decor_id, paid)
       SELECT ${key}, ${sqlStr(o.account)}, ${m}, ${q}, ${r}, s.decoration_id, ${cost}
         FROM setc s
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT EXISTS (SELECT 1 FROM prior) AS was,
              EXISTS (SELECT 1 FROM setc) AS placed,
              EXISTS (SELECT 1 FROM tf) AS cell,
              EXISTS (SELECT 1 FROM tpl) AS kind,
              EXISTS (SELECT 1 FROM item) AS box,
              (SELECT to_jsonb(tf.*) FROM tf) AS flags,
              (SELECT count(*) FROM paid)::int * ${cost} AS paid
     ) _t;`;
}
