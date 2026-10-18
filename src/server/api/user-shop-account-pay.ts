// Покупка билетов со счёта — без похода в блокчейн.
//
// Отдельным файлом, а не веткой в user-shop.ts: тот монолит и так на 1282
// строки, и лезть в живой платёжный путь ради новой ветки — верный способ
// сломать работающее.
//
// Деньги и билеты двигает ОДНА SQL-функция. Раньше это были два вызова с
// общим ключом, и два параллельных запроса с разным количеством делили ключ
// между собой: деньги списывал дешёвый, билеты начислял дорогой.
//
// Ключ операции приходит С КЛИЕНТА и генерится один раз на нажатие. Это не
// каприз: серверный ключ на каждый вызов уже стоил игрокам двойных списаний
// (purchaseTicketsViaEnergy — ретрай клиента списывал энергию второй раз).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg, sb } from "../db/pg";
import { requirePayoutsAdmin } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { accAccountId } from "./currency/move";
import { moneyGate } from "../rateGate";
import { requireAccountUser } from "./account-rollout";

export const buyTicketsFromAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        offerId: z.string().min(1).max(64),
        quantity: z.number().int().positive().max(50).default(1),
        /** Один на нажатие. Ретрай того же нажатия не должен списывать дважды. */
        opId: z.string().min(8).max(40),
        /**
         * Валюта счёта: токен оффера по умолчанию, либо звёзды. У строки в DARAI
         * звёзды и USDT считаются от DARAI по курсу, у тарифа в $ — всё от $.
         */
        token: z.enum(["offer", "STARS", "USDT", "Darai"]).default("offer"),
        /** Цена, которую видел игрок (тариф в $): курс вырос сильнее допуска — отказ. */
        shown: z.number().positive().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = await requireAccountUser();
    await moneyGate("shop-acc", wallet);

    const offer = await pg.ticketShopOffers.findFirst({ id: data.offerId, active: true });
    if (!offer) throw new Error("Оффер не найден или отключён");

    const account = await accAccountId(wallet);
    if (!account) throw new Error("Не найден аккаунт для кошелька");

    const qty = data.quantity;
    const tickets = offer.tickets * qty;

    // Звёзды — фиксированная цена оффера, без скидок подписки (скидки заведены
    // под токеновые цены). Токеновая оплата — как была, со скидкой вверх.
    let payToken: string;
    let price: number;
    const { offerUsd, offerDarai } = await import("./user-shop-usd");
    const usd = offerUsd(offer);
    const darai = offerDarai(offer);
    const dynamicFromDarai =
      darai != null && (data.token === "STARS" || data.token === "USDT")
        ? await (async () => {
            // Цена в DARAI — якорь (владелец, 07.10.2026): звёзды и USDT от неё
            // по курсу, в соотношениях подписки. Нет курса — прежние звёзды.
            const { fetchSubscriptionDiscount } = await import("./user-shop-subscription");
            const { pricesFromDarai } = await import("@/lib/usdTariff");
            const rate = (await (await import("./energy-sub/rate")).daraiPerUsd())?.rate ?? null;
            return pricesFromDarai(darai, rate, (await fetchSubscriptionDiscount(wallet)).discountPct);
          })()
        : null;
    if (dynamicFromDarai && (data.token === "STARS" || data.token === "USDT")) {
      const one = dynamicFromDarai[data.token];
      if (one == null) throw new Error("Не удалось посчитать цену");
      const { assertShownPrice } = await import("@/lib/usdTariff");
      payToken = data.token;
      price = data.token === "USDT" ? Math.round(one * qty * 100) / 100 : one * qty;
      assertShownPrice(data.shown, price);
    } else if (usd != null) {
      // Тариф в $ (07.10.2026): USDT / DARAI по курсу / звёзды — как у подписки.
      if (data.token === "offer") throw new Error("Выбери, чем платить: USDT, DARAI или звёзды");
      const { fetchSubscriptionDiscount } = await import("./user-shop-subscription");
      const { usdPriceOrThrow, assertShownPrice } = await import("@/lib/usdTariff");
      const disc = (await fetchSubscriptionDiscount(wallet)).discountPct;
      const rate =
        data.token === "Darai"
          ? ((await (await import("./energy-sub/rate")).daraiPerUsd())?.rate ?? null)
          : null;
      const one = usdPriceOrThrow(usd, data.token, rate, disc);
      payToken = data.token;
      price = data.token === "USDT" ? Math.round(one * qty * 100) / 100 : one * qty;
      assertShownPrice(data.shown, price);
    } else if (data.token === "USDT") {
      throw new Error(
        darai != null ? "Курс DARAI сейчас недоступен — оплати DARAI" : "Этот оффер не продаётся за USDT",
      );
    } else if (data.token === "Darai" && darai == null) {
      throw new Error("Этот оффер не продаётся за DARAI");
    } else if (data.token === "STARS") {
      if (offer.price_stars == null) throw new Error("Этот оффер не продаётся за звёзды");
      payToken = "STARS";
      price = offer.price_stars * qty;
    } else {
      if (!offer.payment_token || !offer.price_token) {
        throw new Error("Этот оффер не за токены");
      }
      const { fetchSubscriptionDiscount, applyDiscountCeil } =
        await import("./user-shop-subscription");
      const sub = await fetchSubscriptionDiscount(wallet);
      // Скидку округляем ВВЕРХ — как в оплате переводом, иначе со счёта будет
      // дешевле, чем с кошелька, и появится арбитраж на ровном месте.
      payToken = offer.payment_token;
      price = applyDiscountCeil(offer.price_token * qty, sub.discountPct);
    }

    const { data: rows, error } = await sb.rpc("buy_tickets_from_account", {
      p_wallet: wallet,
      p_offer: offer.id,
      p_account: account,
      p_token: payToken,
      p_price: price,
      p_tickets: tickets,
      p_idk: data.opId,
    });
    if (error) {
      const msg = String(error.message ?? "");
      const notEnough = msg.match(/not_enough_currency:([^:]+):([\d.-]+):([\d.-]+)/);
      if (notEnough) {
        throw new Error(
          `Не хватает ${notEnough[1]}: нужно ${Number(notEnough[3])}, есть ${Number(notEnough[2])}`,
        );
      }
      if (/ref_refunded:/.test(msg)) {
        throw new Error("По этой операции уже был возврат — начни покупку заново");
      }
      if (/acc_ticket_desync:/.test(msg)) {
        throw new Error("Ключ операции уже занят — повтори покупку заново");
      }
      throw new Error(msg || "Не удалось купить билеты со счёта");
    }

    const row = (rows as Array<{
      tickets_added: number;
      acc_balance: number;
      applied: boolean;
    }> | null)?.[0];

    // Факт покупки — история, а не баланс. Дубль по ключу гасим молча:
    // билеты уже начислены внутри функции и повторно не начислятся.
    if (row?.applied) {
      await pg.ticketPurchases
        .insert({
          id: `tp_${nanoid(10)}`,
          wallet,
          offer_id: offer.id,
          tickets_added: tickets,
          energy_spent: 0,
          yupland_tx_id: null,
          payment_token: payToken,
          payment_amount: price,
          near_tx_hash: null,
          idempotency_key: `shop:${offer.id}:${account}:${tickets}:${data.opId}`,
        })
        .catch(() => undefined);
    }

    const { invalidateTicketsCache, getSisterWallets } = await import("./user");
    invalidateTicketsCache(await getSisterWallets(wallet));

    return {
      ok: true as const,
      applied: !!row?.applied,
      spent: price,
      token: payToken,
      tickets,
      balance: Number(row?.acc_balance ?? 0),
    };
  });
