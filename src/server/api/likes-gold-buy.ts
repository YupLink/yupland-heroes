// Покупка пакета лайков за ЗОЛОТО (было — за билеты; владелец, 20.10.2026,
// ПРАВИЛА §8.61). Цена пакета в базе по-прежнему в билетах
// (like_shop_offers.tickets), платится золотом ×500 (goldForTicketPrice).
//
// Вынесено из likes.ts (файл давно за лимитом строк). Порядок — «сначала
// деньги, потом товар»: золото списывается res_move по ключу нажатия (кошелёк
// + пакет + 3-секундный бакет — двойной тап даёт тот же ключ, и второй раз база
// не проводит), потом лайки начисляются по тому же ключу (like_grant_log), а
// сорвалось начисление — золото возвращается видом like_purchase_undo.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { likeAccountId, likeRow, addLikes } from "../likesAccount";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { goldForTicketPrice } from "@/lib/ticketGold";
import { accAccountId } from "./currency/move";
import { goldMove, goldOf, goldRefund } from "./gold-move";

const KIND = "like_purchase";

export const buyLikePackage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        offerId: z.string().min(1),
        quantity: z.number().int().min(1).max(50).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    assertNotMaintenance(wallet);
    const user = await pg.users.findOne({ wallet });
    if (!user?.telegram_id) throw new Error("Нужна привязка Telegram");

    const offer = await pg.likeShopOffers.findOne({ id: data.offerId, active: true });
    if (!offer) throw new Error("Пакет не найден или отключён");

    const qty = data.quantity;
    const goldSpent = goldForTicketPrice(offer.tickets * qty);
    const totalLikes = offer.likes * qty;
    const account = await accAccountId(wallet);
    if (!account) throw new Error("Ресурсный счёт не заведён");
    const bucket = Math.floor(Date.now() / 3000);
    const ref = `lp:${wallet}:${data.offerId}:${bucket}`;
    // applied=false — этот ключ уже списан (двойное нажатие или повтор запроса
    // после записи): лайки начисляются по тому же ключу, и база второй раз их не
    // добавит — так золото не пропадёт и лайки не задвоятся. Нехватка золота —
    // отказ самого res_move («Не хватает золота: нужно N»).
    await goldMove(account, -goldSpent, KIND, ref);

    const buyerAccount = await likeAccountId(wallet);
    try {
      await addLikes(buyerAccount, totalLikes, "lifetime_purchased", ref);
    } catch (e) {
      await goldRefund(account, goldSpent, KIND, ref);
      throw e;
    }
    // История покупки — справка (билетов не брали: tickets_spent = 0). Сбой
    // записи покупку не отменяет: золото и лайки уже проведены по ключу.
    await pg.likePurchases
      .insert({
        id: `lp_${nanoid(10)}`,
        wallet,
        tickets_spent: 0,
        likes_added: totalLikes,
        idempotency_key: ref,
        created_at: new Date().toISOString(),
      })
      .catch((e: unknown) => console.warn("[likes] история покупки не записана:", ref, e));
    const bal = await likeRow(buyerAccount);

    return {
      ok: true,
      likesAdded: totalLikes,
      goldSpent,
      newLikeBalance: Number(bal.available),
      remainingGold: await goldOf(account),
    };
  });
