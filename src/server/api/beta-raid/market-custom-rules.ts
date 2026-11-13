// Правила своего товара: вход настройки буста и износа, взаимоисключающие
// галочки и понятные отказы вместо текста базы. Вынесено из market-custom.ts
// (лимит ≤250 строк) без изменения логики; галочка «Сундук» (29.09) — новая.
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { BOOST_STAT_KEYS, parseBoostEffects, type BoostEffect } from "@/lib/hero/boost";
import { oblivionEffectsOk, oblivionGuard } from "@/lib/hero/oblivionRule";
import { toolWearOf } from "@/lib/raid/toolWear";

/** Износ в теле запроса: пусто (null) — «ломается сразу»; число — 1…100. */
export const toolWearInput = z.number().int().min(1).max(100).nullable();

/**
 * Сундук (магический и обычный) инструментом с износом быть не может: на
 * карту его ставят списанием последней штуки целиком, и изношенная ушла бы в
 * сундук целой (то же держат ограничения базы, миграции decor-03 и pchest-01).
 */
export function assertWearFits(
  chest: boolean | undefined,
  wear: number | null | undefined,
  plain?: boolean,
): void {
  if ((chest || plain) && toolWearOf(wear) !== null) {
    throw new Error(
      chest
        ? "Магический сундук не изнашивается — убери «Износ за удар»"
        : "Сундук не изнашивается — убери «Износ за удар»",
    );
  }
}

/** Галочки товара, которые не сочетаются друг с другом. */
type Kinds = {
  isShovel?: boolean;
  isPotion?: boolean;
  magicChest?: boolean;
  plainChest?: boolean;
  isRod?: boolean;
  isMap?: boolean;
  isBinocular?: boolean;
  isLadder?: boolean;
};

/** Лопата не зелье и не сундук (то же держат ограничения базы, bag-01 и pchest-01). */
export function assertShovelFits(d: Kinds) {
  if (d.isShovel && (d.isPotion || d.magicChest || d.plainChest)) {
    throw new Error("Лопата — не зелье и не сундук");
  }
}

/** Удочка (§8.35) не зелье, не сундук и не лопата (ограничение базы raid_custom_item_rod_ok, fish-01). */
export function assertRodFits(d: Kinds) {
  if (d.isRod && (d.isPotion || d.magicChest || d.plainChest || d.isShovel)) {
    throw new Error("Удочка — не зелье, не сундук и не лопата");
  }
}

/**
 * Карта (§8.32) не зелье, не сундук, не лопата и не удочка (ограничение базы
 * raid_custom_item_map_ok, map-01).
 */
export function assertMapFits(d: Kinds) {
  if (d.isMap && (d.isPotion || d.magicChest || d.plainChest || d.isShovel || d.isRod)) {
    throw new Error("Карта — не зелье, не сундук, не лопата и не удочка");
  }
}

/**
 * «Сундук», «Магический сундук», «Зелье», «Лопата», «Удочка», «Карта»,
 * «Бинокль» и «Лестница» взаимоисключающие (29.09, ограничение
 * raid_custom_item_kind_ok, pchest-01; удочка — fish-01, карта — map-01;
 * бинокль и лестница — binocular-01): не больше одной.
 */
export function assertOneKind(d: Kinds) {
  const on = [
    d.isShovel,
    d.isPotion,
    d.magicChest,
    d.plainChest,
    d.isRod,
    d.isMap,
    d.isBinocular,
    d.isLadder,
  ].filter((v) => v === true);
  if (on.length > 1) {
    throw new Error(
      "Сундук, магический сундук, зелье, лопата, удочка, карта, бинокль и лестница — не вместе",
    );
  }
}

/**
 * Схема настройки буста в теле запроса: список эффектов, числа строками в
 * общем формате проекта — «2» или «1-10». «Забвение» с неверной парой
 * «уровень + минуты» не сохраняем — отказ ключом (lib/hero/oblivionRule.ts).
 */
export const boostInput = z
  .array(
    z.object({
      // Список статов — тот же, что читает игра (боевые, Торговля/Алхимия, иммунитет).
      stat: z.string().refine((v) => (BOOST_STAT_KEYS as string[]).includes(v)),
      value: z.string().min(1).max(20),
      // Пусто можно: у забвения без минут — заряды без срока. Прочим пустые
      // минуты parseBoostEffects заменит на 30, как и раньше.
      minutes: z.string().max(20),
      /** Только у иммунитета: вид дебаффа или "all". Проверяет parseBoostEffects. */
      ability: z.string().max(40).optional(),
    }),
  )
  .nullable()
  .default(null)
  .refine(oblivionGuard(oblivionEffectsOk));

/** jsonb → настройка. Кривое или пустое значение считаем «буста нет». */
export const boostOf = (raw: unknown): BoostEffect[] | null => {
  const list = parseBoostEffects(raw);
  return list.length > 0 ? list : null;
};

export const boostSql = (b: BoostEffect[] | null): string =>
  b && b.length > 0 ? `${sqlStr(JSON.stringify(b))}::jsonb` : "NULL";

/**
 * Сундук — вид один (частичный уникальный индекс raid_custom_item_one_magic_chest).
 * Вторая галочка упирается в индекс; вместо текста базы админ читает, какой
 * товар уже сундук. Прочие сбои записи летят как были.
 */
export async function explainChestClash(e: unknown, chest: boolean | undefined): Promise<never> {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const clash =
    /one_magic_chest/i.test(msg) ||
    (/duplicate key|unique constraint/i.test(msg) && !/pkey/i.test(msg));
  if (!chest || !clash) throw e;
  const rows = (await mcpExec(
    `SELECT name FROM yuplink.raid_custom_item WHERE magic_chest LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ name: string | null }>;
  throw new Error(`Магический сундук уже есть: ${rows?.[0]?.name ?? "?"}`);
}
