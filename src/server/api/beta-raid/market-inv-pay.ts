// Оплата и возврат ШТУЧНЫМИ предметами инвентаря (user_game_item): артефакты и
// «любой герой редкости» ломбарда. Вынесено из market-money.ts (правило ≤250
// строк): там остались валюты и рюкзак, здесь — то, что живёт строкой
// инвентаря со своим id, а не числом на стеке.
//
// Именной герой (hero_<шаблон>) сюда не входит — его market-money по-прежнему
// берёт со стека рюкзака; меняет здесь только псевдо-шаблон hero_any_*.
import type { MarketPriceResource } from "@/lib/marketItem";
import type { SpendReceipt } from "./market-money";
import { spendArt, creditArt } from "./market-art-pay";
import { isHeroAny } from "./hero-any";

/** Чем сузить выбор: игрок сам ткнул в конкретный артефакт или копии героев
 *  ломбарда (heroItemIds; одна — heroItemId от старого клиента из кэша).
 *  artWear — износ выбранной группы артефактов: не 0 его ставит только скупка
 *  ломбарда (market-sell-input.sellSpendPick), остальной маркет берёт целые.
 *  artGroups — несколько артефактов разом (шаблон + износ + штук): тоже только
 *  скупка ломбарда, задан — artTemplateId/artWear не читаются (market-art-groups). */
export type SpendPick = {
  artTemplateId?: string | null;
  heroItemId?: string | null;
  heroItemIds?: string[] | null;
  artWear?: number | null;
  artGroups?: ArtGroup[] | null;
};

/** Группа выбранных артефактов: шаблон, износ группы и сколько штук из неё сдать. */
export type ArtGroup = { templateId: string; wear: number; count: number };

/**
 * Штучный ли вид — те же ветки, что у spendInventory/creditInventory ниже.
 * По нему предпроверка места (assertTradeRoom) знает, что цена НЕ освободит
 * ячейку рюкзака.
 */
export const paysFromInventory = (res: MarketPriceResource, token: string): boolean =>
  res === "art" || (res === "hero" && isHeroAny(token));

/** Списать штучный предмет. null — вид не штучный: решает market-money (рюкзак). */
export async function spendInventory(
  res: MarketPriceResource,
  wallet: string,
  account: string,
  token: string,
  amount: number,
  ref: string,
  pick?: SpendPick,
): Promise<SpendReceipt | null> {
  if (res === "art") return spendArt(wallet, account, token, amount, ref, pick);
  if (res === "hero" && isHeroAny(token)) {
    const { spendPawnHero } = await import("./hero-pawn-take");
    return spendPawnHero(wallet, account, token, amount, ref, pick);
  }
  return null;
}

/** Вернуть/выдать штучный предмет. false — вид не штучный: решает market-money. */
export async function creditInventory(
  res: MarketPriceResource,
  wallet: string,
  account: string,
  token: string,
  amount: number,
  ref: string,
  receipt?: SpendReceipt,
): Promise<boolean> {
  if (res === "art") {
    await creditArt(wallet, account, token, amount, ref, receipt);
    return true;
  }
  if (res === "hero" && isHeroAny(token)) {
    // «Любого героя» выдать нечем — только вернуть снятого по квитанции. Без
    // неё бросок (алерт о провале возврата), а не стек «hero_any_rare» в рюкзаке.
    if (!receipt?.paidHeroes?.length) throw new Error("market.give_failed");
    const { restorePawnHeroes } = await import("./hero-pawn-take");
    await restorePawnHeroes(receipt.paidHeroes, amount);
    return true;
  }
  return false;
}
