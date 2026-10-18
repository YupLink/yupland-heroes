// SQL «Выбросить» из рюкзака в мешочек на клетке героя (владелец, 29.09.2026,
// дополнение №4; ПРАВИЛА §8.21) — одним оператором: снять со стопки рюкзака и
// положить порцию (24 часа, метки едут с ней) в живой незакопанный мешочек
// этой клетки или в новый. Либо переехало всё, либо ничего.
//
// Локи — рюкзака героя, клетки (`lootdrop:` — два выброса на одну клетку идут
// по очереди: второй видит мешочек первого и доливает в него, а не роняет
// свой) и мешочка-кандидата (или нового — id от ключа нажатия), каждый
// отдельным оператором до WITH (§8.15). Мешочек выбирается тем же оператором:
// кандидат, если жив, иначе самый свежий живой незакопанный на клетке, иначе
// новый. Остаток после выброса — ROUND(count − n, 9) (backpack-discard.ts): не
// больше нуля — выброс стопки целиком.
//
// Изношенная штука инструмента в мешочек не попадает — порции износа не
// хранят, иначе «починка» через мешочек: при выбросе всего она уничтожается,
// в мешочек уходят целые штуки; частичный выброс, после которого от стопки с
// износом осталось бы меньше штуки, — отказ (изношенная остаётся в рюкзаке).
//
// Без обёртки wrapJson: изменяющие CTE — верхний уровень. Комментарии внутри
// SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { exactQty } from "@/lib/warehouseCells";
import { DISCARD_SCALE } from "@/server/api/beta-raid/backpack-discard";
import {
  ORIGINS,
  originCols,
  originSetSql,
  originTakeSql,
  originTakenSql,
} from "@/server/api/beta-raid/stack-origin";
import { ITEM_COLS, PORTION_TTL, livePortion, num } from "@/server/api/beta-raid/loot-bag/bag-sql";

/** Живой незакопанный мешочек клетки (алиас b) — кандидат «долить». */
const aliveAt = (m: string, q: number, r: number): string =>
  `b.map_id = ${sqlStr(m)} AND b.q = ${q} AND b.r = ${r} AND b.buried_at IS NULL
   AND EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item x WHERE x.bag_id = b.id AND ${livePortion("x")})`;

/** Кандидат: самый свежий живой незакопанный мешочек на клетке. */
export function bagAtCellSql(mapId: string, q: number, r: number): string {
  return `SELECT b.id FROM yuplink.raid_loot_bag b
           WHERE ${aliveAt(mapId, Math.floor(q), Math.floor(r))}
           ORDER BY b.created_at DESC LIMIT 1`;
}

/** id нового мешочка — выражением базы (тот же, что у dropSql: 'lb_' || md5(ключа)). */
export const newBagIdSql = (key: string): string => `('lb_' || md5(${sqlStr(key)}))`;

/** Ответ: повтор (итог прошлого), сколько ушло из рюкзака и в мешочек, куда, остаток. */
export type DiscardRow = {
  was: boolean;
  prior_qty: number | string | null;
  prior_bag: string | null;
  here: boolean;
  worn: boolean | null;
  put: number | string | null;
  gone: number | string | null;
  bag_id: string | null;
  fresh_bag: boolean;
  rest: number | string | null;
  kind: string | null;
  ref_id: string | null;
  name: string | null;
};

/**
 * Выбросить qty штук стопки (null — всю стопку) в мешочек клетки героя.
 * bagId — кандидат клетки (null — нет), key — ключ нового мешочка.
 */
export function discardToBagSql(o: {
  heroId: string;
  account: string;
  stackKey: string;
  qty: number | null;
  mapId: string;
  q: number;
  r: number;
  bagId: string | null;
  key: string;
  op: string;
}): string {
  const [hero, key, op, acc] = [sqlStr(o.heroId), sqlStr(o.stackKey), sqlStr(o.op), sqlStr(o.account)];
  const [q, r] = [Math.floor(o.q), Math.floor(o.r)];
  const n = o.qty == null ? "h.count" : num(exactQty(o.qty));
  const lockId = o.bagId ? sqlStr(o.bagId) : newBagIdSql(o.key);
  const cand = o.bagId ? sqlStr(o.bagId) : "NULL";
  const taken = originTakenSql(originCols("c."), originCols("h."));
  const whole = originTakeSql(originCols("c."), "c.put");
  const marks = (m: Record<(typeof ORIGINS)[number], string>) =>
    ORIGINS.map((k) => `${m[k]} AS ${k}`).join(", ");
  const grow = ORIGINS.map((k) => `${k}_count = it.${k}_count + EXCLUDED.${k}_count`).join(", ");
  return `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`bp:${o.heroId}`)})) AS l;
     SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`lootdrop:${o.mapId}:${q}:${r}`)})) AS l;
     SELECT pg_advisory_xact_lock(hashtext('lootbag:' || ${lockId})) AS l;
     WITH prior AS (
       SELECT o.qty, o.bag_id FROM yuplink.raid_loot_bag_op o WHERE o.op = ${op}
     ),
     ex AS (
       SELECT b.id FROM yuplink.raid_loot_bag b WHERE ${aliveAt(o.mapId, q, r)}
        ORDER BY (b.id = ${cand}) DESC NULLS LAST, b.created_at DESC
        LIMIT 1
     ),
     /* FOR UPDATE: рюкзак тратят и мимо лока (оплата) — запертая строка до
        конца транзакции не изменится, и снятое равно положенному. */
     src AS (
       SELECT h.id, h.kind, h.ref_id, h.item_id, h.name, h.image, h.count, h.wear,
              h.mob_count, h.mine_count, h.field_count, h.loot_count,
              ROUND(h.count - ${n}, ${DISCARD_SCALE}) AS rest
         FROM yuplink.raid_hero_backpack h
        WHERE h.hero_id = ${hero} AND h.stack_key = ${key} AND h.count > 0
          AND NOT EXISTS (SELECT 1 FROM prior)
          FOR UPDATE
     ),
     /* part — после выброса что-то остаётся; worn — от стопки с износом
        осталась бы доля штуки (изношенная ушла бы) — отказ; put — в мешочек:
        частично — выброшенное, целиком — целые штуки (изношенная сгорает). */
     calc AS (
       SELECT s.*, (s.rest > 0) AS part,
              (s.rest > 0 AND COALESCE(s.wear, 0) > 0 AND s.rest < 1) AS worn,
              CASE WHEN s.rest > 0 THEN s.count - s.rest
                   ELSE GREATEST(0, s.count - CASE WHEN COALESCE(s.wear, 0) > 0 THEN 1 ELSE 0 END)
              END AS put
         FROM src s
     ),
     upd AS (
       UPDATE yuplink.raid_hero_backpack h
          SET count = c.rest, ${originSetSql(originTakeSql(originCols("h."), "c.rest"))},
              updated_at = now()
         FROM calc c
        WHERE h.id = c.id AND c.part AND NOT c.worn
       RETURNING c.kind, c.ref_id, c.item_id, c.name, c.image, c.put, c.count - c.rest AS gone,
                 ${marks(taken)}
     ),
     del AS (
       DELETE FROM yuplink.raid_hero_backpack h USING calc c
        WHERE h.id = c.id AND NOT c.part
       RETURNING c.kind, c.ref_id, c.item_id, c.name, c.image, c.put, c.count AS gone,
                 ${marks(whole)}
     ),
     moved AS (SELECT * FROM upd UNION ALL SELECT * FROM del),
     fresh AS (
       INSERT INTO yuplink.raid_loot_bag
          (id, map_id, q, r, created_at, dropped_by, source, source_name, updated_at)
       SELECT ${newBagIdSql(o.key)}, ${sqlStr(o.mapId)}, ${q}, ${r}, now(), ${acc}, 'discard', m.name, now()
         FROM moved m
        WHERE m.put > 0 AND NOT EXISTS (SELECT 1 FROM ex)
       ON CONFLICT (id) DO NOTHING
       RETURNING id
     ),
     bag AS (
       SELECT id FROM ex WHERE EXISTS (SELECT 1 FROM moved m WHERE m.put > 0)
       UNION ALL SELECT id FROM fresh
     ),
     ins AS (
       INSERT INTO yuplink.raid_loot_bag_item AS it (${ITEM_COLS})
       SELECT bag.id, ${key}, ${PORTION_TTL}, m.kind, m.ref_id, m.item_id, m.name, m.image, m.put,
              m.mob, m.mine, m.field, m.loot
         FROM bag, moved m
        WHERE m.put > 0
       ON CONFLICT (bag_id, stack_key, expires_at) DO UPDATE
          SET count = it.count + EXCLUDED.count, ${grow}
       RETURNING 1
     ),
     mark AS (
       INSERT INTO yuplink.raid_loot_bag_op
          (op, bag_id, account_id, hero_id, kind, stack_key, qty, mob, mine, field, loot, state)
       SELECT ${op}, COALESCE((SELECT id FROM bag), ''), ${acc}, ${hero}, 'discard', ${key}, m.put,
              m.mob, m.mine, m.field, m.loot, 'done'
         FROM moved m
       RETURNING 1
     ),
     touch AS (
       UPDATE yuplink.raid_loot_bag SET updated_at = now()
        WHERE id IN (SELECT id FROM ex) AND EXISTS (SELECT 1 FROM ins)
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT EXISTS (SELECT 1 FROM prior) AS was,
              (SELECT qty FROM prior) AS prior_qty, (SELECT bag_id FROM prior) AS prior_bag,
              EXISTS (SELECT 1 FROM src) AS here,
              (SELECT worn FROM calc) AS worn,
              (SELECT put FROM moved) AS put, (SELECT gone FROM moved) AS gone,
              (SELECT id FROM bag) AS bag_id, EXISTS (SELECT 1 FROM fresh) AS fresh_bag,
              /* Остаток в рюкзаке: основной SELECT видит таблицу ДО записи, поэтому
                 после выброса — из calc, на повторе — сама строка. */
              COALESCE((SELECT CASE WHEN c.worn THEN c.count WHEN c.part THEN c.rest ELSE 0 END
                          FROM calc c),
                       (SELECT h.count FROM yuplink.raid_hero_backpack h
                         WHERE h.hero_id = ${hero} AND h.stack_key = ${key})) AS rest,
              (SELECT kind FROM calc) AS kind, (SELECT ref_id FROM calc) AS ref_id,
              (SELECT name FROM calc) AS name
     ) _t;`;
}
