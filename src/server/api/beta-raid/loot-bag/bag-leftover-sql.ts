// «Забрать сундук»: что не влезло в рюкзак — мешочком на клетке сундука (§8.21:
// порция на 24 часа, метки происхождения едут в мешочек). Общий кусок записи
// обычного и магического сундука (pchest-pickup-sql, chest-pickup-sql): два CTE
// — строка мешочка и порции — в том же операторе, что снимает сундук, поэтому
// мешочек появляется ровно тогда, когда сундук забран, и повтор ничего не
// удвоит (id мешочка — от ключа, ON CONFLICT DO NOTHING).
import { sqlStr } from "@/server/api/raid-shared";
import { ITEM_COLS, PORTION_TTL } from "@/server/api/beta-raid/loot-bag/bag-sql";

/** Порция мешочка из остатка: вид, сколько (n) и сколько из них «собрано прочее» (loot). */
export type BaggedRow = {
  k: string;
  kind: string;
  ref: string | null;
  item: string | null;
  name: string;
  image: string | null;
  n: number;
  loot: number;
};

/**
 * CTE `bag` и `items` (с запятой в конце). from — CTE снятого сундука со
 * столбцами map_id, q, r, name; key — ключ мешочка (id = 'lb_'||md5(key));
 * account — чья добыча (dropped_by). Остатка нет — пустой `bag`.
 */
export function leftoverBagSql(o: {
  key: string;
  account: string;
  from: string;
  bagged: readonly BaggedRow[];
}): string {
  if (o.bagged.length === 0) return `bag AS (SELECT NULL::text AS id WHERE false),`;
  const rows = `${sqlStr(JSON.stringify(o.bagged))}::jsonb`;
  return `bag AS (
       INSERT INTO yuplink.raid_loot_bag
          (id, map_id, q, r, created_at, dropped_by, source, source_name, updated_at)
       SELECT 'lb_' || md5(${sqlStr(o.key)}), d.map_id, d.q, d.r, now(), ${sqlStr(o.account)},
              'chest', d.name, now()
         FROM ${o.from} d
       ON CONFLICT (id) DO NOTHING
       RETURNING id
     ),
     items AS (
       INSERT INTO yuplink.raid_loot_bag_item (${ITEM_COLS})
       SELECT bag.id, v.k, ${PORTION_TTL}, v.kind, v.ref, v.item, v.name, v.image, v.n,
              0, 0, 0, LEAST(v.loot, v.n)
         FROM bag, jsonb_to_recordset(${rows}) AS v(k text, kind text, ref text, item text,
                                                    name text, image text, n numeric, loot numeric)
       RETURNING 1
     ),`;
}
