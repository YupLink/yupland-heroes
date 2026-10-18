// SQL мешочков: общее (лок, срок порции, стопка) и «уронить» с «забором».
// Снять стопку — bag-take-sql.ts, положить — bag-put-sql.ts, развязка снятия —
// bag-back-sql.ts. Правила — ПРАВИЛА §8.21, шапка bag-deliver.ts.
//
// Всё, что меняет содержимое мешочка, идёт под pg_advisory_xact_lock
// ('lootbag:'||id) ОТДЕЛЬНЫМ оператором перед основным: в READ COMMITTED снимок
// берётся до выполнения оператора, и лок внутри того же WITH не освежал бы
// чтение (§8.15). Двое забирают разом — второй видит уже снятое. Повтор моста
// (тот же текст) ловит свой ключ: мешочек — по id от ключа выпадения, забор и
// «положить» — по ключу нажатия в raid_loot_bag_op.
//
// Содержимое — порциями (вид, срок, штуки, метки): порция живёт 24 часа с
// попадания в мешочек, сливаются только порции одного вида с одним сроком.
//
// Без обёртки wrapJson: изменяющие CTE — верхний уровень, JSON ответа собираем
// сами (market-backpack-write). Комментарии внутри SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { LOOT_BAG_TTL_HOURS } from "@/lib/lootBag";
import { ORIGINS, type OriginQty } from "@/server/api/beta-raid/stack-origin";

/** Остаток меньше тысячной — это весь стек: пыль не висит в мешочке. */
export const DUST = 0.001;

export const str = (v: string | null | undefined): string => (v ? sqlStr(v) : "NULL");
export const num = (v: number): string => String(Number.isFinite(v) ? v : 0);

/** Срок новой порции: 24 часа с попадания в мешочек (и с закапывания — бугорку). */
export const PORTION_TTL = `now() + interval '${LOOT_BAG_TTL_HOURS} hours'`;

/** Колонки порции — в порядке INSERT (dropSql, putSql, переслив при закапывании). */
export const ITEM_COLS = `bag_id, stack_key, expires_at, kind, ref_id, item_id, name, image, count,
           ${ORIGINS.map((k) => `${k}_count`).join(", ")}`;

/** Живая порция (алиас x): есть штуки и срок не вышел. */
export const livePortion = (x: string): string => `${x}.count > 0 AND ${x}.expires_at > now()`;

/** Лок мешочка — отдельным оператором. */
export const bagLockSql = (bagId: string): string =>
  `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`lootbag:${bagId}`)})) AS l;`;

/** id мешочка по ключу выпадения — выражением базы. */
const idOf = (key: string): string => `'lb_' || md5(${sqlStr(key)})`;

/** Тот же лок, что bagLockSql(id), когда id считает база (уронить и «забор»). */
const dropLockSql = (key: string): string =>
  `SELECT pg_advisory_xact_lock(hashtext('lootbag:' || ${idOf(key)})) AS l;`;

/** Стопка, падающая в мешочек: вид и подпись, сколько и с какими метками. */
export type BagStack = {
  stackKey: string;
  kind: string;
  refId: string | null;
  itemId: string | null;
  name: string;
  image: string | null;
  count: number;
  marks: OriginQty;
};

/** Откуда мешочек: объект карты, босс, срубленный декор или улов рыбалки (§8.35). */
export type BagSource = "object" | "boss" | "decor" | "fish";

export type DropPlace = {
  /** Ключ выпадения: id мешочка = 'lb_' || md5(ключа). Один ключ — один мешочек. */
  key: string;
  mapId: string;
  q: number;
  r: number;
  /** Чья добыча не влезла (аккаунт). */
  account: string;
  source: BagSource;
  sourceName: string;
};

/** Строка мешочка (без порций): id от ключа, клетка, чей и откуда. */
const bagRowSql = (at: DropPlace): string =>
  `INSERT INTO yuplink.raid_loot_bag
          (id, map_id, q, r, created_at, dropped_by, source, source_name, updated_at)
       VALUES (${idOf(at.key)}, ${sqlStr(at.mapId)}, ${Math.floor(at.q)}, ${Math.floor(at.r)},
               now(), ${sqlStr(at.account)}, ${sqlStr(at.source)}, ${sqlStr(at.sourceName)}, now())
       ON CONFLICT (id) DO NOTHING`;

/**
 * Уронить мешочек: строка мешочка и по порции на стопку — одним оператором
 * под локом мешочка. Порции вставляются, только если мешочек вставлен сейчас:
 * повтор моста после коммита второй мешочек не уронит и содержимое не удвоит.
 * Ключи стопок в `stacks` уникальны (сводит вызывающий).
 */
export function dropSql(at: DropPlace, stacks: readonly BagStack[]): string {
  const id = idOf(at.key);
  const rows = stacks
    .map(
      (s) =>
        `(${sqlStr(s.stackKey)}::text, ${sqlStr(s.kind)}::text, ${str(s.refId)}::text, ` +
        `${str(s.itemId)}::text, ${sqlStr(s.name)}::text, ${str(s.image)}::text, ` +
        `${num(s.count)}::numeric, ${ORIGINS.map((k) => `${num(s.marks[k])}::numeric`).join(", ")})`,
    )
    .join(",\n            ");
  return `${dropLockSql(at.key)}
     WITH bag AS (
       ${bagRowSql(at)}
       RETURNING id
     ),
     items AS (
       INSERT INTO yuplink.raid_loot_bag_item (${ITEM_COLS})
       SELECT bag.id, v.k, ${PORTION_TTL}, v.kind, v.ref, v.item, v.name, v.image, v.n,
              v.mob, v.mine, v.field, v.loot
         FROM bag, (VALUES ${rows}) AS v(k, kind, ref, item, name, image, n, mob, mine, field, loot)
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT ${id} AS id, EXISTS (SELECT 1 FROM bag) AS fresh,
              (SELECT count(*) FROM items)::int AS n
     ) _t;`;
}

/**
 * «Забор» мешочка, когда dropSql не ответил «уронил сейчас»: под тем же локом
 * — надгробие, строка мешочка без порций (её не видно: живость — по порциям).
 * Вставилось — мешочка не было и не будет (опоздавший dropSql упрётся в id и
 * порций не положит); уже есть с порциями — настоящий (real), без порций —
 * наше же надгробие с прошлого повтора. Надгробие сборщик уберёт через 10 минут.
 */
export function dropFenceSql(at: DropPlace): string {
  const id = idOf(at.key);
  return `${dropLockSql(at.key)}
     WITH t AS (
       ${bagRowSql(at)}
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT ${id} AS id,
              EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item i WHERE i.bag_id = ${id}) AS real
     ) _t;`;
}
