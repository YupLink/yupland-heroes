// Номер бота входа через Telegram (TELEGRAM_BOT_TOKEN — тот же, которым сервер
// проверяет подпись loginViaTelegramWidget) для своей кнопки входа (lib/auth/tgOauth).
// Отдаём только номер до «:» — он публичный; сам токен наружу не уходит.
import { createServerFn } from "@tanstack/react-start";

export const getTgLoginBotId = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ botId: number | null }> => {
    const id = Number((process.env.TELEGRAM_BOT_TOKEN ?? "").split(":")[0]);
    return { botId: Number.isSafeInteger(id) && id > 0 ? id : null };
  },
);
