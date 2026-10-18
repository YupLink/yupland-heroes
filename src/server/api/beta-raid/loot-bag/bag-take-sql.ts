// SQL «снять стопку» из мешочка (bag-take.ts): порции одного вида — сначала
// те, что сгорят раньше. Снятое пишется в ключ нажатия вместе с порциями, из
// которых взято (parts): откат (bag-back-sql) вернёт штуки ровно туда, с их
// сроками и метками. Общие правила SQL мешочков — шапка bag-sql.ts.
import { sqlStr } from "@/server/api/raid-shared";
import {
  ORIGINS,
  originCols,
  originSetSql,
  originTakeSql,
  originTakenSql,
  type OriginQty,
} from "@/server/api/beta-raid/stack-origin";
import { DUST, bagLockSql, livePortion, num } from "@/server/api/beta-raid/loot-bag/bag-sql";

/** Ответ снятия: прежний ключ (повтор) и сколько снято с какими метками. */
export type TakeRow = {
  prior: "taken" | "done" | "undone" | null;
  qty: number | string | null;
} & Partial<Record<keyof OriginQty, number | string | null>>;

/**
 * Снять стопку из мешочка под локом: сколько просили, но не больше, чем лежит
 * в живых порциях (двое разом — второму остаток), от ранней порции к поздней.
 * Остаток меньше пыли уходит со стеком, если влезает (cap — место в рюкзаке),
 * иначе остаётся. Закопанный, сгоревшее и уже взятое этим ключом — ничего.
 * Метки каждой порции уходят по правилу траты (безымянное первым,
 * stack-origin). Пустая порция остаётся строкой с count 0 — откату есть куда
 * вернуть; уберёт её сборщик, когда снятий в полёте у мешочка не будет.
 */
export function takeSql(o: {
  bagId: string;
  stackKey: string;
  qty: number;
  /** Место в рюкзаке под эту стопку (≥ qty): потолок для пыли. */
  cap: number;
  op: string;
  account: string;
  heroId: string;
}): string {
  const [id, key, op] = [sqlStr(o.bagId), sqlStr(o.stackKey), sqlStr(o.op)];
  const [qty, cap] = [num(o.qty), num(Math.max(o.qty, o.cap))];
  const left = "i.count - s.part";
  const taken = originTakenSql(originCols("s."), originCols("i."));
  const sums = ORIGINS.map((k) => `sum(${k}) AS ${k}`).join(", ");
  const json = ORIGINS.map((k) => `'${k}', ${k}`).join(", ");
  return `${bagLockSql(o.bagId)}
     WITH prior AS (
       SELECT state, qty, mob, mine, field, loot FROM yuplink.raid_loot_bag_op WHERE op = ${op}
     ),
     live AS (
       SELECT i.expires_at, i.count, i.mob_count, i.mine_count, i.field_count, i.loot_count,
              COALESCE(sum(i.count) OVER (ORDER BY i.expires_at
                         ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prev
         FROM yuplink.raid_loot_bag_item i
         JOIN yuplink.raid_loot_bag b ON b.id = i.bag_id
        WHERE i.bag_id = ${id} AND i.stack_key = ${key} AND ${livePortion("i")}
          AND b.buried_at IS NULL AND NOT EXISTS (SELECT 1 FROM prior)
     ),
     want AS (
       SELECT CASE WHEN sum(count) - ${qty} < ${DUST} THEN LEAST(sum(count), ${cap})
                   ELSE ${qty} END AS mv
         FROM live HAVING count(*) > 0
     ),
     src AS (
       SELECT l.*, LEAST(l.count, w.mv - l.prev) AS part
         FROM live l, want w WHERE w.mv > l.prev
     ),
     upd AS (
       UPDATE yuplink.raid_loot_bag_item i
          SET count = ${left}, ${originSetSql(originTakeSql(originCols("i."), left))}
         FROM src s
        WHERE i.bag_id = ${id} AND i.stack_key = ${key} AND i.expires_at = s.expires_at
       RETURNING i.expires_at AS e, s.part AS n,
                 ${ORIGINS.map((k) => `${taken[k]} AS ${k}`).join(", ")}
     ),
     tot AS (
       SELECT sum(n) AS qty, ${sums},
              jsonb_agg(jsonb_build_object('e', e, 'n', n, ${json}) ORDER BY e) AS parts
         FROM upd HAVING count(*) > 0
     ),
     mark AS (
       INSERT INTO yuplink.raid_loot_bag_op
          (op, bag_id, account_id, hero_id, kind, stack_key, qty, mob, mine, field, loot, parts, state)
       SELECT ${op}, ${id}, ${sqlStr(o.account)}, ${sqlStr(o.heroId)}, 'take', ${key}, t.qty,
              t.mob, t.mine, t.field, t.loot, t.parts, 'taken'
         FROM tot t
       RETURNING qty, mob, mine, field, loot
     ),
     touch AS (
       UPDATE yuplink.raid_loot_bag SET updated_at = now()
        WHERE id = ${id} AND EXISTS (SELECT 1 FROM upd)
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT state FROM prior) AS prior,
              ${["qty", ...ORIGINS]
                .map((c) => `COALESCE((SELECT ${c} FROM mark), (SELECT ${c} FROM prior)) AS ${c}`)
                .join(",\n              ")}
     ) _t;`;
}
