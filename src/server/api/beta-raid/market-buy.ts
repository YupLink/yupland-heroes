// Покупка товара в маркете: фильтр по герою → резерв запаса → списание цены
// (всех ингредиентов, до пяти — market-buy-pay) → выдача → откат. Инвариант
// проекта: сначала деньги, потом товар; при сбое выдачи — возврат ВСЕЙ цены и
// возврат запаса.
// Порядок шагов держит инвариант: резерв запаса ДО денег (нет товара — нет
// траты), деньги ДО выдачи, любой сбой ниже по цепочке откатывает всё выше.
import { createServerFn } from "@tanstack/react-start";
import { requireBetaRaid } from "./gate";
import { myMapId } from "./encounter-where";
import { requireShopNear } from "./market-near";
import { accAccountId } from "../currency/move";
import { marketItemById } from "./market-admin";
import { assertShopAllowed } from "./market-shop";
import { assertChestGood } from "./market-chest-buyer";
import type { SpendReceipt } from "./market-money";
import { payAll, refundAll, type PayCtx } from "./market-buy-pay";
import { allPrices } from "@/lib/marketPrices";
import { reserveStock, releaseStock } from "./market-stock";
import { deliverGood } from "./market-deliver";
import { assertBuyRoom } from "./market-buy-room";
import { publishRaid } from "../../raidLive";
import { normalizeQty } from "./market-qty";
import { buyInput, type BuyData } from "./market-buy-input";
import { holdBuyerLimit, withBuyerLimit } from "./market-buy-limit";
import { undoFailReporter } from "./market-undo-alert";
import { noteMarketBuy } from "@/server/api/beta-raid/econ/exchange-note";
import type { MarketItem } from "@/lib/marketItem";
import type { RecipePrize } from "@/lib/marketRecipe";
import type { CityShop } from "./town-shop";

export const buyMarketItem = createServerFn({ method: "POST" })
  .inputValidator(buyInput)
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    const item: MarketItem | null = await marketItemById(data.itemId, mapId);
    if (!item || item.q !== data.q || item.r !== data.r) throw new Error("market.not_found");
    // Витрина скупки покупкой не берётся: там магазин ПЛАТИТ за товар, и
    // купить такую позицию значило бы вывернуть сделку наизнанку.
    if (item.side === "sell") throw new Error("market.wrong_side");
    await requireShopNear(wallet, mapId, item.q, item.r);

    const account = await accAccountId(wallet);
    if (!account) throw new Error("market.need_account");

    // Фильтр покупателя — ОБЩИЙ на весь магазин (клетку), не по товару.
    await assertShopAllowed(wallet, mapId, item.q, item.r);
    await assertChestGood(wallet, item); // сундук — только Торговцу, до денег
    // Дерево/камень — только пока шаблон годен (админ мог снять «Срубить» или кирку), до денег.
    if (item.kind === "tree" || item.kind === "rock") {
      await (await import("./tree/tree-admin")).assertTreeForSale(item.refId, item.kind);
    }

    // Земля — только пока местность жива, и пока мир строителей открыт игроку.
    if (item.kind === "land") {
      const { canUseFeature } = await import("../testers");
      if (!(await canUseFeature(wallet, "builder_world"))) throw new Error("land.closed");
      await (await import("./land/land-admin")).assertLandForSale(item.refId);
    }
    // Жила — только с настоящим видом (золото / алмазы), до денег.
    if (item.kind === "vein") (await import("./vein/vein-admin")).assertVeinForSale(item.refId);
    // Постройка — только пока шаблон жив и не стал шахтой, до денег.
    if (item.kind === "building") {
      const { assertBuildingForSale } = await import("./building-sale/bsale-admin");
      // Товар на шаблоне постройки — что продаётся сейчас (снимок для чертежа).
      Object.assign(item, await assertBuildingForSale(item.refId, item.building));
    }

    const qty = normalizeQty(data.qty);
    // Лавка, привязанная к ратуше, торгует складом и ценой ратуши (town-shop-trade).
    const city = await (await import("./town-shop")).cityShopAt(mapId, item.q, item.r);

    // ПРЕДпроверка рюкзака — ДО запаса и денег, с учётом цены товаром из этого
    // же рюкзака (market-buy-room). Паки/герои/ресурсы рюкзак не трогают.
    await assertBuyRoom(wallet, item, qty, city != null);

    // Лимит на игрока — резерв до денег, как запас; недоданное — назад.
    const hold = await holdBuyerLimit(item, account, qty);
    return withBuyerLimit(hold, qty, () =>
      buyAfterChecks({ data, wallet, mapId, item, account, qty, city }),
    );
  });

/** Покупка после проверок: лавка ратуши или обычная лавка. */
async function buyAfterChecks(c: {
  data: BuyData;
  wallet: string;
  mapId: string;
  item: MarketItem;
  account: string;
  qty: number;
  city: CityShop | null;
}) {
  const { data, wallet, mapId, item, account, qty, city } = c;
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const payRef = `mkt:${item.id}:${account}:${nonce}`;
  if (city) {
    const { cityBuy } = await import("./town-shop-trade");
    return cityBuy({
      wallet,
      account,
      mapId,
      item,
      qty,
      city,
      expect: data.expect,
      payRef,
      nonce,
    });
  }
  // Все ингредиенты цены: первая, вторая («алхимия»), ещё до трёх (§8.104 п. 1а).
  const lines = allPrices(item);

  // Выбор игрока адресован цене-артефакту: остальным видам он ничего не
  // говорит, spendArt на них его и не спросит. Две цены сразу артефактом —
  // редкость, и одной формой pick их не развести: выбор уходит ПЕРВОЙ
  // строке-артефакту, остальные — на прежнем авто-подборе. Так покупка,
  // работавшая раньше, не превращается в отказ «не та редкость».
  const artPick = data.pick ? { artTemplateId: data.pick.templateId } : undefined;
  const firstArt = lines.findIndex((l) => l.resource === "art");
  const picks = lines.map((_, i) => (i === firstArt ? artPick : undefined));

  /** Провал ВОЗВРАТА цены проглатывать нельзя: деньги уже списаны, а вернуть
   *  их не смогли — сигнал админам с ключом памятки op-лога (market-undo-alert). */
  const undoFail = undoFailReporter({ wallet, account, side: "buy", payRef });
  const pay: PayCtx = { wallet, account, lines, payRef, picks, undoFail };

  // 0) РЕЗЕРВ запаса — до денег. Нет остатка (или меньше qty) → распродано.
  if (!(await reserveStock(item.id, mapId, qty))) throw new Error("market.sold_out");

  // 1) деньги — все строки цены по очереди; сбой — списанное назад, запас назад.
  // Квитанции spend несут stackKey/refId для отката «арта по редкости»:
  // без них credit создал бы фантомный стек art:art_any_X.
  let receipts: SpendReceipt[];
  try {
    receipts = await payAll(pay, qty);
  } catch (e) {
    await releaseStock(item.id, mapId, qty);
    throw e;
  }

  // 2) товар. Ничего не выдано (бросок) → вернуть ВСЮ цену и весь запас.
  let delivery;
  let delivered;
  let prizes: RecipePrize[] | undefined; // рецепт: что выпало (market-recipe)
  try {
    const res = await deliverGood({ wallet, account, item, qty, payRef, nonce });
    ({ target: delivery, delivered, prizes } = res);
  } catch (e) {
    await refundAll(pay, receipts, qty, "undo");
    await releaseStock(item.id, mapId, qty);
    throw e;
  }

  // 2b) частичная выдача (паки, рецепт: поштучный сбой после k выдач). Вернуть
  // цену и запас ТОЛЬКО за недоставленный остаток — игрок платит ровно за то,
  // что получил, а «сгоревшие» единицы возвращаются в продажу.
  const back = qty - delivered;
  if (back > 0) {
    await refundAll(pay, receipts, back, "undoPart");
    await releaseStock(item.id, mapId, back);
  }

  // Журнал сделок — за реально выданное, после всех откатов; отданный товар
  // цены — «заплатил». Сбой записи покупку не трогает (econ/trade-journal).
  if (delivered > 0) {
    void noteMarketBuy({ item, account, mapId, qty, delivered, receipts, ref: payRef });
  }

  publishRaid({ mapId, type: "built", cells: [`${data.q},${data.r}`] });
  return {
    ok: true as const,
    name: item.name,
    // Реально выданное количество (при частичном сбое < запрошенного).
    qty: delivered,
    // Куда попал товар — клиент по этому полю точечно инвалидирует ключи.
    delivery,
    toAccount: delivery === "account",
    prizes: prizes ?? null,
  };
}
