// SQL «забрать ресурс счёта» из мешочка (разборка шахты, ПРАВИЛА §8.70):
// снять из живых порций вида (от той, что сгорит раньше) и начислить на счёт
// (res_move, вид 'bag_take') — одним оператором под локом мешочка. Рюкзака нет,
// выдачи нет — откатывать нечего: снятие и начисление проходят вместе или не
// проходят вовсе. Ключ нажатия в raid_loot_bag_op ложится сразу 'done' (с
// порциями parts — для журнала), повтор того же нажатия второй раз не снимает
// и не начисляет. Общие правила SQL мешочков — шапка bag-sql.ts.
//
// Ресурсы счёта — до 0,0001 (res_ledger numeric(20,4)): сколько просили,
// усекается до четырёх знаков, не больше, чем лежит.
import { sqlStr } from "@/server/api/raid-shared";
import type { MineV2Resource } from "@/lib/mineV2";
import { bagLockSql, livePortion, num } from "@/server/api/beta-raid/loot-bag/bag-sql";

/** Вид журнала ресурсов: не доход шахты/моба/награды — турниры его не считают. */
export const BAG_TAKE_RES_KIND = "bag_take";

/** Ответ: прежний ключ (повтор) и сколько начислено этим ключом. */
export type TakeResRow = { prior: string | null; qty: number | string | null };

export function takeResSql(o: {
  bagId: string;
  stackKey: string;
  res: MineV2Resource;
  qty: number;
  op: string;
  account: string;
}): string {
  const [id, key, op, acc] = [sqlStr(o.bagId), sqlStr(o.stackKey), sqlStr(o.op), sqlStr(o.account)];
  const qty = `trunc(${num(o.qty)}::numeric, 4)`;
  return `${bagLockSql(o.bagId)}
     WITH prior AS (
       SELECT state, qty FROM yuplink.raid_loot_bag_op WHERE op = ${op}
     ),
     live AS (
       SELECT i.expires_at, i.count,
              COALESCE(sum(i.count) OVER (ORDER BY i.expires_at
                         ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prev
         FROM yuplink.raid_loot_bag_item i
         JOIN yuplink.raid_loot_bag b ON b.id = i.bag_id
        WHERE i.bag_id = ${id} AND i.stack_key = ${key} AND ${livePortion("i")}
          AND b.buried_at IS NULL AND NOT EXISTS (SELECT 1 FROM prior)
     ),
     want AS (
       SELECT LEAST(sum(count), ${qty}) AS mv FROM live HAVING count(*) > 0
     ),
     src AS (
       SELECT l.expires_at, LEAST(l.count, w.mv - l.prev) AS part
         FROM live l, want w WHERE w.mv > l.prev
     ),
     upd AS (
       UPDATE yuplink.raid_loot_bag_item i SET count = i.count - s.part
         FROM src s
        WHERE i.bag_id = ${id} AND i.stack_key = ${key} AND i.expires_at = s.expires_at
       RETURNING i.expires_at AS e, s.part AS n
     ),
     tot AS (
       SELECT sum(n) AS qty, jsonb_agg(jsonb_build_object('e', e, 'n', n) ORDER BY e) AS parts
         FROM upd HAVING count(*) > 0
     ),
     /* Начисление — только вместе со снятием (res_move сам держит лок счёта). */
     credit AS (
       SELECT m.applied FROM tot t
        CROSS JOIN LATERAL yuplink.res_move(${acc}, ${sqlStr(o.res)}, t.qty,
                                            ${sqlStr(BAG_TAKE_RES_KIND)}, ${op}) m
     ),
     mark AS (
       INSERT INTO yuplink.raid_loot_bag_op
          (op, bag_id, account_id, kind, stack_key, qty, parts, state)
       SELECT ${op}, ${id}, ${acc}, 'take', ${key}, t.qty, t.parts, 'done'
         FROM tot t CROSS JOIN credit
       RETURNING qty
     ),
     touch AS (
       UPDATE yuplink.raid_loot_bag SET updated_at = now()
        WHERE id = ${id} AND EXISTS (SELECT 1 FROM upd)
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT state FROM prior) AS prior,
              COALESCE((SELECT qty FROM mark), (SELECT qty FROM prior)) AS qty
     ) _t;`;
}

/** Исход ключа нажатия свежим чтением (ответ снятия потерялся): забрано ли и сколько. */
export const takeResOpSql = (op: string): string =>
  `SELECT state, qty FROM yuplink.raid_loot_bag_op WHERE op = ${sqlStr(op)};`;
