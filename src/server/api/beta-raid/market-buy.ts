// Покупка товара в маркете: фильтр по герою → резерв запаса → списание цены
// (одной или ДВУХ) → выдача → откат. Инвариант проекта: сначала деньги, потом
// товар; при сбое выдачи — возврат ОБЕИХ цен и возврат запаса.
// Порядок шагов держит инвариант: резерв запаса ДО денег (нет товара — нет
// траты), деньги ДО выдачи, любой сбой ниже по цепочке откатывает всё выше.
import { createServerFn } from "@tanstack/react-start";
import { requireBetaRaid } from "./gate";
import { myMapId } from "./encounter-where";
import { accAccountId } from "../currency/move";
import { marketItemById } from "./market-admin";
import { assertShopAllowed } from "./market-shop";
import { assertChestGood } from "./market-chest-buyer";
import { spend, credit } from "./market-money";
import { reserveStock, releaseStock } from "./market-stock";
import { deliverGood } from "./market-deliver";
import { resolveBackpack, assertBackpackRoom, stackKeyFor } from "./market-backpack";
import { publishRaid } from "../../raidLive";
import { normalizeQty } from "./market-qty";
import { buyInput, type BuyData } from "./market-buy-input";
import { holdBuyerLimit, withBuyerLimit } from "./market-buy-limit";
import { undoFailReporter } from "./market-undo-alert";
import { noteMarketBuy } from "@/server/api/beta-raid/econ/exchange-note";
import type { MarketItem } from "@/lib/marketItem";

/** Товары, что падают в рюкзак героя. Артефакта здесь НЕТ: он штучный и живёт
 *  в инвентаре (user_game_item), иначе его нельзя надеть — а полный рюкзак
 *  зря запрещал бы покупку. */
const GOES_TO_BACKPACK = (kind: MarketItem["kind"]): boolean =>
  kind === "boss" || kind === "custom";

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

    const account = await accAccountId(wallet);
    if (!account) throw new Error("market.need_account");

    // Фильтр покупателя — ОБЩИЙ на весь магазин (клетку), не по товару.
    await assertShopAllowed(wallet, mapId, item.q, item.r);
    await assertChestGood(wallet, item); // сундук — только Торговцу, до денег

    const qty = normalizeQty(data.qty);

    // ПРЕДпроверка рюкзака — ДО запаса и денег: нет героя или рюкзак полон →
    // бросок сейчас, покупка не спишет ни монеты. Товары в рюкзак — art|boss|
    // custom; паки/герои/ресурсы идут прежними путями и рюкзак не трогают.
    if (GOES_TO_BACKPACK(item.kind)) {
      const bp = await resolveBackpack(wallet);
      if (!bp) throw new Error("market.need_hero");
      await assertBackpackRoom(bp, await stackKeyFor(item), qty);
    }

    // Лимит на игрока — резерв до денег, как запас; недоданное — назад.
    const hold = await holdBuyerLimit(item, account, qty);
    return withBuyerLimit(hold, qty, () =>
      buyAfterChecks({ data, wallet, mapId, item, account, qty }),
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
}) {
  const { data, wallet, mapId, item, account, qty } = c;
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const payRef = `mkt:${item.id}:${account}:${nonce}`;
  // Лавка, привязанная к ратуше, торгует складом и ценой ратуши (town-shop-trade).
  const city = await (await import("./town-shop")).cityShopAt(mapId, item.q, item.r);
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
  const p2 = item.price2Resource; // вторая цена (алхимия) — может отсутствовать

  // Выбор игрока адресован цене-артефакту: остальным видам он ничего не
  // говорит, spendArt на них его и не спросит. Обе цены сразу артефактом —
  // редкость, и одной формой pick их не развести: выбор уходит ПЕРВОЙ, вторая
  // остаётся на прежнем авто-подборе. Так покупка, работавшая раньше, не
  // превращается в отказ «не та редкость».
  const artPick = data.pick ? { artTemplateId: data.pick.templateId } : undefined;
  const pick1 = item.priceResource === "art" ? artPick : undefined;
  const pick2 = p2 === "art" && item.priceResource !== "art" ? artPick : undefined;

  /** Провал ВОЗВРАТА цены проглатывать нельзя: деньги уже списаны, а вернуть
   *  их не смогли — сигнал админам с ключом памятки op-лога (market-undo-alert). */
  const undoFail = undoFailReporter({ wallet, account, side: "buy", payRef });

  // 0) РЕЗЕРВ запаса — до денег. Нет остатка (или меньше qty) → распродано.
  if (!(await reserveStock(item.id, mapId, qty))) throw new Error("market.sold_out");

  // 1) деньги. Первая цена; при сбое — вернуть запас.
  // Квитанции spend несут stackKey/refId для отката «арта по редкости»:
  // без них credit создал бы фантомный стек art:art_any_X.
  let receipt1: Awaited<ReturnType<typeof spend>> = {};
  let receipt2: Awaited<ReturnType<typeof spend>> = {};
  try {
    receipt1 = await spend(
      wallet,
      account,
      item.priceResource,
      item.priceToken,
      item.priceAmount * qty,
      payRef,
      pick1,
    );
  } catch (e) {
    await releaseStock(item.id, mapId, qty);
    throw e;
  }
  // 1b) вторая цена (если задана). При сбое — вернуть запас и ПЕРВУЮ цену.
  if (p2 && item.price2Amount) {
    try {
      receipt2 = await spend(
        wallet,
        account,
        p2,
        item.price2Token,
        item.price2Amount * qty,
        `${payRef}:p2`,
        pick2,
      );
    } catch (e) {
      await credit(
        wallet,
        account,
        item.priceResource,
        item.priceToken,
        item.priceAmount * qty,
        `${payRef}:undo`,
        receipt1,
      ).catch(
        undoFail(item.priceResource, item.priceToken, item.priceAmount * qty, payRef, "undo"),
      );
      await releaseStock(item.id, mapId, qty);
      throw e;
    }
  }

  // 2) товар. Ничего не выдано (бросок) → вернуть ОБЕ цены и весь запас.
  let delivery;
  let delivered;
  try {
    const res = await deliverGood({ wallet, account, item, qty, payRef, nonce });
    delivery = res.target;
    delivered = res.delivered;
  } catch (e) {
    await credit(
      wallet,
      account,
      item.priceResource,
      item.priceToken,
      item.priceAmount * qty,
      `${payRef}:undo`,
      receipt1,
    ).catch(undoFail(item.priceResource, item.priceToken, item.priceAmount * qty, payRef, "undo"));
    if (p2 && item.price2Amount) {
      await credit(
        wallet,
        account,
        p2,
        item.price2Token,
        item.price2Amount * qty,
        `${payRef}:undo2`,
        receipt2,
      ).catch(undoFail(p2, item.price2Token, item.price2Amount * qty, `${payRef}:p2`, "undo2"));
    }
    await releaseStock(item.id, mapId, qty);
    throw e;
  }

  // 2b) частичная выдача (только паки: поштучный сбой после k выдач). Вернуть
  // ОБЕ цены и запас ТОЛЬКО за недоставленный остаток — игрок платит ровно за
  // то, что получил, а «сгоревшие» единицы возвращаются в продажу.
  const back = qty - delivered;
  if (back > 0) {
    await credit(
      wallet,
      account,
      item.priceResource,
      item.priceToken,
      item.priceAmount * back,
      `${payRef}:undoPart`,
      receipt1,
    ).catch(
      undoFail(item.priceResource, item.priceToken, item.priceAmount * back, payRef, "undoPart"),
    );
    if (p2 && item.price2Amount) {
      await credit(
        wallet,
        account,
        p2,
        item.price2Token,
        item.price2Amount * back,
        `${payRef}:undoPart2`,
        receipt2,
      ).catch(
        undoFail(p2, item.price2Token, item.price2Amount * back, `${payRef}:p2`, "undoPart2"),
      );
    }
    await releaseStock(item.id, mapId, back);
  }

  // Журнал сделок — за реально выданное, после всех откатов; отданный товар
  // цены — «заплатил». Сбой записи покупку не трогает (econ/trade-journal).
  if (delivered > 0) {
    const receipts = [receipt1, receipt2] as const;
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
  };
}
