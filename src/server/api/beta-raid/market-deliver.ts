// Выдача купленного товара по типу (kind) × количество (qty). Вынесено из
// market-buy.ts ради лимита ≤250 строк.
//
// Куда падает товар:
//   resource        → на ресурсный счёт (credit)
//   pack            → реальный пак через grantPackToUser (cp_ → «Мои паки»/фишки,
//                     pk_ → инвентарь NFT-паков)
//   hero            → экземпляр в инвентаре user_game_item(kind='hero')
//   art             → экземпляр в инвентаре user_game_item(kind='artifact')
//   boss|custom|tree → рюкзак ВЫБРАННОГО героя (raid_hero_backpack, стек по виду;
//                      дерево — tree:<шаблон>, lib/treePlant)
//   land            → туда же: land:<местность>, штук = клеток в пачке × qty
//   recipe          → бросок по шансам, выпавшее — по своему виду (market-recipe)
//
// Контракт возврата: { target, delivered }. Все ветки, кроме pack, атомарны —
// это ОДНА многострочная вставка на весь qty, поэтому либо всё (delivered=qty),
// либо бросок (ничего не выдано, откат наверху). Пак выдаётся поштучно, отдельными
// закоммиченными вставками без общей транзакции: если после k>0 выдач упало,
// возвращаем delivered=k (НЕ бросаем), и buyMarketItem вернёт цену/запас ТОЛЬКО за
// остаток (qty−k). Иначе была бы двойная выдача — паки у игрока И деньги назад.
import { credit } from "./market-money";
import {
  resolveBackpack,
  assertBackpackRoom,
  depositToBackpack,
  stackKeyFor,
} from "./market-backpack";
import type { MarketItem, MarketPriceResource } from "@/lib/marketItem";
import { artAnyRarity, isArtAny, pickArtTemplateByRarity } from "./art-rarity";
import { grantArtifacts } from "./art-stock";
import { grantGameItems } from "./game-item-grant";

/**
 * Сколько ШТУК выдать за qty единиц товара. Дробное — отказ, а не тихое
 * округление: на выплате (market-sell.WHOLE_ONLY) дробь уже отвергается, а
 * здесь «0,5 артефакта» превращалось в целый артефакт из воздуха. Округление
 * до 1e-6 гасит только шум float (0.1 × 10), но не настоящую дробь.
 */
function wholeCount(giveAmount: number, qty: number): number {
  const count = Math.round(qty * (giveAmount || 1) * 1e6) / 1e6;
  if (!Number.isInteger(count) || count <= 0) throw new Error("market.bad_qty");
  return count;
}

/**
 * Сколько ЕДИНИЦ сделки покрыто реально выданными ШТУКАМИ. Отчитываться
 * запрошенным qty нельзя: при нуле вставок игрок платил и получал «успех».
 * Единица стоит count/qty штук, недобор округляем вниз — полунакрытая единица
 * не выдана, и покупка вернёт за неё цену.
 */
function unitsDelivered(granted: number, count: number, qty: number): number {
  if (granted >= count) return qty;
  const per = count / qty;
  return Math.max(0, Math.floor(granted / per));
}

/** Куда попал товар — для точечной инвалидации ключей на клиенте. */
export type DeliveryTarget =
  | "account"
  | "chip-packs"
  | "pack-inventory"
  | "game-items"
  | "backpack";

/** Результат выдачи: куда легло и сколько единиц реально доставлено (≤ qty).
 *  prizes — у рецепта: что выпало (market-recipe). */
export type DeliveryResult = {
  target: DeliveryTarget;
  delivered: number;
  prizes?: import("@/lib/marketRecipe").RecipePrize[];
};

export async function deliverGood(opts: {
  wallet: string;
  account: string;
  item: MarketItem;
  qty: number;
  /** База ref списания — для трассировки выдачи. */
  payRef: string;
  /** Уникальный кусок id (общий с покупкой) для детерминированных ключей строк. */
  nonce: string;
}): Promise<DeliveryResult> {
  const { wallet, account, item, qty, payRef, nonce } = opts;

  // Рецепт: бросок на каждую штуку, выпавшее — этой же выдачей (market-recipe).
  if (item.kind === "recipe") {
    const { deliverRecipe } = await import("./market-recipe");
    return deliverRecipe(opts, deliverGood);
  }

  if (item.kind === "resource") {
    if (!item.refId) throw new Error("market.give_failed");
    // Токен-товар: символ уже задан админом в give_token; без него класть
    // некуда — сервер отказывает вместо тихой пустоты.
    if (item.refId === "token" && !item.giveToken) throw new Error("market.give_failed");
    await credit(
      wallet,
      account,
      item.refId as MarketPriceResource,
      item.refId === "token" ? item.giveToken : null,
      item.giveAmount * qty,
      `${payRef}:give`,
    );
    return { target: "account", delivered: qty };
  }

  if (item.kind === "pack") {
    if (!item.refId) throw new Error("market.give_failed");
    const refId = item.refId;
    const target: DeliveryTarget = refId.startsWith("cp_") ? "chip-packs" : "pack-inventory";
    const { grantPackToUser } = await import("../packs");
    // Поштучная выдача: каждый grantPackToUser — отдельный закоммиченный insert.
    // Считаем реально выданные; при сбое после первой единицы возвращаем частичное
    // delivered, а не бросаем — полный откат наверху оставил бы игроку k паков даром.
    let delivered = 0;
    try {
      for (let i = 0; i < qty; i++) {
        await grantPackToUser({
          wallet,
          packId: refId,
          source: "buy",
          sourceRef: `${payRef}:p${i}`,
        });
        delivered++;
      }
    } catch (e) {
      if (delivered === 0) throw e; // ничего не выдано — общий откат в buyMarketItem
    }
    return { target, delivered };
  }

  if (item.kind === "hero") {
    if (!item.refId) throw new Error("market.give_failed");
    // hero_instance НЕ создаём — он появляется лениво (wakeHeroInstance) при
    // выборе/прокачке. Достаточно положить экземпляр в инвентарь.
    //
    // id строк — от nonce сделки, а не случайный nanoid: мост к базе повторяет
    // запрос вслепую, и на случайных id повтор выдавал ВТОРОГО героя за те же
    // деньги. У артефактов такой ключ был с самого начала, теперь формула одна.
    const count = wholeCount(item.giveAmount, qty);
    const granted = await grantGameItems({
      wallet,
      account,
      templateId: item.refId,
      kind: "hero",
      qty: count,
      nonce,
    });
    return { target: "game-items", delivered: unitsDelivered(granted, count, qty) };
  }

  if (item.kind === "art") {
    if (!item.refId) throw new Error("market.give_failed");
    // Артефакт кладём в ИНВЕНТАРЬ (user_game_item), как героя, а не в рюкзак.
    // В рюкзаке он был мёртвым грузом: экран экипировки читает только
    // инвентарь, поэтому купленный артефакт нельзя было ни надеть, ни сдать
    // обратно в тот же «Ломбард».
    //
    // «Любой арт редкости X» — псевдо-шаблон: подставляем НАСТОЯЩИЙ, иначе
    // строка инвентаря ссылалась бы на шаблон, которого нет.
    const templateId = isArtAny(item.refId)
      ? (await pickArtTemplateByRarity(artAnyRarity(item.refId)!)).id
      : item.refId;
    const count = wholeCount(item.giveAmount, qty);
    const granted = await grantArtifacts({ wallet, account, templateId, qty: count, nonce });
    return { target: "game-items", delivered: unitsDelivered(granted, count, qty) };
  }

  // boss | custom → рюкзак ВЫБРАННОГО героя. Место уже проверено в market-buy
  // ДО денег; здесь повторяем проверку (страховка от гонки) и кладём атомарным
  // UPSERT-стеком. Нет героя (сменили/сняли между шагами) → бросок,
  // buyMarketItem вернёт обе цены и запас.
  const bp = await resolveBackpack(wallet);
  if (!bp) throw new Error("market.need_hero");
  // Земля и жила — пачка клеток: в стопку ложится «клеток в пачке × qty»
  // (lib/landPlace, lib/veinPlace).
  const pack = item.kind === "land" || item.kind === "vein";
  const units = pack ? wholeCount(item.giveAmount, qty) : qty;
  // Постройка — чертёж (снимок шаблона, облика и настройки) и стопка по нему.
  const { ensureBlueprint, forBackpack } = await import("./building-sale/bsale-blueprint");
  if (item.kind === "building") await ensureBlueprint(item);
  const good = forBackpack(item);
  await assertBackpackRoom(bp, await stackKeyFor(good), units);
  await depositToBackpack({
    heroId: bp.heroId,
    account,
    item: good,
    qty: units,
    nonce,
    capacity: bp.capacity,
    potionCapacity: bp.potionCapacity,
  });
  return { target: "backpack", delivered: qty };
}
