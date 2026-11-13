// Скупка: витрина side='sell' — СВОЙ список позиций, не зеркало покупки.
// Админ выставляет, что магазин принимает («товар») и чем за это платит
// («цена»). Игрок отдаёт товар, получает выплату.
//
// Выплата идёт ТЕМ ЖЕ трактом, что и покупка (market-deliver.deliverGood):
// ресурс — на счёт, пак — настоящим паком, герой и артефакт — в инвентарь,
// босс/свой товар — в рюкзак. Иначе «заплатим паком» превращалось бы в мёртвый
// стек.
//
// Запас у позиции скупки читается как «сколько всего готовы принять»: резерв
// поднимаем ДО списания, при сбое возвращаем. null — берём без лимита.
//
// Инвариант проекта тот же: сначала списываем у игрока, потом выдаём; сбой
// выдачи → возврат отданного (квитанция spend несёт снятые экземпляры, чтобы
// «арт по редкости» вернулся РОВНО тем же артефактом, а не однотипным).
import { createServerFn } from "@tanstack/react-start";
import { requireBetaRaid } from "./gate";
import { myMapId } from "./encounter-where";
import { requireShopNear } from "./market-near";
import { accAccountId } from "../currency/move";
import { marketItemById } from "./market-admin";
import { assertShopAllowed } from "./market-shop";
import { assertChestGood } from "./market-chest-buyer";
import { spend, credit } from "./market-money";
import { reserveStock, releaseStock } from "./market-stock";
import { resolveBackpack, assertTradeRoom } from "./market-backpack";
import { deliverGood } from "./market-deliver";
import { normalizeQty } from "./market-qty";
import { sellInput, sellSpendPick } from "./market-sell-input";
import { payoutMeta } from "./market-payout-meta";
import { reportUndoFailure } from "./market-undo-alert";
import { ITEM_PAY, TO_BACKPACK, WHOLE_ONLY, goodAsPrice, payoutAsGood } from "./market-sell-good";
import { noteMarketSell } from "@/server/api/beta-raid/econ/exchange-note";
import { publishRaid } from "../../raidLive";
import type { MarketPriceResource } from "@/lib/marketItem";

// Вид отдаваемого товара живёт в market-sell-good.ts; экспорт оставлен на месте.
export { goodAsPrice } from "./market-sell-good";

export const sellMarketItem = createServerFn({ method: "POST" })
  .inputValidator(sellInput)
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    const item = await marketItemById(data.itemId, mapId);
    if (!item || item.q !== data.q || item.r !== data.r) throw new Error("market.not_found");
    // Продать можно только то, что магазин выставил на скупку. Позиция витрины
    // покупки сюда не годится: там цена — то, что игрок платит.
    if (item.side !== "sell") throw new Error("market.wrong_side");
    await requireShopNear(wallet, mapId, item.q, item.r);

    const account = await accAccountId(wallet);
    if (!account) throw new Error("market.need_account");

    // Фильтр торгующих — ОБЩИЙ на магазин, одинаковый для обеих витрин.
    await assertShopAllowed(wallet, mapId, item.q, item.r);

    const qty = normalizeQty(data.qty);
    // Лавка, привязанная к ратуше, платит золотом по кривой ратуши (town-shop-trade).
    const city = await (await import("./town-shop")).cityShopAt(mapId, item.q, item.r);
    if (city) {
      const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const payRef = `mkt-sell:${item.id}:${account}:${nonce}`;
      const { citySell } = await import("./town-shop-trade");
      return citySell({
        wallet,
        account,
        mapId,
        item,
        qty,
        city,
        expect: data.expect,
        pick: data.pick,
        payRef,
        nonce,
      });
    }
    const good = goodAsPrice(item);
    const goodAmount = item.giveAmount * qty;
    const payouts: Array<{ res: MarketPriceResource; token: string | null; amount: number }> = [
      { res: item.priceResource, token: item.priceToken, amount: item.priceAmount * qty },
    ];
    if (item.price2Resource && item.price2Amount) {
      payouts.push({
        res: item.price2Resource,
        token: item.price2Token,
        amount: item.price2Amount * qty,
      });
    }

    for (const p of payouts) {
      // Дробная выплата паками/героями невыдаваема — отказываем ДО списания,
      // иначе игрок отдал бы товар за половину пака.
      if (WHOLE_ONLY(p.res) && !Number.isInteger(p.amount)) throw new Error("market.bad_qty");
      if (ITEM_PAY(p.res) && !p.token) throw new Error("market.give_failed");
    }

    // Подписи выплат — ДО списания: после него ради строки текста пришлось бы
    // катить откат сделки или писать в рюкзак голый id.
    const payoutMetas = await Promise.all(payouts.map((p) => payoutMeta(p.res, p.token)));
    // Выплата сундуком (переработка) — тоже получение: только Торговцу, до списания.
    for (const [i, p] of payouts.entries())
      await assertChestGood(wallet, payoutAsGood(item, p.res, p.token, payoutMetas[i] ?? null));

    // Место в рюкзаке — ДО списания и СРАЗУ на все выплаты (раздельные проверки
    // обе проходили, и вторая выплата пропадала). Ключи — канонические, с именем,
    // как у выдачи: «Помидор» и «Помидоры» — одна ячейка. Отданный товар уходит
    // со стопки рюкзака раньше выплаты — его место считается освобождённым.
    const { canonStackKey } = await import("./item-alias");
    const toBag = await Promise.all(
      payouts
        .map((p, i) => ({ p, name: payoutMetas[i]?.name ?? item.name }))
        .filter(({ p }) => TO_BACKPACK(p.res) && p.token)
        .map(async ({ p, name }) => ({
          stackKey: await canonStackKey(p.res, p.token, name),
          qty: p.amount,
        })),
    );
    if (toBag.length > 0) {
      const bp = await resolveBackpack(wallet);
      if (!bp) throw new Error("market.need_hero");
      await assertTradeRoom(bp, toBag, [{ res: good.res, token: good.token, amount: goodAmount }]);
    }

    const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const payRef = `mkt-sell:${item.id}:${account}:${nonce}`;

    // 0) лимит скупки — до списания: магазин не берёт сверх выставленного.
    if (!(await reserveStock(item.id, mapId, qty))) throw new Error("market.buyout_full");

    // 1) списание у игрока — то, что он продаёт (giveAmount × qty).
    let receipt: Awaited<ReturnType<typeof spend>> = {};
    try {
      // Что именно отдаёт игрок и какого износа — решает sellSpendPick по позиции.
      const pick = sellSpendPick(item, data.pick);
      receipt = await spend(wallet, account, good.res, good.token, goodAmount, payRef, pick);
    } catch (e) {
      await releaseStock(item.id, mapId, qty);
      throw e;
    }
    /** Вернуть игроку долю отданного и столько же лимита скупки. */
    const undoGood = async (share: number, tag: string) => {
      if (share <= 0) return;
      const amount = Math.round(goodAmount * share * 1000) / 1000;
      const undoRef = `${payRef}:${tag}`;
      // Провал ВОЗВРАТА молчать не имеет права: товар у игрока уже забрали.
      // Артефакт при этом исчезает совсем — строка инвентаря удалена, и вернуть
      // её можно только руками по памятке op-лога. Поэтому вместо пустого catch
      // сигнал админам с ключом памятки (см. market-undo-alert).
      await credit(wallet, account, good.res, good.token, amount, undoRef, receipt).catch((e) =>
        reportUndoFailure(
          {
            wallet,
            account,
            side: "sell",
            res: good.res,
            token: good.token,
            amount,
            spendRef: payRef,
            undoRef,
          },
          e,
        ),
      );
      // Лимит скупки возвращаем в любом случае: позиция не должна «съесть»
      // остаток за сделку, которой не было.
      await releaseStock(item.id, mapId, Math.round(qty * share * 1000) / 1000);
    };

    // 2) выплата. Первая не прошла — сделки не было, товар возвращаем целиком.
    let paidAny = false;
    // Доля реально доставленного по КАЖДОЙ выплате; недодача бывает только у
    // паков (они выдаются поштучно).
    let minRatio = 1;
    for (const [i, p] of payouts.entries()) {
      try {
        const res = await deliverGood({
          wallet,
          account,
          item: payoutAsGood(item, p.res, p.token, payoutMetas[i] ?? null),
          qty: p.amount,
          payRef: `${payRef}:pay${i}`,
          nonce: `${nonce}p${i}`,
        });
        minRatio = Math.min(minRatio, res.delivered / p.amount);
        paidAny = true;
      } catch (e) {
        if (!paidAny) {
          await undoGood(1, "undo");
          throw e;
        }
        // Первая выплата уже у игрока, а забрать её обратно можно не всегда
        // (пак/герой ушли в инвентарь). Товар тогда НЕ возвращаем: иначе у
        // игрока остались бы и товар, и выплата. Вторая просто не доехала.
        // Сданный герой оплачен — его снимок закрываем (market-pawn.settlePawn).
        if (receipt.paidHeroes?.length)
          await (
            await import("./market-pawn")
          ).settlePawn({ wallet, account, mapId, item, receipt, minRatio: 0 });
        throw new Error("market.give_failed");
      }
    }
    // Недодали часть — возвращаем ровно такую же часть товара и лимита: игрок
    // расплачивается за то, что получил, а не за обещанное.
    if (minRatio < 1) await undoGood(1 - minRatio, "part");

    // Журнал сделок — за реально принятую долю, обе стороны обмена (полученное
    // товаром — «купил» без золота); сбой записи сделку не трогает.
    void noteMarketSell({
      item,
      account,
      mapId,
      qty,
      ratio: minRatio,
      payouts,
      receipt,
      ref: payRef,
    });

    // Ломбард (market-pawn): снимок сданного героя закрыт выплатой (paid_at), а
    // сданное встаёт на витрину покупки с наценкой — только за целиком принятую
    // сделку. Сбой — не сделке игрока.
    // Рюкзак сданного героя — мешочком на клетку основного: dropped — для окна.
    const dropped =
      receipt.paidArts?.length || receipt.paidHeroes?.length
        ? await (
            await import("./market-pawn")
          ).settlePawn({ wallet, account, mapId, item, receipt, minRatio })
        : null;

    // Учебная продажа считается только после выплаты, отдельно от самой сделки.
    if (minRatio >= 1 && mapId.startsWith("isle_") && item.id === `${mapId}_sell_goldIngot`)
      await (await import("./island/short-tutorial-service"))
        .noteShortTutorialSale(account, mapId, item.id)
        .catch((e: unknown) => console.warn("[island] продажа:", e));
    // Остаток скупки виден всем сразу — без перезагрузки клетки.
    publishRaid({ mapId, type: "built", cells: [`${data.q},${data.r}`] });
    return { ok: true as const, sold: qty, name: item.name, dropped };
  });
