// Вебхук игрового бота @yupland_heroes_bot: на /start и /app — кнопка «Играть»
// (мини-апка сразу в игре). Реф-ссылка t.me/yupland_heroes_bot?start=ref<tg_id>
// доезжает в адрес мини-апки как ?ref=tg<id>. Звёзды (с 02.11.2026) — счета этого бота:
// pre_checkout_query и successful_payment (server/tgStarsUpdate). Выплаты и привязку
// кошелька ведёт кошельковый бот (api.tg-webhook).
// /vestnik админа в чате игроков — туда выходит газета дня (news/vestnik-command);
// сообщения чата сообщества — в «Что обсуждают» (news/news-chat).
import { createFileRoute } from "@tanstack/react-router";
import { gameBotSend, gamePlayButton } from "@/server/tgGameBot";
import { getUserLang } from "@/server/userLang";
import { tFor } from "@/lib/i18n";
import type { StarsUpdate } from "@/server/tgStarsUpdate";

type Update = StarsUpdate & {
  message?: {
    message_id?: number;
    date?: number;
    text?: string;
    caption?: string;
    from?: {
      id: number;
      language_code?: string;
      is_bot?: boolean;
      username?: string;
      first_name?: string;
    };
    chat?: { id: number; type?: string };
  };
};

export const Route = createFileRoute("/api/tg-game-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Бот новый, вебхук ставится сразу с secret_token: без секрета — отказ.
        const want = process.env.TG_GAME_WEBHOOK_SECRET;
        if (!want || request.headers.get("x-telegram-bot-api-secret-token") !== want) {
          return new Response("forbidden", { status: 403 });
        }
        let update: Update;
        try {
          update = (await request.json()) as Update;
        } catch {
          return new Response("bad json", { status: 400 });
        }
        // Звёзды — до всего остального (successful_payment — message без text).
        const { handleStarsUpdate } = await import("@/server/tgStarsUpdate");
        if (await handleStarsUpdate(update, "game")) return new Response("ok");
        const text = update.message?.text ?? "";
        const from = update.message?.from;
        const chatId = update.message?.chat?.id;
        // Чат сообщества (бот там админ): сообщения — в «Что обсуждают» газеты.
        if (chatId && chatId < 0 && !text.startsWith("/")) {
          const { storeChatMessage } = await import("@/server/news/news-chat");
          await storeChatMessage(update.message).catch((err) =>
            console.error("tg-game-webhook chat", err instanceof Error ? err.message : err),
          );
          return new Response("ok");
        }
        if (from && chatId && text.startsWith("/vestnik")) {
          const { handleVestnikCommand } = await import("@/server/news/vestnik-command");
          await handleVestnikCommand(text, from.id, chatId, update.message?.chat?.type).catch(
            (err) => console.error("tg-game-webhook vestnik", err),
          );
          return new Response("ok");
        }
        if (from && chatId && (text.startsWith("/start") || text.startsWith("/app"))) {
          try {
            const lang = await getUserLang(from.id, from.language_code);
            const ref = /^\/start(?:@\S+)?\s+ref(\d+)$/.exec(text)?.[1];
            // Переход по реф-ссылке — в статистику (ref_click), до ответа бота.
            if (ref)
              await import("@/server/referralClick").then((m) =>
                m.noteRefClick(ref, from.id, "game"),
              );
            // По ссылке — кто позвал и подарок (lib/referralShare.ts); иначе — обычное.
            const invite = ref
              ? await import("@/server/referralInviter").then((m) => m.inviteOfRef(`tg${ref}`))
              : null;
            const { inviteWhoText } = await import("@/lib/referralShare");
            const welcome = invite?.invited
              ? tFor(lang, "bot.game_welcome_ref", {
                  who: inviteWhoText(invite, tFor(lang, "ref.friend")),
                })
              : tFor(lang, "bot.game_welcome");
            await gameBotSend(
              chatId,
              welcome,
              gamePlayButton(tFor(lang, "bot.game_play"), ref ? `tg${ref}` : undefined),
            );
          } catch (err) {
            console.error("tg-game-webhook error", err);
          }
        }
        // Telegram ждёт 200 в любом случае, иначе повторяет апдейт.
        return new Response("ok");
      },
    },
  },
});
