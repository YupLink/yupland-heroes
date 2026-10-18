// Пак фишек со счёта.
//
// Отдельной SQL-функцией (`buy_chip_pack_from_account`), а не веткой в живой
// `buy_chip_pack_atomic`: у той больше 25 тысяч покупок, пять вызовов и крон.
// Ронять её ради ветки, которой пользуется один кошелёк, — платить всей игрой
// за админский эксперимент.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg, sb } from "../db/pg";
import { requirePayoutsAdmin } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { accAccountId, accBalance } from "./currency/move";
import { moneyGate } from "../rateGate";
import { requireAccountUser } from "./account-rollout";

/** Чем платим со счёта. Звёзды — такой же ресурс счёта, как и Darai. */
const PAY_TOKENS = ["Darai", "STARS"] as const;
type PayToken = (typeof PAY_TOKENS)[number];

export const buyChipPackFromAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        packId: z.string().min(1).max(64),
        count: z.number().int().min(1).max(50).default(1),
        /** Один на нажатие. Внутри цикла к нему добавляется номер пака. */
        opId: z.string().min(8).max(40),
        /** Валюта счёта: Darai по умолчанию (обратная совместимость). */
        token: z.enum(PAY_TOKENS).default("Darai"),
        /** Цена в звёздах, которую видел игрок: курс вырос сильнее 2 % — отказ. */
        shown: z.number().positive().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = await requireAccountUser();
    await moneyGate("cpack-acc", wallet);

    const pack = await pg.chipPacks.findOne({ id: data.packId });
    if (!pack) throw new Error("Пак не найден");
    if (pack.market_hidden) throw new Error("Этот пак только для раздач");

    const token: PayToken = data.token;
    // Звёзды — от цены в DARAI по курсу (владелец, 07.10.2026); нет курса или
    // цены в DARAI — прежняя фиксированная цена в звёздах.
    const starsDynamic =
      token === "STARS" && pack.price_darai != null
        ? await (async () => {
            const { daraiRate, starsFromDarai } = await import("./darai-stars");
            return starsFromDarai(pack.price_darai, await daraiRate());
          })()
        : null;
    if (starsDynamic != null) {
      const { assertShownPrice } = await import("@/lib/usdTariff");
      assertShownPrice(data.shown, starsDynamic);
    }
    const price = token === "STARS" ? (starsDynamic ?? pack.price_stars) : pack.price_darai;
    if (price == null) {
      throw new Error(
        token === "STARS" ? "У этого пака нет цены в звёздах" : "У этого пака нет цены в $DARAI",
      );
    }

    const account = await accAccountId(wallet);
    if (!account) throw new Error("Не найден аккаунт для кошелька");

    const grantIds: string[] = [];
    let balance = 0;

    for (let i = 0; i < data.count; i++) {
      // Номер обязателен: без него десять паков за одно нажатие схлопнулись бы
      // в одну выдачу — ключ-то был бы один и тот же.
      const { data: rows, error } = await sb.rpc("buy_chip_pack_from_account", {
        p_wallet: wallet,
        p_pack_id: data.packId,
        p_account: account,
        p_token: token,
        p_price: price,
        p_idk: `${data.opId}:${i}`,
      });
      if (error) {
        const msg = String(error.message ?? "");
        const notEnough = msg.match(/not_enough_currency:([^:]+):([\d.-]+):([\d.-]+)/);
        if (notEnough) {
          throw new Error(
            `Не хватает ${notEnough[1]}: нужно ${Number(notEnough[3])}, есть ${Number(notEnough[2])}` +
              (i > 0 ? `. Выдано паков: ${i}` : ""),
          );
        }
        if (/pack_not_found/.test(msg)) throw new Error("Пак не найден");
        if (/pack_inactive/.test(msg)) throw new Error("Пак неактивен");
        if (/pack_not_started/.test(msg)) throw new Error("Продажи ещё не начались");
        if (/pack_ended/.test(msg)) throw new Error("Продажи завершены");
        if (/sold_out/.test(msg)) throw new Error("Тираж распродан");
        throw new Error(msg || "Не удалось купить пак со счёта");
      }
      const row = (rows as Array<{
        grant_id: string;
        acc_balance: number;
        applied: boolean;
      }> | null)?.[0];
      // applied=false значит «номер выдачи уже занят»: ни списания, ни пака.
      // Молча класть его в список означало бы отчитаться о покупке, которой
      // не было, — и о трате, которой не было тоже.
      if (row?.applied === false) {
        throw new Error("Ключ операции уже использован — повтори покупку заново");
      }
      if (row?.grant_id) grantIds.push(row.grant_id);
      balance = Number(row?.acc_balance ?? balance);
    }

    // Реферал зреет с первой покупки пака — и оплата со счёта теперь основной
    // путь, так что отметку ставим здесь тоже, иначе тир не начисляется.
    if (grantIds.length > 0) {
      const { noteReferralPurchase } = await import("../referralQualify");
      await noteReferralPurchase(wallet).catch(() => undefined);
    }

    return {
      ok: true as const,
      grantIds,
      count: grantIds.length,
      token,
      spent: Number(price) * grantIds.length,
      balance: balance || (await accBalance(wallet, token)),
    };
  });
