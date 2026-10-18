// SQL «положить из рюкзака в мешочек» (bag-put.ts) — одной транзакцией: снять
// со стопки рюкзака и добавить порцию в мешочек со сроком 24 часа. Обе таблицы
// в одной базе, поэтому ни отката, ни развязки не нужно: либо переехало всё,
// либо ничего. Повтор моста видит ключ нажатия и второй раз не кладёт.
//
// Локи — рюкзака героя (тот же, что у выдачи в рюкзак) и мешочка, каждый
// отдельным оператором (§8.15). Метки уходят по правилу траты (безымянное —
// купленное — первым, stack-origin) и едут в порцию: собранное остаётся
// собранным, купленное купленным. Изношенная штука инструмента из рюкзака не
// уходит — это держит сама база (CHECK raid_hero_backpack_worn_stays).
import { sqlStr } from "@/server/api/raid-shared";
import { exactQty } from "@/lib/warehouseCells";
import {
  ORIGINS,
  originCols,
  originSetSql,
  originTakeSql,
  originTakenSql,
} from "@/server/api/beta-raid/stack-origin";
import {
  ITEM_COLS,
  PORTION_TTL,
  bagLockSql,
  livePortion,
  num,
} from "@/server/api/beta-raid/loot-bag/bag-sql";

/** Допуск точного списания «всё»: столько double может разойтись с numeric. */
const NOISE = "0.000000001";

/** Строка ответа: сколько переложено этим ключом и подпись вида (для журнала). */
export type PutRow = {
  qty: number | string;
  kind: string;
  refId: string | null;
  name: string;
  image: string | null;
};

/** Ответ «положить» — строка ключа нажатия с подписью вида (общий у putSql и «забора»). */
const putRowSql = (op: string): string => `SELECT row_to_json(_t.*) AS _row FROM (
       SELECT o.qty, i.kind, i.ref_id AS "refId", i.name, i.image
         FROM yuplink.raid_loot_bag_op o
         LEFT JOIN LATERAL (
           SELECT kind, ref_id, name, image FROM yuplink.raid_loot_bag_item
            WHERE bag_id = o.bag_id AND stack_key = o.stack_key
            ORDER BY expires_at DESC LIMIT 1
         ) i ON true
        WHERE o.op = ${op}
     ) _t;`;

/** Локи «положить»: рюкзак героя, затем мешочек — отдельными операторами. */
const putLocksSql = (heroId: string, bagId: string): string =>
  `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`bp:${heroId}`)})) AS l;
     ${bagLockSql(bagId)}`;

/**
 * «Забор» «положить», когда ответ putSql не пришёл: под теми же локами — ключ
 * нажатия с qty 0 ('failed'), если его ещё нет. Опоздавшая попытка putSql
 * увидит ключ и ничего не переложит; ответ — как у putSql (qty > 0 — прошло).
 */
export function putFenceSql(o: {
  bagId: string;
  heroId: string;
  stackKey: string;
  op: string;
  account: string;
}): string {
  const op = sqlStr(o.op);
  return `${putLocksSql(o.heroId, o.bagId)}
     INSERT INTO yuplink.raid_loot_bag_op (op, bag_id, account_id, hero_id, kind, stack_key, qty, state)
     VALUES (${op}, ${sqlStr(o.bagId)}, ${sqlStr(o.account)}, ${sqlStr(o.heroId)}, 'put',
             ${sqlStr(o.stackKey)}, 0, 'failed')
     ON CONFLICT (op) DO NOTHING;
     ${putRowSql(op)}`;
}

/**
 * Переложить qty штук стопки stackKey из рюкзака героя в мешочек. Мешочек —
 * живой и не закопанный. Ответ последнего оператора — строка ключа (этой
 * попыткой или прошлой); строки нет — ничего не переехало: мешочка нет, он
 * закопан или в стопке уже меньше.
 */
export function putSql(o: {
  bagId: string;
  heroId: string;
  stackKey: string;
  qty: number;
  op: string;
  account: string;
}): string {
  const [id, key, op, hero] = [sqlStr(o.bagId), sqlStr(o.stackKey), sqlStr(o.op), sqlStr(o.heroId)];
  const qty = num(exactQty(o.qty));
  const left = `GREATEST(0, ROUND(h.count - ${qty}, 9))`;
  const taken = originTakenSql(originCols("s."), originCols("h."));
  const grow = ORIGINS.map((k) => `${k}_count = it.${k}_count + EXCLUDED.${k}_count`).join(", ");
  return `${putLocksSql(o.heroId, o.bagId)}
     WITH prior AS (
       SELECT 1 FROM yuplink.raid_loot_bag_op WHERE op = ${op}
     ),
     bag AS (
       SELECT b.id FROM yuplink.raid_loot_bag b
        WHERE b.id = ${id} AND b.buried_at IS NULL AND NOT EXISTS (SELECT 1 FROM prior)
          AND EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item x
                       WHERE x.bag_id = b.id AND ${livePortion("x")})
     ),
     src AS (
       SELECT h.id, h.kind, h.ref_id, h.name, h.image,
              h.count, h.mob_count, h.mine_count, h.field_count, h.loot_count
         FROM yuplink.raid_hero_backpack h
        WHERE h.hero_id = ${hero} AND h.stack_key = ${key} AND h.count - ${qty} > -${NOISE}
          AND EXISTS (SELECT 1 FROM bag)
          FOR UPDATE
     ),
     upd AS (
       UPDATE yuplink.raid_hero_backpack h
          SET count = ${left}, ${originSetSql(originTakeSql(originCols("h."), left))},
              updated_at = now()
         FROM src s
        WHERE h.id = s.id
       RETURNING s.kind, s.ref_id, s.name, s.image,
                 ${ORIGINS.map((k) => `${taken[k]} AS ${k}`).join(", ")}
     ),
     ins AS (
       INSERT INTO yuplink.raid_loot_bag_item AS it (${ITEM_COLS})
       SELECT ${id}, ${key}, ${PORTION_TTL}, u.kind, u.ref_id, NULL, u.name, u.image, ${qty},
              u.mob, u.mine, u.field, u.loot
         FROM upd u
       ON CONFLICT (bag_id, stack_key, expires_at) DO UPDATE
          SET count = it.count + EXCLUDED.count, ${grow}
       RETURNING 1
     ),
     mark AS (
       INSERT INTO yuplink.raid_loot_bag_op
          (op, bag_id, account_id, hero_id, kind, stack_key, qty, mob, mine, field, loot, state)
       SELECT ${op}, ${id}, ${sqlStr(o.account)}, ${hero}, 'put', ${key}, ${qty},
              u.mob, u.mine, u.field, u.loot, 'done'
         FROM upd u
       RETURNING 1
     ),
     touch AS (
       UPDATE yuplink.raid_loot_bag SET updated_at = now()
        WHERE id = ${id} AND EXISTS (SELECT 1 FROM upd)
       RETURNING 1
     )
     SELECT count(*) AS n FROM upd;
     DELETE FROM yuplink.raid_hero_backpack
      WHERE hero_id = ${hero} AND stack_key = ${key} AND count <= 0 AND updated_at = now();
     ${putRowSql(op)}`;
}
