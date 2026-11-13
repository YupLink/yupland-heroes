// Шаманы в хижине (yuplink.castle_shaman, миграция shaman-01): сколько есть и
// как забрать одного в рюкзак с ключом операции.
//
// Обряд погоды (weather-04) забирает шамана сам, функцией базы
// castle_shaman_take в своей транзакции. «Взять в рюкзак» — два шага (забрать,
// положить), и мост повторяет запросы вслепую, поэтому у каждого шага свой ключ
// в raid_backpack_op: повтор забора не спишет второго шамана, а возврат в хижину
// идёт только если выдачу в рюкзак заперли мы (как backpack-take-once.ts).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";

/** Сколько шаманов сидит в хижине аккаунта (нет строки — 0). */
export async function shamanCount(accountId: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT COALESCE((SELECT s.count FROM yuplink.castle_shaman s
                       WHERE s.account_id = ${sqlStr(accountId)}), 0)::int AS n;`,
    { wrapJson: true },
  )) as Array<{ n: number | string }> | null;
  return Math.max(0, Number(rows?.[0]?.n) || 0);
}

/** Замок аккаунта — тот же, что у castle_shaman_buy: покупка и забор по очереди. */
const lockSql = (account: string) =>
  `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`shaman:${account}`)})) AS l;`;

/**
 * Забрать одного шамана под ключом op. took — забран (в том числе прошлой
 * попыткой, чей ответ потерялся); remain — сколько осталось. Ключ ложится только
 * вместе со списанием: «шаманов нет» ключ не занимает.
 */
export function takeShamanSql(account: string, op: string): string {
  const acc = sqlStr(account);
  const key = sqlStr(op);
  return `${lockSql(account)}
     WITH prior AS (
       SELECT EXISTS (SELECT 1 FROM yuplink.raid_backpack_op WHERE op = ${key}) AS was
     ),
     took AS (
       SELECT CASE WHEN (SELECT was FROM prior) THEN false
                   ELSE yuplink.castle_shaman_take(${acc}) END AS ok
     ),
     claim AS (
       INSERT INTO yuplink.raid_backpack_op (op) SELECT ${key} FROM took WHERE took.ok
       ON CONFLICT (op) DO NOTHING
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT ((SELECT was FROM prior) OR (SELECT ok FROM took)) AS took,
              COALESCE((SELECT s.count FROM yuplink.castle_shaman s
                         WHERE s.account_id = ${acc}), 0)
                - CASE WHEN (SELECT ok FROM took) THEN 1 ELSE 0 END AS remain
     ) _t;`;
}

/**
 * Вернуть шамана в хижину, если выдача в рюкзак (ключ depositOp) не прошла:
 * запираем её ключ сами — заперли мы, значит выдачи не было и уже не будет, и
 * шаман возвращается. Ключ уже стоял — шаман в рюкзаке, возвращать нечего.
 * Свой ключ у возврата (refundOp): повтор моста после коммита читается как
 * «уже вернули», а не как «выдача прошла».
 */
export function refundShamanSql(account: string, depositOp: string, refundOp: string): string {
  const acc = sqlStr(account);
  const again = sqlStr(refundOp);
  return `${lockSql(account)}
     WITH prior AS (
       SELECT EXISTS (SELECT 1 FROM yuplink.raid_backpack_op WHERE op = ${again}) AS was
     ),
     blk AS (
       INSERT INTO yuplink.raid_backpack_op (op)
       SELECT ${sqlStr(depositOp)} FROM prior WHERE NOT prior.was
       ON CONFLICT (op) DO NOTHING
       RETURNING 1
     ),
     mark AS (
       INSERT INTO yuplink.raid_backpack_op (op) SELECT ${again} FROM blk
       ON CONFLICT (op) DO NOTHING
       RETURNING 1
     ),
     back AS (
       INSERT INTO yuplink.castle_shaman AS s (account_id, count)
       SELECT ${acc}, 1 FROM blk
       ON CONFLICT (account_id) DO UPDATE SET count = s.count + 1, updated_at = now()
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT ((SELECT was FROM prior) OR EXISTS (SELECT 1 FROM blk)) AS refunded
     ) _t;`;
}
