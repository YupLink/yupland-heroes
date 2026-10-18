// Схема одной правки клетки из очереди режима бога (adminPatchCells).
//
// Вынесена из admin-live-batch.ts (файл за лимитом строк) без изменений, кроме
// правила «Забвения»: конфиг постройки, где у алтаря (boost.effects) или храма
// (oblivion) неверная пара «уровень + минуты», не сохраняется — отказ называет
// клетку (lib/hero/oblivionRule.ts, ПРАВИЛА §8.17). И USDT: шахта и грядка платят
// без предела — их наградой USDT не ставится (ПРАВИЛА §8.49а).
import { z } from "zod";
import { ICON_SCALE_MAX, ICON_SCALE_MIN } from "@/lib/mergeScale";
import { assertOblivionCell } from "@/lib/oblivionConfig";
import { assertNoUsdtCell } from "@/lib/usdtBanned";

const cellPatch = z.object({
  q: z.number().int(),
  r: z.number().int(),
  terrainId: z.string().nullable().optional(),
  /** Дорога клетки; null — снять. Дорога ОДНА, кисть её ЗАМЕНЯЕТ. */
  roadId: z.string().nullable().optional(),
  decorationId: z.string().nullable().optional(),
  objectId: z.string().nullable().optional(),
  buildingId: z.string().nullable().optional(),
  /** Облик клетки: id картинки или null — базовый вид. Постройку не меняет. */
  buildingSkinId: z.string().nullable().optional(),
  /** Настройки постройки на этой клетке (текст таблички и т.п.). */
  buildingConfig: z.record(z.string(), z.unknown()).nullable().optional(),
  /** Настройки объекта на этой клетке: HP, цена входа, награды. */
  objectConfig: z.record(z.string(), z.unknown()).nullable().optional(),
  /** Тир постройки на этой клетке — правится из окна клетки тем же пакетом. */
  tier: z.number().int().min(0).optional(),
  /** Жив ли объект: false — «добыт». Той же очередью, что и слои, иначе
   *  «погасить» отменялось бы выгрузкой этой же клетки. */
  alive: z.boolean().optional(),
  /** Купол ПОВЕРХ клетки: true — накрыть, false — снять. Не слой: пишет
   *  одну свою колонку и ничего под собой не переписывает. */
  voidFog: z.boolean().optional(),
  /** Объединённый блок: id блока или null — вывести клетку из блока. */
  groupId: z.string().min(1).max(64).nullable().optional(),
  /** Масштаб картинки блока 1.00 … 2.00; null — как есть (снимается с блоком). */
  iconScale: z.number().min(ICON_SCALE_MIN).max(ICON_SCALE_MAX).nullable().optional(),
});

export const patchSchema = cellPatch.refine(
  (c) =>
    assertOblivionCell(`${c.q},${c.r}`, c.buildingConfig) &&
    assertNoUsdtCell(`${c.q},${c.r}`, c.buildingConfig),
);

export type AdminCellPatch = z.infer<typeof patchSchema>;
