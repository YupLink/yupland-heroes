// Ввод покупки в маркете — вынесено из market-buy.ts (лимит размера файла, §13.1).
import { z } from "zod";
import { QTY_CAP } from "./market-qty";

export const buyInput = (d: unknown) =>
  z
    .object({
      q: z.number().int(),
      r: z.number().int(),
      itemId: z.string(),
      // Покупка N штук за раз. Кап QTY_CAP (999) — защита от опечатки/абуза. Дробное
      // отсекает normalizeQty: количество всегда целое, дробится только цена.
      qty: z.number().positive().max(QTY_CAP).default(1),
      // Каким артефактом платить, если цена — «любой арт редкости X» (сервер
      // проверяет владение и редкость; без него — самые старые свободные).
      pick: z.object({ templateId: z.string().min(1) }).optional(),
      // Лавка города: сколько игрок видел к оплате. Цена выросла — отказ.
      expect: z.number().nonnegative().optional(),
    })
    .parse(d);

export type BuyData = ReturnType<typeof buyInput>;
