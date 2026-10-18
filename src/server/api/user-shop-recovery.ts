import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { z } from "zod";
import { pg } from "../db/pg";
import { getCurrentWallet, requirePayoutsAdmin } from "../auth";
import { getSisterWallets } from "./user-shared";
import { invalidateTicketsCache } from "./user-tickets-shared";
import { verifyFtTransfer } from "../near";
import { applyDiscountCeil, fetchSubscriptionDiscount } from "./user-shop-subscription";

const TOKEN_BURN_RECEIVER = "darai_gdrop.near";

/**
 * АДМИН: ручной подбор «осиротевшего» FT-платежа.
 *
 * Когда юзер подписал ft_transfer DARAI → TOKEN_BURN_RECEIVER, но
 * фронт НЕ дошёл до purchaseTicketsViaToken (закрыл вкладку, отвалилась
 * сеть и т.п.) — в ticket_purchases записи нет, билеты не зачислены.
 */
export const adminClaimOrphanFtPurchase = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        txHash: z.string().min(20),
        offerId: z.string().min(1),
        senderWallet: z.string().min(2),
        quantity: z.number().int().positive().max(50).default(1),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requirePayoutsAdmin();

    const offer = await pg.ticketShopOffers.findFirst({
      id: data.offerId,
      active: true,
    });
    if (!offer) throw new Error("Оффер не найден или отключён");
    if (!offer.payment_token || !offer.price_token)
      throw new Error("Этот оффер не за токены");

    const tok = await pg.rewardTokens.findOne({ symbol: offer.payment_token });
    if (!tok) throw new Error(`Токен ${offer.payment_token} не сконфигурирован`);

    const qty = data.quantity;
    const totalTickets = offer.tickets * qty;
    // Принимаем ровно ту цену, которую игрок и должен был заплатить: базовая
    // минус его подписочная скидка (максимум 15%). Раньше здесь стояло
    // «половина базы» с комментарием про скидку до 50% — такой скидки в
    // проекте нет, и билеты уходили за полцены через «восстановить покупку».
    const minAcceptable = applyDiscountCeil(
      offer.price_token * qty,
      (await fetchSubscriptionDiscount(data.senderWallet)).discountPct,
    );

    const sisters = await getSisterWallets(data.senderWallet);
    const allowedSenders = Array.from(new Set([data.senderWallet, ...sisters]));

    const LEGACY_RECEIVERS = ["darai_duplo.near"];
    let paidHuman = 0;
    let actualSender = "";
    let lastErr: Error | null = null;
    for (const recv of [TOKEN_BURN_RECEIVER, ...LEGACY_RECEIVERS]) {
      try {
        const r = await verifyFtTransfer({
          txHash: data.txHash,
          senderAccount: allowedSenders,
          ftContract: tok.ft_contract,
          expectedReceiver: recv,
          minAmountHuman: minAcceptable,
          decimals: tok.decimals,
        });
        paidHuman = r.paidHuman;
        actualSender = r.actualSender;
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
      }
    }
    if (lastErr) throw lastErr;

    const idempotencyKey = `ft:${data.txHash}`;
    const existing = await pg.ticketPurchases.findFirst({
      idempotency_key: idempotencyKey,
    });
    if (existing) {
      invalidateTicketsCache(allowedSenders);
      return {
        ok: true,
        alreadyCredited: true as const,
        wallet: existing.wallet,
        ticketsAdded: existing.tickets_added,
      };
    }

    await pg.ticketPurchases.insert({
      id: `tp_${nanoid(10)}`,
      wallet: actualSender || data.senderWallet,
      offer_id: offer.id,
      tickets_added: totalTickets,
      energy_spent: 0,
      yupland_tx_id: null,
      payment_token: offer.payment_token,
      payment_amount: paidHuman,
      near_tx_hash: data.txHash,
      idempotency_key: idempotencyKey,
    });
    // Баланс живёт в леджере; ref = ключ идемпотентности покупки,
    // поэтому парные реализации в разных файлах не задвоят билеты.
    {
      const { moveTickets } = await import("./tickets-ledger");
      await moveTickets({
        wallet: actualSender || data.senderWallet,
        delta: totalTickets,
        kind: "purchase",
        ref: idempotencyKey,
      });
    }
    invalidateTicketsCache(allowedSenders);
    return {
      ok: true,
      alreadyCredited: false as const,
      wallet: actualSender || data.senderWallet,
      ticketsAdded: totalTickets,
    };
  });

/**
 * ЮЗЕР сам восстанавливает «осиротевшую» покупку билетов по txHash.
 * Подписал ft_transfer на приёмник, но фронт не дошёл до purchaseTicketsViaToken.
 * Идемпотентно по ft:txHash.
 */
export const recoverMyTicketPurchase = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        txHash: z.string().min(20),
        offerId: z.string().min(1),
        quantity: z.number().int().positive().max(50).default(1),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");

    const offer = await pg.ticketShopOffers.findFirst({
      id: data.offerId,
      active: true,
    });
    if (!offer) throw new Error("Оффер не найден или отключён");
    if (!offer.payment_token || !offer.price_token)
      throw new Error("Этот оффер не за токены");
    const tok = await pg.rewardTokens.findOne({ symbol: offer.payment_token });
    if (!tok) throw new Error(`Токен ${offer.payment_token} не сконфигурирован`);

    const qty = data.quantity;
    const totalTickets = offer.tickets * qty;
    // Принимаем ровно ту цену, которую игрок и должен был заплатить: базовая
    // минус его подписочная скидка (максимум 15%). Раньше здесь стояло
    // «половина базы» с комментарием про скидку до 50% — такой скидки в
    // проекте нет, и билеты уходили за полцены через «восстановить покупку».
    const minAcceptable = applyDiscountCeil(
      offer.price_token * qty,
      (await fetchSubscriptionDiscount(wallet)).discountPct,
    );

    const sisters = await getSisterWallets(wallet);
    const allowedSenders = Array.from(new Set([wallet, ...sisters]));

    const LEGACY_RECEIVERS = ["darai_duplo.near"];
    let paidHuman = 0;
    let actualSender = "";
    let lastErr: Error | null = null;
    for (const recv of [TOKEN_BURN_RECEIVER, ...LEGACY_RECEIVERS]) {
      try {
        const r = await verifyFtTransfer({
          txHash: data.txHash,
          senderAccount: allowedSenders,
          ftContract: tok.ft_contract,
          expectedReceiver: recv,
          minAmountHuman: minAcceptable,
          decimals: tok.decimals,
        });
        paidHuman = r.paidHuman;
        actualSender = r.actualSender;
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
      }
    }
    if (lastErr) throw lastErr;

    const idempotencyKey = `ft:${data.txHash}`;
    const existing = await pg.ticketPurchases.findFirst({
      idempotency_key: idempotencyKey,
    });
    if (existing) {
      invalidateTicketsCache(allowedSenders);
      return {
        ok: true,
        alreadyCredited: true as const,
        ticketsAdded: existing.tickets_added,
      };
    }
    await pg.ticketPurchases.insert({
      id: `tp_${nanoid(10)}`,
      wallet: actualSender || wallet,
      offer_id: offer.id,
      tickets_added: totalTickets,
      energy_spent: 0,
      yupland_tx_id: null,
      payment_token: offer.payment_token,
      payment_amount: paidHuman,
      near_tx_hash: data.txHash,
      idempotency_key: idempotencyKey,
    });
    // Баланс живёт в леджере; ref = ключ идемпотентности покупки,
    // поэтому парные реализации в разных файлах не задвоят билеты.
    {
      const { moveTickets } = await import("./tickets-ledger");
      await moveTickets({
        wallet: actualSender || wallet,
        delta: totalTickets,
        kind: "purchase",
        ref: idempotencyKey,
      });
    }
    invalidateTicketsCache(allowedSenders);
    return {
      ok: true,
      alreadyCredited: false as const,
      ticketsAdded: totalTickets,
    };
  });

