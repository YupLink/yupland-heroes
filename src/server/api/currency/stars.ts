// Пополнение единого счёта за Telegram Stars.
//
// Звёзды — внутренний невыводимый ресурс: их можно завести на счёт и потратить
// на ресурсы, но вывести нельзя (вывод Stars — прерогатива самого Telegram,
// мы физически не раздаём их обратно). Поэтому ft_contract у STARS пустой, а
// вывод в интерфейсе просто не предлагается.
//
// Оплата всегда происходит ВНУТРИ Telegram: в мини-аппе — нативно
// (WebApp.openInvoice), из браузера — переходом по ссылке t.me. Куда бы ни
// нажал игрок, звёзды приходят на баланс бота, а к счёту привязываются по
// telegram_id плательщика из вебхука — см. api.tg-webhook.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../../db/pg";
import { requireAccountUser } from "../account-rollout";
import { actionGate } from "../../rateGate";
import { STARS_TOKEN, STARS_MIN, STARS_MAX } from "@/lib/stars";
import { getSessionTgId } from "../../auth";
import { starsAllowed } from "@/lib/auth/entryRules";

/** Идентификатор заказа в payload (≤128 байт, ставит СЕРВЕР — доверенный). */
type StarsPayload = { k: "acc_stars"; tg: number; o: number };

/**
 * Создать счёт на пополнение звёздами. Ничего не начисляет — только готовит
 * ссылку. Начисление придёт вебхуком после реальной оплаты.
 */
export const createAccountStarsInvoice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ amountStars: z.number().int().min(STARS_MIN).max(STARS_MAX) }).parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireAccountUser();
    await actionGate("stars-invoice", wallet);

    // Звёздами платят только из Telegram — значит telegram_id обязателен. Без
    // него платить нечем: скажем прямо, а не отдадим битую ссылку.
    const row = (await pg.users.findOne({ wallet })) as { telegram_id?: number | null } | null;
    const tg = row?.telegram_id ?? null;
    // Номер Google или кошелька — не Telegram (§8.127): звёзды пришли бы тому, кто
    // заплатил в Telegram, а не этому аккаунту.
    if (!tg || !starsAllowed(tg) || !starsAllowed(getSessionTgId())) {
      throw new Error("Пополнение звёздами доступно только при входе через Telegram");
    }

    const payload: StarsPayload = { k: "acc_stars", tg: Number(tg), o: data.amountStars };
    const { createStarsInvoiceLink } = await import("../../tg");
    const link = await createStarsInvoiceLink({
      title: "Пополнение счёта",
      description: `${data.amountStars}★ на счёт YupLink`,
      payload: JSON.stringify(payload),
      amountStars: data.amountStars,
      label: `${data.amountStars}★`,
    });
    if (!link) throw new Error("Не удалось создать счёт — попробуй позже");
    return { link, amountStars: data.amountStars };
  });

/**
 * Зачислить оплаченные звёзды на счёт. Вызывается ТОЛЬКО из вебхука по
 * successful_payment. Идемпотентно дважды: star_payments UNIQUE по charge_id
 * (первый писатель) и acc_move по (kind, ref) — повтор апдейта Telegram ничего
 * не задвоит.
 */
export async function creditAccountStars(opts: {
  chargeId: string;
  tgId: number;
  amountStars: number;
}): Promise<{ credited: boolean; balance: number }> {
  if (!(opts.amountStars > 0)) return { credited: false, balance: 0 };

  // Кошелёк аккаунта по telegram_id — любой sister годится, счёт общий по TG.
  const { data: urows } = await pg.users
    .raw()
    .select("wallet")
    .eq("telegram_id", opts.tgId)
    .limit(1);
  const wallet = (urows as Array<{ wallet: string }> | null)?.[0]?.wallet;
  if (!wallet) {
    console.error("[stars] нет кошелька для tg", opts.tgId);
    return { credited: false, balance: 0 };
  }

  // Квитанция платежа — первый писатель выигрывает, повтор получает 0 строк.
  const { mcpExec } = await import("../../db/mcpClient");
  const { sqlStr } = await import("../chips-utils");
  const { nanoid } = await import("nanoid");
  const won = (await mcpExec(
    `INSERT INTO yuplink.star_payments(id, telegram_payment_charge_id, telegram_id, wallet, kind, amount_stars, granted)
     VALUES (${sqlStr(`sp_${nanoid(14)}`)}, ${sqlStr(opts.chargeId)}, ${opts.tgId}, ${sqlStr(wallet)}, 'acc_stars', ${opts.amountStars}, true)
     ON CONFLICT (telegram_payment_charge_id) DO NOTHING
     RETURNING id;`,
    { wrapJsonCte: true },
  )) as Array<{ id: string }>;
  if (!won || won.length === 0) {
    // Уже зачтено — вернём текущий баланс, не двигая его.
    const { accBalance } = await import("./move");
    return { credited: false, balance: await accBalance(wallet, STARS_TOKEN) };
  }

  const { accMove } = await import("./move");
  const res = await accMove({
    wallet,
    token: STARS_TOKEN,
    delta: opts.amountStars,
    kind: "acc_stars",
    ref: opts.chargeId,
  });
  return { credited: res.applied, balance: res.balance };
}
