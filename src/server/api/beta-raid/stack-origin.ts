// Происхождение штук стека: с мобов, с шахт, с грядок и «собрано прочее»
// (объекты карты, декор, награды рейда, добыча грабежа, возврат из своего
// сундука). Всё это — «собранное». Купленное, плата товаром, крафт, доски
// разобранного корабля и всё, что лежало до меток, — «безымянное».
//
// Правило владельца (29.09.2026, ПРАВИЛА §8.15/§8.18): в магический сундук —
// ВСЁ собранное, кроме купленного. Стек один на вид, поэтому рядом с count
// живут четыре счётчика — mob_count, mine_count, field_count, loot_count — и в
// рюкзаке (raid_hero_backpack), и на ЛИЧНОЙ полке склада (raid_warehouse_slot;
// общая полка не «моя» — меток не хранит).
//
// Трата: безымянное → прочее собранное → грядки → шахты → мобы. Собранное
// уходит последним, чтобы на сундук оставалось как можно больше. Отсюда одна
// формула на все метки: помеченное считается ПРЕФИКСАМИ в порядке «беречь»
// (мобы; +шахты; +грядки; +прочее), и каждый префикс живёт по формуле мобов
// (backpack-mob): не больше count, прирост — сверху. Метка — разность соседних
// префиксов; последний префикс — «собрано» целиком. Мобы по-прежнему читаются
// как LEAST(mob_count, count), а сумма меток никогда не больше count.
//
// Списание — та же формула с новым count в потолке: стек из N штук хранит
// LEAST(префикс, N), безымянное ушло первым. Путь, который уменьшил count и не
// тронул метки (удар инструментом), лишнего не родит: чтение режет той же
// формулой.
import { mobAfterGrowSql, type MobCols } from "@/server/api/beta-raid/backpack-mob";

/** Метки в порядке «беречь»: чем правее, тем раньше тратится. */
export const ORIGINS = ["mob", "mine", "field", "loot"] as const;
export type StackOrigin = (typeof ORIGINS)[number];
/** Сколько штук с какой меткой. */
export type OriginQty = Record<StackOrigin, number>;
/** SQL-выражение на каждую метку. */
export type OriginSql = Record<StackOrigin, string>;
/** Колонки строки в SQL: count и четыре счётчика. */
export type OriginCols = MobCols & { mine: string; field: string; loot: string };

export const NO_ORIGIN: OriginQty = { mob: 0, mine: 0, field: 0, loot: 0 };

/** Метка из строки базы или ответа: только известные, иначе — безымянное. */
export const originOf = (v: unknown): StackOrigin | null =>
  typeof v === "string" && (ORIGINS as readonly string[]).includes(v) ? (v as StackOrigin) : null;

/** Колонки с префиксом таблицы или алиаса ("" — голые имена, обычный UPDATE). */
export const originCols = (p = ""): OriginCols => ({
  count: `${p}count`,
  mob: `${p}mob_count`,
  mine: `${p}mine_count`,
  field: `${p}field_count`,
  loot: `${p}loot_count`,
});

/** Префиксы меток в порядке «беречь»; последний — всё собранное. */
const prefixes = (o: OriginSql): string[] => [
  o.mob,
  `${o.mob} + ${o.mine}`,
  `${o.mob} + ${o.mine} + ${o.field}`,
  `${o.mob} + ${o.mine} + ${o.field} + ${o.loot}`,
];

/** Метки из префиксов: разности соседних. */
const fromPrefixes = (t: string[]): OriginSql => ({
  mob: t[0],
  mine: `(${t[1]}) - (${t[0]})`,
  field: `(${t[2]}) - (${t[1]})`,
  loot: `(${t[3]}) - (${t[2]})`,
});

/** Метки строки — читать ВСЕГДА так: не больше count, мобы первыми. */
export function originReadSql(c: OriginCols): OriginSql {
  return fromPrefixes(prefixes(c).map((p) => `LEAST(${p}, ${c.count})`));
}

/** Сколько штук строки собрано (любая метка) — то, что можно положить в сундук. */
export function collectedSql(c: OriginCols): string {
  return `LEAST(${prefixes(c)[3]}, ${c.count})`;
}

/**
 * Метки после СПИСАНИЯ: в стеке осталось left штук (SQL нового count, не больше
 * прежнего). Безымянное ушло первым, потом прочее собранное, грядки, шахты, мобы.
 */
export function originTakeSql(c: OriginCols, left: string): OriginSql {
  return fromPrefixes(prefixes(c).map((p) => `LEAST(${p}, ${left})`));
}

/**
 * Метки после вклада n СОБРАННЫХ штук в магический сундук: безымянное остаётся
 * в стеке целиком, из собранного первым уходит прочее, мобы — последними. n —
 * SQL, не больше собранного (условие — у вызывающего).
 */
export function originStoreSql(c: OriginCols, n: string): OriginSql {
  return originTakeSql(c, `${collectedSql(c)} - ${n}`);
}

/**
 * Метки после ПРИРОСТА: прежние (не больше count) плюс добавленные. cap — новый
 * count: возврат по снимку не должен дать меток больше, чем штук.
 */
export function originGrowSql(c: OriginCols, add: OriginSql, cap?: string): OriginSql {
  const adds = prefixes(add);
  return fromPrefixes(
    prefixes(c).map((p, i) => mobAfterGrowSql({ count: c.count, mob: p }, adds[i], cap)),
  );
}

/** Сколько меток ушло со списанием: было (прочитано до записи) минус стало. */
export function originTakenSql(was: OriginCols, now: OriginCols): OriginSql {
  const w = originReadSql(was);
  const out = {} as OriginSql;
  for (const k of ORIGINS) out[k] = `GREATEST(0, ${w[k]} - ${now[k]})`;
  return out;
}

/** SET-часть записи меток (целевые колонки — голые имена). */
export const originSetSql = (o: OriginSql): string =>
  ORIGINS.map((k) => `${k}_count = ${o[k]}`).join(", ");

/** SET-часть «меток нет» — общая полка склада. */
export const originZeroSetSql = (): string => originSetSql(originLit(NO_ORIGIN));

/** Числа меток — SQL-литералами. */
export const originLit = (o: OriginQty): OriginSql => ({
  mob: String(o.mob),
  mine: String(o.mine),
  field: String(o.field),
  loot: String(o.loot),
});

const pos = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const same = (v: number): number => v;

/**
 * Метки, урезанные под qty штук в порядке «беречь», — зеркало префиксной
 * формулы. round — точность переноса: девять знаков у склада, тысячные у оплаты.
 */
export function originWithin(
  qty: number,
  o?: Partial<Record<StackOrigin, unknown>> | null,
  round: (v: number) => number = same,
): OriginQty {
  const out = { ...NO_ORIGIN };
  let room = pos(qty);
  for (const k of ORIGINS) {
    out[k] = Math.max(0, Math.min(round(pos(o?.[k])), round(room)));
    room -= out[k];
  }
  return out;
}

/**
 * Метки вклада qty штук: одной меткой целиком, точным разбором (склад, возврат)
 * или прежним флагом «с мобов». Разбор важнее флага; сверх qty не бывает.
 */
export function originAdds(
  qty: number,
  origin?: StackOrigin | Partial<OriginQty> | null,
  mob?: boolean,
): OriginQty {
  if (typeof origin === "string") return originWithin(qty, { [origin]: qty });
  return originWithin(qty, origin ?? (mob ? { mob: qty } : null));
}

/** Снимок списания: сколько штук каждой метки ушло. */
export type TakenMarks = {
  mobTaken?: unknown;
  mineTaken?: unknown;
  fieldTaken?: unknown;
  lootTaken?: unknown;
};

/** Метки из снимка списания (mobTaken / mineTaken / fieldTaken / lootTaken). */
export const originOfTaken = (s?: TakenMarks | null): OriginQty => ({
  mob: pos(s?.mobTaken),
  mine: pos(s?.mineTaken),
  field: pos(s?.fieldTaken),
  loot: pos(s?.lootTaken),
});

/** Метки — полями снимка списания. */
export const takenOf = (o: OriginQty) => ({
  mobTaken: o.mob,
  mineTaken: o.mine,
  fieldTaken: o.field,
  lootTaken: o.loot,
});

/**
 * Разделить метки переноса на две части: первой (first штук) — помеченное в
 * порядке «беречь», второй — остаток. Склад: личной полке — первой, общей —
 * что осталось (общая метки не хранит: что уехало туда, их теряет).
 */
export function originSplit(o: OriginQty, first: number, round = same): [OriginQty, OriginQty] {
  const a = originWithin(first, o, round);
  const b = { ...NO_ORIGIN };
  for (const k of ORIGINS) b[k] = Math.max(0, round(o[k] - a[k]));
  return [a, b];
}

/**
 * Метки двух частей переноса: всего total штук по снимку списания s, первой
 * части — first штук (помеченное — ей, см. originSplit), второй — остаток.
 */
export const originParts = (
  s: TakenMarks | null | undefined,
  total: number,
  first: number,
  round = same,
): [OriginQty, OriginQty] =>
  originSplit(originWithin(total, originOfTaken(s), round), first, round);

/** Сумма двух разборов меток. */
export function originPlus(a: OriginQty, b: OriginQty, round = same): OriginQty {
  const out = { ...NO_ORIGIN };
  for (const k of ORIGINS) out[k] = round(a[k] + b[k]);
  return out;
}
