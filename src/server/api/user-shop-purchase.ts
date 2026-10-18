import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { z } from "zod";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { requireFreshClient } from "../buildGate";
import { getSisterWallets, requireLinkedTelegram } from "./user-shared";
import { portalProfile } from "./user-portal-profile";
import { invalidateTicketsCache } from "./user-tickets-shared";
import { verifyFtTransfer } from "../near";
import { fetchSubscriptionDiscount, applyDiscountCeil } from "./user-shop-subscription";

const TOKEN_BURN_RECEIVER = "darai_gdrop.near";

/**
 * Покупка билетов за FT-токены.
 *
 * Поток:
 *   1. Клиент сам подписывает ft_transfer на TOKEN_BURN_RECEIVER нужной
 *      суммы (paymentToken priceToken) активным wallet'ом.
 *   2. Получает tx_hash → шлёт сюда вместе с offerId.
 *   3. Сервер дёргает NEAR RPC, проверяет: signer = текущий wallet,
 *      receiver = ftContract, action = ft_transfer на TOKEN_BURN_RECEIVER,
 *      amount >= priceToken * 10^decimals, status = SuccessValue.
 *   4. Если ок — INSERT в ticket_purchases с idempotencyKey=`ft:<txHash>`
 *      (UNIQUE защита от повторного зачисления одной тем же tx).
 */
export const purchaseTicketsViaToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        offerId: z.string().min(1),
        txHash: z.string().min(20),
        quantity: z.number().int().positive().max(50).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    assertNotMaintenance();
    requireFreshClient();
    // Тот же гейт, что и у второй копии этой ручки: после раскатки счёта
    // оплата подписью кошелька закрыта, и обходить её через сплит нельзя.
    const { assertWalletPurchaseAllowed } = await import("./account-rollout");
    await assertWalletPurchaseAllowed();
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    await requireLinkedTelegram(wallet);

    const offer = await pg.ticketShopOffers.findFirst({
      id: data.offerId,
      active: true,
    });
    if (!offer) throw new Error("Оффер не найден или отключён");
    if (!offer.payment_token || !offer.price_token) {
      throw new Error("Этот оффер не за токены");
    }

    const tok = await pg.rewardTokens.findOne({ symbol: offer.payment_token });
    if (!tok) throw new Error(`Токен ${offer.payment_token} не сконфигурирован`);

    const qty = data.quantity;
    const totalPriceBase = offer.price_token * qty;
    const sub = await fetchSubscriptionDiscount(wallet);
    const totalPrice = applyDiscountCeil(totalPriceBase, sub.discountPct);
    const totalTickets = offer.tickets * qty;

    const sisters = await getSisterWallets(wallet);
    const allowedSenders = Array.from(new Set([wallet, ...sisters]));
    const { paidHuman, actualSender } = await verifyFtTransfer({
      txHash: data.txHash,
      senderAccount: allowedSenders,
      ftContract: tok.ft_contract,
      expectedReceiver: TOKEN_BURN_RECEIVER,
      minAmountHuman: totalPrice,
      decimals: tok.decimals,
    });

    const creditedWallet = actualSender || wallet;
    const idempotencyKey = `ft:${data.txHash}`;
    try {
      await pg.ticketPurchases.insert({
        id: `tp_${nanoid(10)}`,
        wallet: creditedWallet,
        offer_id: offer.id,
        tickets_added: totalTickets,
        energy_spent: 0,
        yupland_tx_id: null,
        payment_token: offer.payment_token,
        payment_amount: paidHuman,
        near_tx_hash: data.txHash,
        idempotency_key: idempotencyKey,
      });
      // Баланс живёт в леджере; ref = ключ идемпотентности покупки, поэтому
      // повторный вызов с тем же txHash денег не задвоит.
      const { moveTickets } = await import("./tickets-ledger");
      await moveTickets({
        wallet: creditedWallet,
        delta: totalTickets,
        kind: "purchase",
        ref: idempotencyKey,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isUniqueViolation = /23505|duplicate|idempotency_key|unique constraint/i.test(msg);
      if (isUniqueViolation) {
        const existing = await pg.ticketPurchases.findFirst({
          idempotency_key: idempotencyKey,
        });
        if (existing) {
          invalidateTicketsCache(allowedSenders);
          return {
            ok: true,
            ticketsAdded: existing.tickets_added,
            paymentToken: existing.payment_token ?? offer.payment_token,
            paymentAmount: existing.payment_amount ?? paidHuman,
            quantity: qty,
            alreadyCredited: true as const,
          };
        }
      }
      throw new Error(`Не удалось записать покупку: ${msg}`);
    }

    invalidateTicketsCache(allowedSenders);
    return {
      ok: true,
      ticketsAdded: totalTickets,
      paymentToken: offer.payment_token,
      paymentAmount: paidHuman,
      quantity: qty,
      alreadyCredited: false as const,
    };
  });

export const purchaseTicketsViaEnergy = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        offerId: z.string().min(1),
        quantity: z.number().int().positive().max(50).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    await requireLinkedTelegram(wallet);

    const offer = await pg.ticketShopOffers.findFirst({
      id: data.offerId,
      active: true,
    });
    if (!offer) throw new Error("Оффер не найден или отключён");

    const { sbPublic } = await import("../db/pg");
    const profile = await portalProfile<{ id?: string; energy_balance?: number | null }>(
      wallet,
      "id,energy_balance",
    );
    if (!profile) {
      throw new Error("Профиль Yupland не найден для этого кошелька");
    }

    const qty = data.quantity;
    // Только предложение с ценой в энергии: у токеновой строки и тарифа в $ её
    // нет, и списание нуля отдало бы билеты даром.
    (await import("./user-shop-usd")).assertEnergyOffer(offer);
    const totalEnergyBase = offer.price_energy * qty;
    const sub = await fetchSubscriptionDiscount(wallet);
    const totalEnergy = applyDiscountCeil(totalEnergyBase, sub.discountPct);
    const totalTickets = offer.tickets * qty;

    if ((profile.energy_balance ?? 0) < totalEnergy) {
      throw new Error("Недостаточно энергии");
    }

    const idempotencyKey = `gd:tickets:${nanoid(16)}`;

    // Списание относительным выражением под условием, а не записью абсолюта:
    // два одновременных запроса читали один и тот же остаток, оба проходили
    // проверку «хватает» и записывали одно и то же число — энергия снималась
    // один раз, а билеты начислялись дважды.
    const { data: debited, error: upErr } = await sbPublic.rpc("gd_debit_energy", {
      p_profile: profile.id,
      p_amount: totalEnergy,
    });
    const updated = Array.isArray(debited) ? debited[0] : debited;
    if (upErr || !updated) {
      throw new Error("Не удалось списать энергию (не хватило или гонка запросов)");
    }

    await sbPublic.from("energy_transactions").insert({
      user_id: profile.id,
      amount: -totalEnergy,
      transaction_type: "partner_debit",
      currency: "energy",
      description: `golden-drop tickets ×${qty}`,
      idempotency_key: idempotencyKey,
    });

    await pg.ticketPurchases.insert({
      id: `tp_${nanoid(10)}`,
      wallet,
      offer_id: offer.id,
      tickets_added: totalTickets,
      energy_spent: totalEnergy,
      yupland_tx_id: null,
      idempotency_key: idempotencyKey,
    });
    {
      const { moveTickets } = await import("./tickets-ledger");
      await moveTickets({ wallet, delta: totalTickets, kind: "purchase", ref: idempotencyKey });
    }

    return {
      ok: true,
      ticketsAdded: totalTickets,
      energySpent: totalEnergy,
      newEnergyBalance: updated.energy_balance,
      quantity: qty,
    };
  });
