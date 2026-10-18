// Положить в обычный сундук и забрать из него — каждое одним оператором.
//
// Обе таблицы (рюкзак и ячейки сундука) в одной базе, поэтому переезд — одна
// транзакция без отката и без «снятия в полёте»: либо переехало всё, либо
// ничего. Локи — рюкзака героя, затем сундука, отдельными операторами до WITH
// (§8.15). «Забрать сундук» держит тот же лок сундука: из пары «забрать сундук
// / положить-забрать товар» проходит одно, и штуки не задваиваются и не
// теряются. Ключ нажатия — в raid_plain_chest_op тем же оператором.
//
// Сундук общий, как общая полка склада (§8.18): метки происхождения при вкладе
// снимаются по правилу траты (безымянное первым), в сундук не едут, забранное
// приходит безымянным. Изношенная штука инструмента не уходит (§8.19). Место в
// рюкзаке при заборе — та же проверка, что у выдачи (market-backpack-write):
// зелью — сумка строго, товару — рюкзак с доливом своей неполной ячейки.
//
// Без обёртки wrapJson: изменяющие CTE — верхний уровень. Комментарии внутри
// SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import { PLAIN_CHEST_CELLS } from "@/lib/plainChest";
import { IS_POTION_SQL, POTION_JOIN } from "@/server/api/beta-raid/potion-bag";
import {
  originCols,
  originGrowSql,
  originSetSql,
  originTakeSql,
} from "@/server/api/beta-raid/stack-origin";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";

/** Остаток меньше тысячной — весь стек: пыль ячейкой не висит. */
const DUST = 0.001;
/** Допуск «хватает ли»: девять знаков окна против 17 знаков базы. */
const NOISE = "0.000000001";

/** Кто и что: сундук, выбранный герой, стек, количество, ключ нажатия. */
export type MoveAt = {
  chestId: string;
  heroId: string;
  account: string;
  stackKey: string;
  qty: number;
  op: string;
};

/** Ответ переезда: повтор, переехало ли, сколько и почему нет. */
export type MoveRow = {
  /** Прошлый исход этого ключа (повтор): 'done'. */
  prior: string | null;
  prior_qty: number | string | null;
  moved: boolean;
  mv: number | string | null;
  /** Сундук стоит (не закопан). */
  here: boolean;
  /** Стек есть там, откуда берём. */
  have: boolean;
  fits: boolean | null;
  worn?: boolean | null;
  kind: string | null;
  ref_id: string | null;
  name: string | null;
};

/** Сколько снимаем: просили n, но пыль сверх остатка — весь стек. */
const moveSql = (count: string, n: number) =>
  `CASE WHEN ${count} - ${n} < ${DUST} THEN ${count} ELSE ${n} END`;

const q = (v: string) => sqlStr(v);

/** Сундук стоит и не закопан — под его локом, тем же оператором. */
const chestSql = (id: string) =>
  `SELECT 1 FROM yuplink.raid_plain_chest WHERE id = ${q(id)} AND buried_at IS NULL`;

/** Хвост ответа: общий у «положить» и «забрать». */
const tailSql = (src: string, fits: string, worn = "false") => `
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT state FROM prior) AS prior, (SELECT qty FROM prior) AS prior_qty,
              ${worn} AS worn,
              EXISTS (SELECT 1 FROM mark) AS moved,
              (SELECT mv FROM chk) AS mv,
              EXISTS (SELECT 1 FROM ch) AS here,
              EXISTS (SELECT 1 FROM ${src}) AS have,
              ${fits} AS fits,
              (SELECT kind FROM chk) AS kind, (SELECT ref_id FROM chk) AS ref_id,
              (SELECT name FROM chk) AS name
     ) _t;`;

/**
 * Положить qty штук стека из рюкзака в сундук. Сундук примет: новые ячейки —
 * в пределах десяти, долив в свою неполную — всегда (GREATEST(10, занято)).
 */
export function putSql(o: MoveAt): string {
  const [id, hero, key, op] = [q(o.chestId), q(o.heroId), q(o.stackKey), q(o.op)];
  const b = originCols("b.");
  return `${locksSql(`bp:${o.heroId}`, `pchest:${o.chestId}`)}
     WITH prior AS (
       SELECT state, qty FROM yuplink.raid_plain_chest_op WHERE op = ${op}
     ),
     ch AS (${chestSql(o.chestId)}),
     src AS (
       SELECT b.id, b.kind, b.ref_id, b.item_id, b.name, b.image, b.count AS cnt, b.wear
         FROM yuplink.raid_hero_backpack b
        WHERE b.hero_id = ${hero} AND b.stack_key = ${key} AND b.count > 0
          FOR UPDATE
     ),
     net AS (
       SELECT COALESCE(SUM(CEIL(s.count / ${CELL_SIZE}.0)), 0) AS used,
              COALESCE(SUM(s.count) FILTER (WHERE s.stack_key = ${key}), 0) AS same
         FROM yuplink.raid_plain_chest_slot s
        WHERE s.chest_id = ${id} AND s.count > 0
     ),
     chk AS (
       SELECT src.*, m.mv,
              /* Изношенная штука (tool-wear, §8.19) из рюкзака не уходит. */
              (COALESCE(src.wear, 0) > 0 AND m.mv > src.cnt - 1 + ${NOISE}) AS worn,
              (CEIL((net.same + m.mv) / ${CELL_SIZE}.0) - CEIL(net.same / ${CELL_SIZE}.0))
                <= (GREATEST(${PLAIN_CHEST_CELLS}, net.used) - net.used) AS fits
         FROM src, net, LATERAL (SELECT ${moveSql("src.cnt", o.qty)} AS mv) m
     ),
     go AS (
       SELECT chk.* FROM chk, ch
        WHERE NOT EXISTS (SELECT 1 FROM prior) AND chk.mv > 0 AND chk.fits AND NOT chk.worn
     ),
     upd AS (
       UPDATE yuplink.raid_hero_backpack b
          SET count = b.count - go.mv,
              ${originSetSql(originTakeSql(b, "b.count - go.mv"))},
              updated_at = now()
         FROM go
        WHERE b.id = go.id AND b.count > go.mv
       RETURNING 1
     ),
     del AS (
       DELETE FROM yuplink.raid_hero_backpack b USING go
        WHERE b.id = go.id AND b.count = go.mv AND b.wear = 0
       RETURNING 1
     ),
     put AS (
       INSERT INTO yuplink.raid_plain_chest_slot
          (chest_id, stack_key, kind, ref_id, item_id, name, image, count)
       SELECT ${id}, ${key}, go.kind, go.ref_id, go.item_id, go.name, go.image, go.mv
         FROM go, (SELECT 1 FROM upd UNION ALL SELECT 1 FROM del) moved
       ON CONFLICT (chest_id, stack_key) DO UPDATE
         SET count = yuplink.raid_plain_chest_slot.count + EXCLUDED.count, updated_at = now()
       RETURNING 1
     ),
     mark AS (
       INSERT INTO yuplink.raid_plain_chest_op (op, chest_id, account_id, kind, state, qty)
       SELECT ${op}, ${id}, ${q(o.account)}, 'put', 'done', go.mv FROM go, put
       RETURNING 1
     ),
     touch AS (
       UPDATE yuplink.raid_plain_chest SET updated_at = now()
        WHERE id = ${id} AND EXISTS (SELECT 1 FROM put)
       RETURNING 1
     )${tailSql("src", "(SELECT fits FROM chk)", "(SELECT worn FROM chk)")}`;
}

/**
 * Забрать qty штук стека из сундука в рюкзак (сколько просят — вызывающий
 * уже урезал до места; здесь место проверяется ещё раз, атомарно с записью).
 * Остаток-пыль уходит со стеком, только если влезает (cap — место в рюкзаке
 * под этот вид), иначе остаётся — как у мешочка. potion — вид лежит в сумке
 * зелий; ёмкости — выбранного героя.
 */
export function takeSql(
  o: MoveAt & { potion: boolean; capacity: number; potionCapacity: number; cap: number },
): string {
  const [id, hero, key, op] = [q(o.chestId), q(o.heroId), q(o.stackKey), q(o.op)];
  const cells = (potion: boolean) =>
    `COALESCE((SELECT SUM(CEIL(b.count / ${CELL_SIZE}.0))
                 FROM yuplink.raid_hero_backpack b ${POTION_JOIN}
                WHERE b.hero_id = ${hero} AND ${potion ? "" : "NOT "}${IS_POTION_SQL}), 0)`;
  const pc = Math.max(0, Math.floor(Number(o.potionCapacity) || 0));
  const cap = Math.max(0, Math.floor(Number(o.capacity) || 0));
  const fit = o.potion ? `chk.potions + chk.d <= ${pc}` : `chk.items + chk.d <= GREATEST(${cap}, chk.items)`;
  const old = originCols("yuplink.raid_hero_backpack.");
  return `${locksSql(`bp:${o.heroId}`, `pchest:${o.chestId}`)}
     WITH prior AS (
       SELECT state, qty FROM yuplink.raid_plain_chest_op WHERE op = ${op}
     ),
     ch AS (${chestSql(o.chestId)}),
     slot AS (
       SELECT s.kind, s.ref_id, s.item_id, s.name, s.image, s.count
         FROM yuplink.raid_plain_chest_slot s
        WHERE s.chest_id = ${id} AND s.stack_key = ${key} AND s.count > 0
     ),
     room AS (
       SELECT COALESCE((SELECT count FROM yuplink.raid_hero_backpack
                         WHERE hero_id = ${hero} AND stack_key = ${key}), 0) AS cur,
              ${cells(false)} AS items, ${cells(true)} AS potions
     ),
     chk AS (
       SELECT slot.*, m.mv, room.items, room.potions,
              CEIL((room.cur + m.mv) / ${CELL_SIZE}.0) - CEIL(room.cur / ${CELL_SIZE}.0) AS d
         FROM slot, room,
              LATERAL (SELECT CASE WHEN slot.count - ${o.qty} < ${DUST}
                                   THEN LEAST(slot.count, ${Math.max(o.qty, o.cap)})
                                   ELSE ${o.qty} END AS mv) m
     ),
     go AS (
       SELECT chk.* FROM chk, ch
        WHERE NOT EXISTS (SELECT 1 FROM prior) AND chk.mv > 0 AND ${fit}
     ),
     upd AS (
       UPDATE yuplink.raid_plain_chest_slot s SET count = s.count - go.mv, updated_at = now()
         FROM go
        WHERE s.chest_id = ${id} AND s.stack_key = ${key} AND s.count > go.mv
       RETURNING 1
     ),
     del AS (
       DELETE FROM yuplink.raid_plain_chest_slot s USING go
        WHERE s.chest_id = ${id} AND s.stack_key = ${key} AND s.count = go.mv
       RETURNING 1
     ),
     /* Сундук меток не хранит: забранное — безымянное (все четыре — ноль). */
     ins AS (
       INSERT INTO yuplink.raid_hero_backpack
          (id, hero_id, account_id, kind, ref_id, item_id, stack_key, name, image, count,
           mob_count, mine_count, field_count, loot_count)
       SELECT 'bp_' || substr(md5(${op}), 1, 20), ${hero}, ${q(o.account)}, go.kind, go.ref_id,
              go.item_id, ${key}, go.name, go.image, go.mv, 0, 0, 0, 0
         FROM go, (SELECT 1 FROM upd UNION ALL SELECT 1 FROM del) moved
       ON CONFLICT (hero_id, stack_key) DO UPDATE
         SET count = yuplink.raid_hero_backpack.count + EXCLUDED.count,
             ${originSetSql(originGrowSql(old, originCols("EXCLUDED.")))},
             updated_at = now()
       RETURNING 1
     ),
     mark AS (
       INSERT INTO yuplink.raid_plain_chest_op (op, chest_id, account_id, kind, state, qty)
       SELECT ${op}, ${id}, ${q(o.account)}, 'take', 'done', go.mv FROM go, ins
       RETURNING 1
     ),
     touch AS (
       UPDATE yuplink.raid_plain_chest SET updated_at = now()
        WHERE id = ${id} AND EXISTS (SELECT 1 FROM ins)
       RETURNING 1
     )${tailSql("slot", `(SELECT ${fit} FROM chk)`)}`;
}
