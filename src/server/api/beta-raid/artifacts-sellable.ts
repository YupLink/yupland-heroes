// Что игрок может сдать в маркет из артефактов — список для пикера.
//
// ПОЧЕМУ отдельная ручка. Позиция скупки «любой обычный артефакт» не должна
// решать за игрока, какой из ста обычных уйдёт за золото: у артефактов разные
// статы, и «сервер взял самый старый» — это лотерея, а не сделка. Клиент
// показывает список, игрок тычет, выбор уезжает в sellMarketItem как
// pick.templateId, а сервер там ещё раз проверяет владение и редкость.
//
// Надетое в список НЕ попадает: раздевать героя ради продажи маркет не будет.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBetaRaid } from "./gate";
import { accAccountId } from "../currency/move";
import { listFreeArtifacts, type SellableArt } from "./art-stock";

const input = (d: unknown) =>
  z
    .object({
      // Редкость витрины: 'common' | 'rare' | 'epic' | 'legendary'. Не задана —
      // весь свободный инвентарь (именная позиция скупки, где выбирать нечего).
      rarity: z.string().min(1).optional(),
    })
    .parse(d ?? {});

/** Свободные артефакты игрока, схлопнутые по шаблону. Нет аккаунта — пусто. */
export const listSellableArtifacts = createServerFn({ method: "GET" })
  .inputValidator(input)
  .handler(async ({ data }): Promise<SellableArt[]> => {
    const wallet = await requireBetaRaid();
    const account = await accAccountId(wallet);
    if (!account) return [];
    return listFreeArtifacts(account, data.rarity ?? null);
  });
