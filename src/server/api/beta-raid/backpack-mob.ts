// Происхождение штук стека рюкзака: сколько из них добыто с мобов.
//
// Правило владельца (27.09.2026, шапка @/lib/magicChest): в магический сундук
// кладётся добытое, купленное — нельзя (с 29.09 — всё собранное: мобы лишь
// одна из четырёх меток, stack-origin). Стек один на вид, и добыча с покупкой
// в нём сливаются, поэтому рядом с count живёт счётчик
// raid_hero_backpack.mob_count. Верим ему только как LEAST(mob_count, count):
// путь, который уменьшил count и забыл про mob_count, не даст «лишних» мобов —
// их срежет чтение и следующая запись.
//
// Купленное тратится первым: списание n оставляет LEAST(mob_count, count − n).
// Формулы собраны здесь, чтобы вклад, списание, возврат и «выбросить» считали
// одинаково, а тест держал их от «упрощений».

/** Колонки строки рюкзака в SQL: с именем таблицы или без. */
export type MobCols = { count: string; mob: string };

/** Колонки без квалификатора — обычный UPDATE одной таблицы. */
export const BARE_COLS: MobCols = { count: "count", mob: "mob_count" };

/** Прежняя строка в ON CONFLICT DO UPDATE (её значения — до записи). */
export const OLD_COLS: MobCols = {
  count: "yuplink.raid_hero_backpack.count",
  mob: "yuplink.raid_hero_backpack.mob_count",
};

/**
 * mob_count после ПРИРОСТА count: прежние штуки с мобов (не больше, чем
 * лежало) плюс добавленные с мобов. newCount — потолок, когда добавленное
 * с мобов может превысить добавленное вообще (возврат по снимку).
 */
export function mobAfterGrowSql(c: MobCols, addMob: string, newCount?: string): string {
  const grown = `LEAST(${c.mob}, ${c.count}) + ${addMob}`;
  return newCount ? `LEAST(${grown}, ${newCount})` : grown;
}

/** mob_count после СПИСАНИЯ n штук: купленное уходит первым. */
export function mobAfterTakeSql(c: MobCols, n: number): string {
  return `LEAST(${c.mob}, ${c.count} - ${n})`;
}

/** До тысячных, без мусорного хвоста double и без минуса. */
const qty3 = (v: number): number => Math.max(0, Math.round(v * 1000) / 1000);

/**
 * Сколько из возвращаемых qty штук вернуть «с мобов». Снимок списания помнит,
 * сколько мобов ушло; вернуть больше, чем возвращаем всего, нельзя — иначе
 * частичный возврат (склад принял часть) раздувал бы добычу.
 */
export function mobBackOf(qty: number, mobTaken: number | null | undefined): number {
  const m = Number(mobTaken);
  if (!Number.isFinite(m) || m <= 0) return 0;
  return Math.min(qty3(qty), qty3(m));
}
