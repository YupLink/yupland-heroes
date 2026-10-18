// Запись в сеть сундука: положить из рюкзака, снять в рюкзак, вернуть назад.
//
// Все изменения сети идут под pg_advisory_xact_lock('chest:'||аккаунт) — тем же,
// что держит грабёж: иначе вклад между «прочитал сеть» и «удалил сеть» пропал
// бы молча. Лок — ОТДЕЛЬНЫМ оператором перед основным (locksSql): в READ
// COMMITTED снимок оператора берётся до его выполнения, и лок внутри того же
// WITH не освежал бы чтение (второй вклад считал бы место без первого — 11
// ячеек из 10). Операторы одной строки — одна неявная транзакция: лок держится
// до её конца, оба пути к базе (прямой и мост) отдают ответ последнего.
// Каждая запись несёт ключ операции в raid_backpack_op: мост повторяет запрос
// вслепую до четырёх раз, и без ключа «положил 20» легло бы дважды.
//
// Без обёртки wrapJson: изменяющие CTE — верхний уровень (market-backpack-
// write.ts), JSON ответа собираем сами. Комментарии в SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { CELL_SIZE, CHEST_NET_CELLS } from "@/lib/magicChest";
import {
  collectedSql,
  originCols,
  originSetSql,
  originStoreSql,
} from "@/server/api/beta-raid/stack-origin";

/** Остаток меньше тысячной — это весь стек: хвост 0,7899999 не должен висеть ячейкой. */
const DUST = 0.001;

/** Локи отдельными операторами — следующий за ними оператор читает свежий снимок. */
export const locksSql = (...keys: string[]): string =>
  keys.map((k) => `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(k)})) AS l;`).join("\n");

/** Охранник повержен: помечен убитым или HP кончилось. */
export const deadGuardSql = (a: string): string =>
  `(${a}.killed_at IS NOT NULL OR ${a}.current_hp <= 0)`;

/** Сколько снимаем: просили n, но пыль сверх остатка — весь стек. */
const moveSql = (count: string, n: number) =>
  `CASE WHEN ${count} - ${n} < ${DUST} THEN ${count} ELSE ${n} END`;

/** Ответ вклада: повтор, переложили ли, сколько и почему нет. */
export type StoreRow = {
  was: boolean;
  /** Сундук, через который кладут, пускает (via): стоит, не закопан, у чужого — без охраны. */
  here?: boolean | null;
  moved: boolean;
  mv: number | string | null;
  /** Собрано в стеке (любая метка) — больше этого в сеть не ляжет. */
  got: number | string | null;
  fits: boolean | null;
  /** Вся стопка с изношенной штукой инструмента — такую не кладём. */
  worn?: boolean | null;
  kind: string | null;
  ref_id: string | null;
  name: string | null;
};

/** Клетка сундука, через который кладут в сеть или берут из неё; own — это делает хозяин. */
export type ChestVia = { mapId: string; q: number; r: number; own?: boolean };

/**
 * «Через этот сундук можно» — фрагмент «AND …» для WHERE того же оператора,
 * что пишет, под локом сети хозяина acc (SQL-литерал): сундук хозяина на
 * клетке стоит и не закопан, а у ЧУЖОГО ещё и живой охраны на клетке нет
 * (хозяину своя охрана не помеха). via нет — пусто.
 */
function viaSql(acc: string, via?: ChestVia): string {
  if (!via) return "";
  const cell = (a: string) =>
    `${a}.map_id = ${sqlStr(via.mapId)} AND ${a}.q = ${via.q} AND ${a}.r = ${via.r}`;
  const stands = `AND EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc
                    WHERE ${cell("mc")} AND mc.owner_account = ${acc} AND mc.buried_at IS NULL)`;
  if (via.own) return stands;
  return `${stands}
          AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_guard g
                           WHERE ${cell("g")} AND NOT ${deadGuardSql("g")})`;
}

/**
 * Положить qty штук стека из рюкзака героя в сеть хозяина account. Кладётся
 * только собранное — всё, кроме купленного (29.09.2026): штуки с любой меткой
 * (stack-origin), безымянное остаётся в стеке. Сеть примет: новые ячейки — в
 * пределах десяти, долив в свою неполную — всегда (GREATEST(10, занято)).
 * Пустой стек рюкзака удаляется. via — сундук, через который кладут (30.09:
 * кладёт и чужой): тем же оператором под локом сети — стоит, не закопан, у
 * чужого без живой охраны; нет — не пишется ничего (here = false).
 */
export function storeSql(o: {
  account: string;
  heroId: string;
  stackKey: string;
  qty: number;
  op: string;
  via?: ChestVia;
}): string {
  const acc = sqlStr(o.account);
  const hero = sqlStr(o.heroId);
  const key = sqlStr(o.stackKey);
  const op = sqlStr(o.op);
  const at = `b.hero_id = ${hero} AND b.stack_key = ${key}`;
  const b = originCols("b.");
  const got = collectedSql(b);
  return `${locksSql(`chest:${o.account}`, `bp:${o.heroId}`)}
     WITH prior AS (
       SELECT EXISTS (SELECT 1 FROM yuplink.raid_backpack_op WHERE op = ${op}) AS was
     ),
     here AS (SELECT 1 WHERE true ${viaSql(acc, o.via)}),
     /* FOR UPDATE: рюкзак списывают и без нашего лока (оплата, выброс), а
        запертая строка до конца транзакции уже не изменится — ключ операции
        ниже значит «переложено», а не «собирались переложить». */
     /* Пыль сверх просьбы уходит со стеком, только если она собрана; просьба выше
        собранного меньше чем на пыль (округление окна) — ровно собранное. */
     src AS (
       SELECT b.kind, b.ref_id, b.item_id, b.name, b.image,
              ${got} AS got, CASE WHEN ${got} >= b.count THEN ${moveSql("b.count", o.qty)}
                                  WHEN ${o.qty} - ${got} < ${DUST} THEN LEAST(${o.qty}, ${got})
                                  ELSE ${o.qty} END AS mv,
              b.count AS cnt, b.wear
         FROM yuplink.raid_hero_backpack b
        WHERE ${at}
          FOR UPDATE
     ),
     net AS (
       SELECT COALESCE(SUM(CEIL(s.count / ${CELL_SIZE}.0)), 0) AS used,
              COALESCE(SUM(s.count) FILTER (WHERE s.stack_key = ${key}), 0) AS same
         FROM yuplink.raid_chest_slot s
        WHERE s.account_id = ${acc} AND s.count > 0
     ),
     chk AS (
       /* Изношенная штука инструмента (tool-wear, §8.19) из рюкзака не уходит:
          всю стопку с износом в сеть не кладём — иначе топор «чинится». */
       SELECT src.*, (src.got >= src.mv) AS got_ok,
              (COALESCE(src.wear, 0) > 0 AND src.mv >= src.cnt) AS worn_all,
              (CEIL((net.same + src.mv) / ${CELL_SIZE}.0) - CEIL(net.same / ${CELL_SIZE}.0))
                <= (GREATEST(${CHEST_NET_CELLS}, net.used) - net.used) AS fits
         FROM src, net
     ),
     claim AS (
       INSERT INTO yuplink.raid_backpack_op (op)
       SELECT ${op} FROM chk, prior, here
        WHERE NOT prior.was AND chk.mv > 0 AND chk.got_ok AND chk.fits AND NOT chk.worn_all
       ON CONFLICT (op) DO NOTHING
       RETURNING 1
     ),
     /* Условия повторены на самой строке — вторая страховка к FOR UPDATE:
        не сошлось — рюкзак не тронут, и в сеть не ляжет ничего. */
     upd AS (
       UPDATE yuplink.raid_hero_backpack b
          SET count = b.count - chk.mv,
              ${originSetSql(originStoreSql(b, "chk.mv"))},
              updated_at = now()
         FROM chk, claim
        WHERE ${at} AND b.count > chk.mv AND ${got} >= chk.mv
       RETURNING 1
     ),
     del AS (
       DELETE FROM yuplink.raid_hero_backpack b USING chk, claim
        WHERE ${at} AND b.count = chk.mv AND ${got} >= chk.mv
          AND b.wear = 0
       RETURNING 1
     ),
     put AS (
       INSERT INTO yuplink.raid_chest_slot
          (account_id, stack_key, kind, ref_id, item_id, name, image, count)
       SELECT ${acc}, ${key}, chk.kind, chk.ref_id, chk.item_id, chk.name, chk.image, chk.mv
         FROM chk, (SELECT 1 FROM upd UNION ALL SELECT 1 FROM del) moved
       ON CONFLICT (account_id, stack_key) DO UPDATE
         SET count = yuplink.raid_chest_slot.count + EXCLUDED.count, updated_at = now()
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT was FROM prior) AS was, EXISTS (SELECT 1 FROM here) AS here,
              EXISTS (SELECT 1 FROM put) AS moved,
              (SELECT mv FROM chk) AS mv, (SELECT got FROM chk) AS got,
              (SELECT fits FROM chk) AS fits, (SELECT worn_all FROM chk) AS worn,
              (SELECT kind FROM chk) AS kind,
              (SELECT ref_id FROM chk) AS ref_id, (SELECT name FROM chk) AS name
     ) _t;`;
}

/**
 * Снять из сети владельца account ровно qty штук (пыль сверх — весь стек).
 * Лежит меньше — не снимаем ничего: повтор моста отвечает «было» без
 * количества, и вызывающий выдаёт свои qty — снятое обязано им равняться.
 * Опустевшая строка удаляется. Ответ: повтор ли это и сколько снято. Допуск
 * 1e-9 — девять знаков окна против 17 базы. via — клетка сундука, через
 * который берут (четвёртая редакция, 29.09): тем же оператором под локом сети
 * — сундук стоит и не закопан, а у ЧУЖОГО ещё и живой охраны на клетке нет
 * (own — берёт хозяин, охрана ему не помеха).
 */
export function takeSql(o: {
  account: string;
  stackKey: string;
  qty: number;
  op: string;
  via?: ChestVia;
}): string {
  const acc = sqlStr(o.account);
  const op = sqlStr(o.op);
  const at = `s.account_id = ${acc} AND s.stack_key = ${sqlStr(o.stackKey)}`;
  const via = viaSql(acc, o.via);
  return `${locksSql(`chest:${o.account}`)}
     WITH prior AS (
       SELECT EXISTS (SELECT 1 FROM yuplink.raid_backpack_op WHERE op = ${op}) AS was
     ),
     src AS (
       SELECT ${moveSql("s.count", o.qty)} AS mv
         FROM yuplink.raid_chest_slot s
        WHERE ${at} AND s.count - ${o.qty} > -0.000000001
          ${via}
     ),
     claim AS (
       INSERT INTO yuplink.raid_backpack_op (op)
       SELECT ${op} FROM src, prior WHERE NOT prior.was AND src.mv > 0
       ON CONFLICT (op) DO NOTHING
       RETURNING 1
     ),
     upd AS (
       UPDATE yuplink.raid_chest_slot s SET count = s.count - src.mv, updated_at = now()
         FROM src, claim
        WHERE ${at} AND s.count > src.mv
       RETURNING 1
     ),
     /* Весь стек — только если строка та же, что прочитали (под локом сети и
        со свежим снимком она и не изменится). */
     del AS (
       DELETE FROM yuplink.raid_chest_slot s USING src, claim
        WHERE ${at} AND s.count = src.mv
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT was FROM prior) AS was,
              (EXISTS (SELECT 1 FROM upd) OR EXISTS (SELECT 1 FROM del)) AS took,
              (SELECT mv FROM src) AS mv
     ) _t;`;
}

// Откат забора — returnSql — в chest-net-return-sql.ts (лимит строк); переиздан.
export { returnSql } from "@/server/api/beta-raid/chest/chest-net-return-sql";
