// Ввод скупки и выбор игрока под списание — вынесено из market-sell.ts (лимит
// ≤250 строк): там остался тракт сделки, здесь — форма запроса и то, какой
// выбор с клиента сервер вообще готов принять.
import { z } from "zod";
import { QTY_CAP } from "./market-qty";
import { isArtAny } from "./art-rarity";
import type { SpendPick } from "./market-money";
import type { MarketItem } from "@/lib/marketItem";

export const sellInput = (d: unknown) =>
  z
    .object({
      q: z.number().int(),
      r: z.number().int(),
      itemId: z.string(),
      qty: z.number().positive().max(QTY_CAP).default(1),
      // Какой именно артефакт отдать: у позиции «любой обычный артефакт»
      // выбирает игрок, а не сервер наугад. Не пришло — прежнее поведение
      // (берём самые старые свободные нужной редкости). У «любого героя» игрок
      // выбирает КОПИИ (heroItemIds; одну — heroItemId у старого клиента из
      // кэша): уровни у копий одного шаблона разные. wear — износ выбранной
      // группы артефактов: ломбард берёт и сломанные (sellSpendPick). arts —
      // несколько артефактов разом (ломбард): группа = шаблон, износ и штук.
      pick: z
        .object({
          templateId: z.string().min(1),
          heroItemId: z.string().min(1).optional(),
          heroItemIds: z.array(z.string().min(1)).min(1).max(QTY_CAP).optional(),
          wear: z.number().min(0).max(100).optional(),
          arts: z
            .array(
              z.object({
                templateId: z.string().min(1),
                wear: z.number().min(0).max(100).optional(),
                count: z.number().int().positive(),
              }),
            )
            .min(1)
            .max(QTY_CAP)
            .optional(),
        })
        .optional(),
      // Лавка города: сколько игрок видел к получению. Цена упала — отказ.
      expect: z.number().nonnegative().optional(),
    })
    .parse(d);

export type SellData = ReturnType<typeof sellInput>;

/**
 * Выбор игрока под spend. Износ решает СЕРВЕР по позиции, а не клиент:
 * изношенный и сломанный принимает только скупка ломбарда «Любой … артефакт» —
 * его перепродажа выставляет шаблон, и покупатель получает новый, целый
 * экземпляр (владелец, 23.10.2026: «ломбард чинит арты»). Любая другая скупка
 * берёт только целые (0), что бы ни прислали: иначе маркет принимал бы
 * сломанное там, где его никто не чинит.
 * Несколько артефактов разом (arts) — тоже только ломбард, со своим износом у
 * каждой группы; у любой другой позиции перечень отбрасывается.
 */
export function sellSpendPick(
  item: Pick<MarketItem, "side" | "kind" | "refId">,
  pick: SellData["pick"],
): SpendPick {
  const pawnArt = item.side === "sell" && item.kind === "art" && isArtAny(item.refId);
  const arts = pawnArt ? pick?.arts : undefined;
  return {
    artTemplateId: pick?.templateId ?? null,
    heroItemId: pick?.heroItemId ?? null,
    heroItemIds: pick?.heroItemIds ?? null,
    artWear: pawnArt ? (pick?.wear ?? 0) : 0,
    artGroups: arts?.length
      ? arts.map((a) => ({ templateId: a.templateId, wear: a.wear ?? 0, count: a.count }))
      : null,
  };
}
