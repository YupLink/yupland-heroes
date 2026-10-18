// SQL развязки снятия: «забор» выдачи в рюкзак, откат снятого в мешочек,
// закрытие ключа и зависшие снятия для сборщика. Снять — bag-take-sql.ts,
// здесь — чем кончилось снятое.
//
// Без обёртки wrapJson: изменяющие CTE — верхний уровень, JSON ответа собираем
// сами. Комментарии внутри SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { originCols, originGrowSql, originSetSql } from "@/server/api/beta-raid/stack-origin";
import { bagLockSql } from "@/server/api/beta-raid/loot-bag/bag-sql";

/** Лок рюкзака героя — тот же, что у выдачи (market-backpack-write). */
const heroLockSql = (heroId: string): string =>
  `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`bp:${heroId}`)})) AS l;`;

/** Выдача в рюкзак по снятому прошла: ключ закрыт. Повтор безвреден. */
export const takeDoneSql = (op: string): string =>
  `UPDATE yuplink.raid_loot_bag_op SET state = 'done' WHERE op = ${sqlStr(op)} AND state = 'taken';`;

/**
 * «Забор» выдачи в рюкзак с ключом nonce (market-backpack-write кладёт ключ
 * 'bp:'||nonce тем же оператором, что и штуки). Под локом героя: выдача в
 * полёте успевает закончиться. Ключа нет — кладём его сами вместе с меткой
 * 'bpx:' — выдача не прошла и уже не пройдёт (опоздавшая попытка увидит ключ
 * и ничего не положит). Ключ есть без метки — выдача прошла. Повтор моста
 * узнаёт свою метку.
 */
function fenceCte(nonce: string): string {
  const [bp, bpx] = [sqlStr(`bp:${nonce}`), sqlStr(`bpx:${nonce}`)];
  return `fence AS (
       INSERT INTO yuplink.raid_backpack_op (op) VALUES (${bp})
       ON CONFLICT (op) DO NOTHING
       RETURNING 1
     ),
     fx AS (
       INSERT INTO yuplink.raid_backpack_op (op) SELECT ${bpx} FROM fence
       ON CONFLICT (op) DO NOTHING
       RETURNING 1
     ),
     blocked AS (
       SELECT (EXISTS (SELECT 1 FROM fence)
               OR EXISTS (SELECT 1 FROM yuplink.raid_backpack_op WHERE op = ${bpx})) AS yes
     )`;
}

/** Только «забор»: true — выдачи не было и уже не будет. */
export function fenceSql(heroId: string, nonce: string): string {
  return `${heroLockSql(heroId)}
     WITH ${fenceCte(nonce)}
     SELECT row_to_json(_t.*) AS _row FROM (SELECT (SELECT yes FROM blocked) AS blocked) _t;`;
}

/**
 * Развязка снятия, когда выдача в рюкзак не прошла или о ней ничего не
 * известно (рюкзак не принял, сбой базы, зависший ключ — сборщик): «забор»
 * выдачи, и если её не было — снятое назад в ТЕ ЖЕ порции этого мешочка (parts:
 * срок, штуки, метки), ключ → undone (второй откат ничего не вернёт); была —
 * ключ → done. Порции на месте: сборщик и «закопать» не трогают мешочек, пока
 * у него есть снятие в полёте.
 */
export function backSql(o: { bagId: string; heroId: string; op: string; nonce: string }): string {
  const [id, op] = [sqlStr(o.bagId), sqlStr(o.op)];
  const add = { mob: "p.mob", mine: "p.mine", field: "p.field", loot: "p.loot" };
  const grown = originGrowSql(originCols("i."), add, "i.count + p.n");
  return `${heroLockSql(o.heroId)}
     ${bagLockSql(o.bagId)}
     WITH ${fenceCte(o.nonce)},
     flip AS (
       UPDATE yuplink.raid_loot_bag_op o SET state = 'undone'
        WHERE o.op = ${op} AND o.bag_id = ${id} AND o.state = 'taken' AND (SELECT yes FROM blocked)
       RETURNING o.stack_key, o.parts
     ),
     part AS (
       SELECT f.stack_key, p.e, p.n, p.mob, p.mine, p.field, p.loot
         FROM flip f,
              jsonb_to_recordset(COALESCE(f.parts, '[]'::jsonb))
                AS p(e timestamptz, n numeric, mob numeric, mine numeric, field numeric, loot numeric)
     ),
     back AS (
       UPDATE yuplink.raid_loot_bag_item i
          SET count = i.count + p.n, ${originSetSql(grown)}
         FROM part p
        WHERE i.bag_id = ${id} AND i.stack_key = p.stack_key AND i.expires_at = p.e
       RETURNING 1
     ),
     done AS (
       UPDATE yuplink.raid_loot_bag_op o SET state = 'done'
        WHERE o.op = ${op} AND o.bag_id = ${id} AND o.state = 'taken'
          AND NOT (SELECT yes FROM blocked)
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT yes FROM blocked) AS blocked, EXISTS (SELECT 1 FROM flip) AS undone,
              EXISTS (SELECT 1 FROM back) AS back, EXISTS (SELECT 1 FROM done) AS done
     ) _t;`;
}

/** Зависшие снятия (ни выдачи, ни отката за 2 минуты) — сборщику на развязку. */
export const staleTakesSql = (): string =>
  `SELECT o.op, o.bag_id AS "bagId", o.hero_id AS "heroId", b.q, b.r, b.map_id AS "mapId"
     FROM yuplink.raid_loot_bag_op o
     LEFT JOIN yuplink.raid_loot_bag b ON b.id = o.bag_id
    WHERE o.state = 'taken' AND o.kind = 'take' AND o.hero_id IS NOT NULL
      AND o.at < now() - interval '2 minutes'
    ORDER BY o.at LIMIT 50`;
