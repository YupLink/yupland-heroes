// Отдых героя после снятия с грядки издалека (правило владельца 29.09.2026).
//
// Пока идёт отдых (hero_instance.rest_until), герой недоступен целиком: не
// становится основным ни в замке, ни в таверне, не встаёт на грядку, не
// качается и не забывает заклинания. Экипировка, изучение, дерево уровней и
// буст работают только с основным, а основным отдыхающий не бывает: снятие
// издалека тем же оператором снимает с него и отметку основного (field-leave).
//
// Проверка одна на все пути — здесь; там, где выбор и запись идут одним
// оператором, условие ставится и в сам UPDATE (awakeSql).
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";

/** Отказ «герой отдыхает» — ключ словаря: тост переведёт его (humanError). */
export const HERO_RESTING = "braid.hero_resting";

/** Срок отдыха строкой ISO, если он ещё идёт; прошёл или нет — null. */
export function activeRest(v: string | null | undefined, now = Date.now()): string | null {
  if (!v) return null;
  const until = Date.parse(v);
  return Number.isFinite(until) && until > now ? new Date(until).toISOString() : null;
}

/** Условие SQL «герой не отдыхает» — для UPDATE, где проверка и запись одно. */
export function awakeSql(alias?: string): string {
  const col = alias ? `${alias}.rest_until` : "rest_until";
  return `(${col} IS NULL OR ${col} <= now())`;
}

/**
 * Замок героя ОТДЕЛЬНЫМ оператором перед основным (как сеть сундука §8.15 и
 * забвение): «на грядку» и «в основные» разом иначе прошли бы оба — снимок
 * оператора берётся до его же замков, а проверки «свободен»/«не основной»
 * читают этот снимок. Лок держится до конца неявной транзакции строки запроса,
 * и следующий оператор видит уже закоммиченное соседом.
 */
export const heroLockSql = (heroId: string): string =>
  `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`hero:${heroId}`)})) AS l;`;

/** Отдыхает ли герой прямо сейчас. Сбой базы — бросает: гасить молча нельзя. */
export async function heroIsResting(heroId: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT 1 AS hit FROM yuplink.hero_instance
      WHERE id = ${sqlStr(heroId)} AND rest_until > now() LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ hit: number }>;
  return (rows?.length ?? 0) > 0;
}

/** Отказ, если герой отдыхает. */
export async function requireHeroAwake(heroId: string): Promise<void> {
  if (await heroIsResting(heroId)) throw new Error(HERO_RESTING);
}

/** Батрачащий на грядке: основным не становится (ключ словаря — braid-mine.ts). */
export const HERO_AT_FIELD = "braid.field_hero_busy";

/**
 * Основной не батрачит (правило владельца 29.09.2026): «работает — значит не
 * основной», и основного на грядку не ставят — потому что он основной.
 */
export const HERO_IS_MAIN = "braid.field_hero_is_main";

/**
 * Условие SQL «герой свободен»: не отдыхает и не стоит на грядке. Для UPDATE
 * выбора основного — проверка и запись одним оператором.
 */
export function freeHeroSql(alias: string): string {
  return `${awakeSql(alias)} AND NOT EXISTS (
    SELECT 1 FROM yuplink.raid_field_worker fw WHERE fw.hero_id = ${alias}.id)`;
}

/**
 * Отказ, если герой занят: отдыхает или батрачит. Для основного героя — в
 * замке, в выборе с карты и в таверне. Сбой базы бросает: пропустить молча
 * значило бы поставить основным занятого.
 */
export async function requireHeroFree(heroId: string): Promise<void> {
  const rows = (await mcpExec(
    `SELECT (h.rest_until > now()) AS resting,
            EXISTS (SELECT 1 FROM yuplink.raid_field_worker fw WHERE fw.hero_id = h.id) AS busy
       FROM yuplink.hero_instance h WHERE h.id = ${sqlStr(heroId)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ resting: boolean | null; busy: boolean }>;
  const row = rows?.[0];
  if (row?.resting) throw new Error(HERO_RESTING);
  if (row?.busy) throw new Error(HERO_AT_FIELD);
}
