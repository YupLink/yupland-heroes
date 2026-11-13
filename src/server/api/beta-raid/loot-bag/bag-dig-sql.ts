// SQL «закопать / выкопать»: переворот мешочка в бугорок и обратно одним
// оператором под локом мешочка — тем же, что держит «забрать» и «положить».
// Из пары «закопать и забрать разом» проходит одно: забор не снимает с
// закопанного, а закопать можно только мешочек, в котором ещё что-то живо.
//
// Закопать и выкопать СРОКОВ НЕ МЕНЯЮТ (владелец, 29.09: «время при закапывании
// не меняется — никаких + часов нельзя»). У каждой порции остаётся её 24 ч с
// момента, как она легла в мешочек; бугорок исчезает, когда сгорит последняя
// (≤ 24 ч после закапывания само собой). Сгоревший бугорок не живой — его не
// выкопать. Пока у мешочка есть снятие в полёте (штуки сняты, выдача в рюкзак
// не отчиталась), закопать нельзя: забор должен отчитаться по открытому.
//
// Ключ нажатия пишется в raid_loot_bag_op в ОБОИХ исходах: 'done' — перевернули,
// 'failed' — нет. Повтор того же нажатия отвечает прежним исходом и второй раз
// ничего не делает — в том числе не закопает «даром» позже, когда износ лопаты
// за это нажатие уже откатили.
//
// Кучка из пустой ямки (§8.24 п. 6б, hole-bury) — бугорок с порцией-меткой
// DIG_EMPTY_KEY: выкопали — тот же оператор снимает метку (мешочек пуст, его
// никто не видит), ответ empty — «ничего не нашлось», на клетке снова ямка.
import { sqlStr } from "@/server/api/raid-shared";
import { DIG_EMPTY_KEY } from "@/lib/digHole";
import { bagLockSql, livePortion } from "@/server/api/beta-raid/loot-bag/bag-sql";

export type DigRow = {
  /** Исход этого ключа: 'done' / 'failed' (и прежний — на повторе). */
  state: "done" | "failed" | null;
  /** Каким был мешочек до оператора: жив ли (есть живая порция) и закопан ли. */
  alive: boolean | null;
  buried: boolean | null;
  /** У мешочка снятие в полёте — закопать нельзя, повторить через миг. */
  busy: boolean | null;
  /** Исход записан этим оператором (не повтор того же нажатия). */
  mine?: boolean | null;
  /** Выкопали кучку из пустой ямки: внутри ничего. */
  empty?: boolean | null;
};

/**
 * «Забор» переворота, когда ответ digSql не пришёл: под тем же локом — ключ
 * нажатия с исходом 'failed', если его ещё нет. Опоздавшая попытка digSql
 * увидит ключ и ничего не перевернёт — износ лопаты можно вернуть. Ответ —
 * исход ключа: 'done' — переворот всё-таки прошёл.
 */
export function digFenceSql(o: {
  bagId: string;
  op: string;
  account: string;
  bury: boolean;
}): string {
  const op = sqlStr(o.op);
  return `${bagLockSql(o.bagId)}
     INSERT INTO yuplink.raid_loot_bag_op (op, bag_id, account_id, kind, state)
     VALUES (${op}, ${sqlStr(o.bagId)}, ${sqlStr(o.account)}, ${sqlStr(o.bury ? "bury" : "dig")}, 'failed')
     ON CONFLICT (op) DO NOTHING;
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT state FROM yuplink.raid_loot_bag_op WHERE op = ${op}
     ) _t;`;
}

/**
 * bury — закопать (мешочек → бугорок), иначе выкопать (бугорок → мешочек).
 * nonce — вызова ручки: mine («переворот мой, плата не лишняя») верно и на
 * слепом повторе моста (тот же текст), а у параллельного дубля — нет.
 */
export function digSql(o: {
  bagId: string;
  op: string;
  account: string;
  bury: boolean;
  nonce: string;
}): string {
  const [id, op, acc, nonce] = [sqlStr(o.bagId), sqlStr(o.op), sqlStr(o.account), sqlStr(o.nonce)];
  const set = o.bury
    ? `buried_at = now(), buried_by = ${acc}`
    : "buried_at = NULL, buried_by = NULL";
  return `${bagLockSql(o.bagId)}
     WITH prior AS (
       SELECT state, parts->>'nonce' AS nonce FROM yuplink.raid_loot_bag_op WHERE op = ${op}
     ),
     cur AS (
       SELECT b.buried_at IS NOT NULL AS buried,
              EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item x
                       WHERE x.bag_id = b.id AND ${livePortion("x")}) AS alive,
              EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_op t
                       WHERE t.bag_id = b.id AND t.state = 'taken') AS busy
         FROM yuplink.raid_loot_bag b WHERE b.id = ${id}
     ),
     ok AS (
       SELECT 1 FROM cur
        WHERE NOT EXISTS (SELECT 1 FROM prior) AND cur.alive
          AND cur.buried = ${o.bury ? "false" : "true"} ${o.bury ? "AND NOT cur.busy" : ""}
     ),
     upd AS (
       UPDATE yuplink.raid_loot_bag b SET ${set}, updated_at = now()
        WHERE b.id = ${id} AND EXISTS (SELECT 1 FROM ok)
       RETURNING 1
     ),
     empty AS (
       UPDATE yuplink.raid_loot_bag_item x SET count = 0
        WHERE x.bag_id = ${id} AND x.stack_key = ${sqlStr(DIG_EMPTY_KEY)} AND x.count > 0
          AND ${o.bury ? "false" : "EXISTS (SELECT 1 FROM upd)"}
       RETURNING 1
     ),
     mark AS (
       INSERT INTO yuplink.raid_loot_bag_op (op, bag_id, account_id, kind, state, parts)
       SELECT ${op}, ${id}, ${acc}, ${sqlStr(o.bury ? "bury" : "dig")},
              CASE WHEN EXISTS (SELECT 1 FROM upd) THEN 'done' ELSE 'failed' END,
              jsonb_build_object('nonce', ${nonce})
        WHERE NOT EXISTS (SELECT 1 FROM prior)
       RETURNING state
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT COALESCE((SELECT state FROM prior), (SELECT state FROM mark)) AS state,
              (SELECT alive FROM cur) AS alive, (SELECT buried FROM cur) AS buried,
              (SELECT busy FROM cur) AS busy,
              (EXISTS (SELECT 1 FROM mark)
               OR COALESCE((SELECT nonce FROM prior) = ${nonce}, false)) AS mine,
              EXISTS (SELECT 1 FROM empty) AS empty
     ) _t;`;
}
