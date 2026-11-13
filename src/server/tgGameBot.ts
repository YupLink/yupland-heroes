// Игровой бот @yupland_heroes_bot (владелец 20.10): отдельный вход именно в
// игру — мини-апка открывается сразу в «Фишках». Кошельковый @yuplink_bot
// ведёт только в кошелёк (routes/index.tsx). Подпись входа проверяет общий
// verifyTelegramInitData (user-drops-hallway.ts) по токену любого из ботов.
//
// Письма игре — тоже отсюда (владелец 20.10): о подарках и анонсы аукционов
// админа. Дойдут только тем, кто запустил этого бота, — так и задумано.
import { WEBAPP_URL } from "./tg";
import { isGoogleTg } from "@/lib/auth/googleTg";

export const GAME_URL = `${WEBAPP_URL}/chips`;

export type GameButton = {
  inline_keyboard: Array<Array<{ text: string; web_app: { url: string } }>>;
};

/** Кнопка в игру; ref — реферал (tg<id>), его клиент заберёт из адреса. */
export function gamePlayButton(text: string, ref?: string): GameButton {
  const url = ref ? `${GAME_URL}?ref=${encodeURIComponent(ref)}` : GAME_URL;
  return { inline_keyboard: [[{ text, web_app: { url } }]] };
}

/** Кнопка в игру с параметрами адреса (?mine=<строка> — «Показать» письма о шахте, §8.106). */
export function gameLinkButton(text: string, params: Record<string, string>): GameButton {
  const url = `${GAME_URL}?${new URLSearchParams(params).toString()}`;
  return { inline_keyboard: [[{ text, web_app: { url } }]] };
}

/** Вызов Bot API игрового бота. Нет токена, бот заблокирован или не запущен — false. */
async function gameApi(
  method: string,
  chatId: number,
  body: Record<string, unknown>,
): Promise<boolean> {
  const token = process.env.TELEGRAM_GAME_BOT_TOKEN;
  if (!token || isGoogleTg(chatId)) return false; // Google-игрок: в Telegram писать некуда
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, parse_mode: "HTML", ...body }),
    });
    if (!res.ok) {
      console.warn(`gameBot ${method}(${chatId}) → ${res.status}`);
      // Не запускал бота или заблокировал — запомним: при входе в игру Telegram
      // спросит «разрешить боту писать» (§8.106, server/tgReach).
      if (res.status === 400 || res.status === 403) {
        const why = await res.text().catch(() => "");
        void import("./tgReach")
          .then((m) => m.noteUnreachable(chatId, res.status, why))
          .catch(() => {});
      }
    }
    return res.ok;
  } catch (err) {
    console.warn(`gameBot ${method}(${chatId}) failed:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/** Сообщение с кнопкой в игру. */
export function gameBotSend(
  chatId: number,
  text: string,
  replyMarkup: GameButton,
): Promise<boolean> {
  return gameApi("sendMessage", chatId, { text, reply_markup: replyMarkup });
}

/** Картинка с подписью и кнопкой в игру. */
export function gameBotSendPhoto(
  chatId: number,
  photo: string,
  caption: string,
  replyMarkup: GameButton,
): Promise<boolean> {
  return gameApi("sendPhoto", chatId, { photo, caption, reply_markup: replyMarkup });
}

/**
 * Как tgSendIfEnabled: кто выключил уведомления, того не беспокоим; нет строк
 * users с этим Telegram — внешний получатель, пишем.
 */
export async function gameBotSendIfEnabled(
  telegramId: number,
  text: string,
  replyMarkup: GameButton,
): Promise<boolean> {
  const { pg } = await import("./db/pg");
  const rows = await pg.users.findMany({ telegram_id: telegramId });
  if (rows.length > 0 && !rows.some((r) => r.notifications_enabled)) return false;
  return gameBotSend(telegramId, text, replyMarkup);
}
