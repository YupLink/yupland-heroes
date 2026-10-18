// Схема клеток в «Сохранить» редактора карт (adminSaveHexMap).
//
// Вынесена из raid-hexmap.ts (файл за лимитом строк) без изменений, кроме
// правила «Забвения»: конфиг постройки, где у алтаря (boost.effects) или храма
// (oblivion) неверная пара «уровень + минуты», не сохраняется — отказ называет
// клетку (lib/hero/oblivionRule.ts, ПРАВИЛА §8.17). И USDT: шахта и грядка платят
// без предела — их наградой USDT не ставится (ПРАВИЛА §8.49а).
import { z } from "zod";
import { assertOblivionCell } from "@/lib/oblivionConfig";
import { assertNoUsdtCell } from "@/lib/usdtBanned";

const hexCellInput = z.object({
  terrainId: z.string().nullable(),
  /** Дорога клетки; null — её нет. Склейку старого клиента разберём. */
  roadId: z.string().nullable().optional(),
  objectId: z.string().nullable().optional(),
  objectConfig: z.unknown().optional(),
  // Чисто визуальный декор (дерево/куст) — накладывается на terrain,
  // без взаимодействия. Отдельное поле, не objectId.
  decorationId: z.string().nullable().optional(),
  // Постройка: объект, который меняет облик за ресурс.
  buildingId: z.string().nullable().optional(),
  // Настройки ЭТОЙ постройки на ЭТОЙ клетке: у дерева уровней здесь
  // лежат цены прокачки, заданные админом для конкретного дерева.
  buildingConfig: z.unknown().optional(),
  // Купол глухого тумана поверх клетки. Едет вместе с ней и
  // возвращается как есть: без этого «Сохранить» из редактора молча
  // снимал бы купола, поставленные кистью прямо в игре.
  voidFog: z.boolean().optional(),
});

/** Все клетки карты, ключ — «q,r». */
export const hexCellsInput = z
  .record(z.string(), hexCellInput)
  .refine((cells) =>
    Object.entries(cells).every(
      ([key, v]) =>
        assertOblivionCell(key, v.buildingConfig) && assertNoUsdtCell(key, v.buildingConfig),
    ),
  );
