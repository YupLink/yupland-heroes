import { createFileRoute } from "@tanstack/react-router";
import { pg } from "@/server/db/pg";
import { openAppButton, tgSendMessage } from "@/server/tg";
import { handlePayoutCallback, handleBatchPayoutCallback } from "@/server/adminPayouts";
import { getUserLang } from "@/server/userLang";
import { tFor } from "@/lib/i18n";

// Telegram webhook endpoint. Receives raw Updates from Bot API and links the
// reporting Telegram user to the wallet that originally requested the
// challenge (one-time nonce passed via /start). Permanent 1-to-1 binding
// is enforced by the UNIQUE index on users.telegram_id.

interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
  language_code?: string;
}
interface TgSuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
}
interface TgUpdate {
  message?: {
    text?: string;
    from?: TgUser;
    chat?: { id: number };
    successful_payment?: TgSuccessfulPayment;
  };
  callback_query?: {
    id: string;
    from: TgUser;
    data?: string;
  };
  pre_checkout_query?: {
    id: string;
    from: TgUser;
    currency: string;
    total_amount: number;
    invoice_payload: string;
  };
}

function maskWallet(wallet: string): string {
  return wallet.length > 12 ? wallet.replace(/^(.{6}).+(.{4})$/, "$1…$2") : wallet;
}

async function failChallenge(nonce: string, message: string): Promise<void> {
  await pg.tgChallenges.update({ nonce }, { consumed: true, error_message: message });
}

async function processStart(text: string, from: TgUser, chatId: number) {
  // Язык юзера: сохранённый в БД (setMyLang) → язык устройства Telegram → ru.
  const lang = await getUserLang(from.id, from.language_code);
  // /start ref<tg_id> — пользователь пришёл по реферальной ссылке.
  // Шлём приветствие + кнопку открыть mini-app с уже подставленным
  // ?ref=tg<id>. Клиент в connectWallet передаст его на сервер,
  // там пишется inviter_wallet и считается tier.
  const refMatch = text.match(/^\/start(?:@\S+)?\s+ref(\d+)$/);
  if (refMatch) {
    const inviterTgId = refMatch[1];
    // Переход по реф-ссылке — в статистику (ref_click).
    await import("@/server/referralClick").then((m) =>
      m.noteRefClick(inviterTgId, from.id, "wallet"),
    );
    const { openAppButtonWithRef } = await import("@/server/tg");
    await tgSendMessage(chatId, tFor(lang, "bot.welcome_ref"), {
      replyMarkup: openAppButtonWithRef(`tg${inviterTgId}`),
    });
    return;
  }

  const m = text.match(/^\/start(?:@\S+)?\s+auth_([\w-]{12,})/);
  if (!m) {
    // /start без auth-токена или /app — приветствие с кнопкой Mini App.
    await tgSendMessage(chatId, tFor(lang, "bot.welcome"), {
      replyMarkup: openAppButton,
    });
    return;
  }
  const nonce = m[1];

  const challenge = await pg.tgChallenges.findOne({ nonce });

  if (!challenge) {
    await tgSendMessage(chatId, tFor(lang, "bot.link_invalid"));
    return;
  }
  if (challenge.consumed) {
    await tgSendMessage(chatId, tFor(lang, "bot.link_used"));
    return;
  }
  if (new Date(challenge.expires_at) < new Date()) {
    await failChallenge(nonce, "Срок ссылки истёк, создай новую.");
    await tgSendMessage(chatId, tFor(lang, "bot.link_expired"));
    return;
  }

  const me = await pg.users.findOne({ wallet: challenge.wallet });

  if (me?.detached) {
    const errMsg = "Этот кошелёк был отвязан от Telegram. Повторная привязка невозможна.";
    await failChallenge(nonce, errMsg);
    await tgSendMessage(chatId, tFor(lang, "bot.wallet_detached"));
    return;
  }

  if (me?.telegram_id && me.telegram_id !== from.id) {
    const errMsg = "К этому кошельку уже привязан другой Telegram. Привязка постоянная.";
    await failChallenge(nonce, errMsg);
    await tgSendMessage(chatId, tFor(lang, "bot.wallet_other_tg"));
    return;
  }

  if (me?.telegram_id === from.id) {
    await failChallenge(nonce, "");
    await tgSendMessage(
      chatId,
      tFor(lang, "bot.wallet_already_yours", {
        wallet: maskWallet(challenge.wallet),
      }),
    );
    return;
  }

  try {
    await pg.users.update(
      { wallet: challenge.wallet },
      {
        telegram_id: from.id,
        telegram_username: from.username ?? null,
        telegram_linked_at: new Date().toISOString(),
      },
    );
  } catch {
    const errMsg = "Не удалось привязать. Попробуй ещё раз.";
    await failChallenge(nonce, errMsg);
    await tgSendMessage(chatId, tFor(lang, "bot.link_failed"));
    return;
  }

  await pg.tgChallenges.update({ nonce }, { consumed: true });

  // Дедуп: если у этого TG теперь два sister-кошелька и у обоих есть
  // referrals (например один зашёл по реф-ссылке до привязки TG, другой
  // по другой ссылке после) — оставляем первый по времени, остальные
  // удаляем. Один TG = одна реф-награда. Best-effort.
  try {
    const { dedupReferralsForTg } = await import("@/server/referralDedup");
    await dedupReferralsForTg(from.id);
  } catch (err) {
    console.warn("[processStart] dedup referrals failed:", err);
  }

  await tgSendMessage(
    chatId,
    tFor(lang, "bot.linked_ok", { wallet: maskWallet(challenge.wallet) }),
    { replyMarkup: openAppButton },
  );
}

export const Route = createFileRoute("/api/tg-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Secret-token валидация (защита от подделки апдейтов, критично для
        // приёма Stars-платежей и «одобрить выплату»). Секрет задан и вебхук
        // зарегистрирован с ним — без секрета отказ (аудит 11.11.2026: раньше
        // пустой TG_WEBHOOK_SECRET пускал поддельные платежи и одобрения).
        const wantSecret = process.env.TG_WEBHOOK_SECRET;
        if (!wantSecret || request.headers.get("x-telegram-bot-api-secret-token") !== wantSecret) {
          return new Response("forbidden", { status: 403 });
        }

        let update: TgUpdate;
        try {
          update = (await request.json()) as TgUpdate;
        } catch {
          return new Response("bad json", { status: 400 });
        }

        // ── Telegram Stars (server/tgStarsUpdate): счета этого бота, выставленные до 02.11.
        //    Идёт ДО текст-гейта (successful_payment — message без text).
        const { handleStarsUpdate } = await import("@/server/tgStarsUpdate");
        if (await handleStarsUpdate(update, "wallet")) return new Response("ok");

        const text = update.message?.text;
        const from = update.message?.from;
        const chatId = update.message?.chat?.id;
        if (text && from && chatId) {
          try {
            if (text.startsWith("/start")) {
              await processStart(text, from, chatId);
            } else if (text.startsWith("/app")) {
              const lang = await getUserLang(from.id, from.language_code);
              await tgSendMessage(chatId, tFor(lang, "bot.open_app"), {
                replyMarkup: openAppButton,
              });
            }
          } catch (err) {
            // Не показываем юзеру детали — но логируем для отладки
            console.error("tg-webhook error", err);
          }
        }

        // Inline-кнопка callback — для admin-payouts approve/reject
        const cb = update.callback_query;
        if (cb && cb.data) {
          try {
            if (cb.data.startsWith("apb:")) {
              // Батч-выплата — обрабатываем ПЕРВЫМ (apb: совпадает по
              // префиксу с ap: иначе бы попало в одиночную ветку).
              await handleBatchPayoutCallback({
                callbackId: cb.id,
                fromTgId: cb.from.id,
                fromUsername: cb.from.username ?? null,
                data: cb.data,
              });
            } else if (cb.data.startsWith("ap:")) {
              await handlePayoutCallback({
                callbackId: cb.id,
                fromTgId: cb.from.id,
                fromUsername: cb.from.username ?? null,
                data: cb.data,
              });
            }
          } catch (err) {
            console.error("tg-webhook callback error", err);
          }
        }

        // Telegram ждёт 200 в любом случае, иначе ретраит апдейт
        return new Response("ok");
      },
    },
  },
});
