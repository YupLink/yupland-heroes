// Платёж звёздами в апдейте Telegram — общий для обоих ботов (server/tg.ts: с 02.11.2026 счета
// выставляет игровой @yupland_heroes_bot, старые счета @yuplink_bot дообрабатывает он сам).
//  · pre_checkout_query — ответить в течение 10 с, иначе Telegram отменит платёж; отвечает тот
//    же бот, чей счёт. Проверяем только свой payload (acc_stars / hw_chips) и XTR.
//  · successful_payment — выдать товар идемпотентно (star_payments по charge_id + acc_move).
// Вернул true — апдейт платёжный и обработан, вебхук отвечает 200 и дальше не смотрит.
import { answerPreCheckoutQuery, tgSendMessage, type TgBot } from "./tg";

type TgPayer = { id: number; language_code?: string };

export type StarsUpdate = {
  message?: {
    from?: TgPayer;
    successful_payment?: {
      currency: string;
      total_amount: number;
      invoice_payload: string;
      telegram_payment_charge_id: string;
    };
  };
  pre_checkout_query?: {
    id: string;
    from: TgPayer;
    currency: string;
    total_amount: number;
    invoice_payload: string;
  };
};

type Payload = { k?: string; o?: string | number };

const parse = (raw: string): Payload | null => {
  try {
    return JSON.parse(raw) as Payload;
  } catch {
    return null; // payload не наш
  }
};

/** Наш ли счёт: пополнение счёта звёздами или фишки Прихожей, валюта — звёзды. */
export function starsPayloadOk(currency: string, payload: string, total: number): boolean {
  const p = parse(payload);
  if (!p || currency !== "XTR") return false;
  return (p.k === "hw_chips" && typeof p.o === "string") || (p.k === "acc_stars" && total > 0);
}

/** Сообщение плательщику от того бота, которому он заплатил. */
async function tell(bot: TgBot, payer: TgPayer, text: string): Promise<void> {
  if (bot === "wallet") {
    await tgSendMessage(payer.id, text);
    return;
  }
  const [{ gameBotSend, gamePlayButton }, { getUserLang }, { tFor }] = await Promise.all([
    import("./tgGameBot"),
    import("./userLang"),
    import("@/lib/i18n"),
  ]);
  const lang = await getUserLang(payer.id, payer.language_code);
  await gameBotSend(payer.id, text, gamePlayButton(tFor(lang, "bot.game_play")));
}

export async function handleStarsUpdate(update: StarsUpdate, bot: TgBot): Promise<boolean> {
  const pcq = update.pre_checkout_query;
  if (pcq) {
    try {
      const ok = starsPayloadOk(pcq.currency, pcq.invoice_payload, Number(pcq.total_amount));
      await answerPreCheckoutQuery(pcq.id, ok, ok ? undefined : "Счёт недействителен", bot);
    } catch (err) {
      console.error(`tg-stars(${bot}) pre_checkout error`, err);
    }
    return true;
  }

  const sp = update.message?.successful_payment;
  const payer = update.message?.from;
  if (!sp) return false;
  if (!payer) return true;
  try {
    const p = parse(sp.invoice_payload);
    if (p?.k === "acc_stars" && sp.currency === "XTR") {
      // Пополнение счёта: сумма — из самого платежа (total_amount), не из payload.
      const { creditAccountStars } = await import("./api/currency/stars");
      const res = await creditAccountStars({
        chargeId: sp.telegram_payment_charge_id,
        tgId: payer.id,
        amountStars: sp.total_amount,
      });
      if (res.credited) {
        await tell(
          bot,
          payer,
          `✅ Зачислено <b>${sp.total_amount}</b>★ на счёт. Баланс: <b>${res.balance}</b>★.`,
        );
      }
    } else if (p?.k === "hw_chips" && typeof p.o === "string" && sp.currency === "XTR") {
      const { grantStarHallwayChips } = await import("./hallwayStars");
      const res = await grantStarHallwayChips({
        chargeId: sp.telegram_payment_charge_id,
        tgId: payer.id,
        offerId: p.o,
        amountStars: sp.total_amount,
      });
      if (res.granted) {
        await tell(
          bot,
          payer,
          `✅ Начислено <b>${res.count}</b> тренировочных фишек. Открой прихожу и выпускайся в игру!`,
        );
      }
    }
  } catch (err) {
    console.error(`tg-stars(${bot}) successful_payment error`, err);
  }
  return true;
}
