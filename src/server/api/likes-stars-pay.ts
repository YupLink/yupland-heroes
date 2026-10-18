// Покупка пакета лайков за звёзды — списанием со счёта.
//
// Отдельным файлом, а не веткой в buyLikePackage: тот путь платит билетами и
// его логика начисления уже сложна. Здесь другой источник денег (STARS со
// счёта), но тот же итог — лайки в userLikeBalance, идемпотентно.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { assertNotMaintenance } from "../maintenance";
import { moneyGate } from "../rateGate";
import { requireAccountUser } from "./account-rollout";
import { accMove } from "./currency/move";

export const buyLikesWithStars = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        offerId: z.string().min(1).max(64),
        quantity: z.number().int().min(1).max(50).default(1),
        /** Один на нажатие — против двойного списания при ретрае. */
        opId: z.string().min(8).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = await requireAccountUser();
    await moneyGate("likes-stars", wallet);

    const offer = await pg.likeShopOffers.findOne({ id: data.offerId, active: true });
    if (!offer) throw new Error("Пакет не найден или отключён");
    if (offer.price_stars == null) throw new Error("Этот пакет не продаётся за звёзды");

    const qty = data.quantity;
    const totalLikes = offer.likes * qty;
    const price = offer.price_stars * qty;
    const ref = `likestars:${data.offerId}:${data.opId}`;

    // Сначала СПИСАНИЕ звёзд — идемпотентно по ref. Повтор нажатия вернёт
    // applied=false и лайки второй раз не начислит.
    const spend = await accMove({
      wallet,
      token: "STARS",
      delta: -price,
      kind: "acc_spend",
      ref,
    });
    if (!spend.applied) {
      throw new Error("Эта покупка уже проведена — обнови баланс");
    }

    // Звёзды списаны — начисляем лайки. Расход в like_purchases для истории и
    // второй страховки идемпотентности (UNIQUE по ключу).
    try {
      await pg.likePurchases
        .insert({
          id: `lp_${nanoid(10)}`,
          wallet,
          tickets_spent: 0,
          likes_added: totalLikes,
          idempotency_key: ref,
          created_at: new Date().toISOString(),
        })
        .catch(() => undefined);

      const { likeAccountId, addLikes } = await import("../likesAccount");
      await addLikes(await likeAccountId(wallet), totalLikes, "lifetime_purchased", `stars:${ref}`);
    } catch (e) {
      // Начисление упало ПОСЛЕ списания — возвращаем звёзды, чтобы не пропали.
      await accMove({
        wallet,
        token: "STARS",
        delta: price,
        kind: "acc_refund",
        ref: `${ref}-undo`,
      }).catch(() => undefined);
      throw e;
    }

    const { invalidateTicketsCache } = await import("./user");
    invalidateTicketsCache(wallet);

    return { ok: true as const, likesAdded: totalLikes, spentStars: price, balance: spend.balance };
  });
