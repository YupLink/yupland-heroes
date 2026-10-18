// Язык юзера для серверных сообщений (уведомления бота).
// Источник правды — settings kv `userlang:tg:<tgid>` (пишется setMyLang,
// тот же ключ читает getSession). Фолбэк — язык устройства из Telegram
// (from.language_code), затем ru.
import { pg } from "./db/pg";
import type { Lang } from "@/lib/store";

export async function getUserLang(
  telegramId: number | null | undefined,
  fallbackCode?: string | null
): Promise<Lang> {
  try {
    if (telegramId) {
      const row = await pg.settings.findOne({ key: `userlang:tg:${telegramId}` });
      if (row?.value === "en" || row?.value === "ru") return row.value;
    }
  } catch {
    // ignore
  }
  const code = String(fallbackCode || "").toLowerCase();
  if (code.startsWith("ru")) return "ru";
  if (code) return "en";
  return "ru";
}
