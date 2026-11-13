// Публикация «Вестника героев» игровым ботом @yupland_heroes_bot (владелец, 29.10):
// выпуск дня — в чат игроков, сводка недели — в канал @yupland_heroes.
//
// Куда — в yuplink.settings: vestnik_chat_day (ставит команда /vestnik админа
// прямо в чате, см. api.tg-game-webhook) и vestnik_chat_week (по умолчанию канал).
// Картинки уходят файлами (multipart): ссылкой Telegram пришлось бы отдавать ключ API.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { IssueKind } from "@/lib/news/vestnikWindow";

/** Канал «YupLand Heroes - News» (@yupland_heroes): бот там админ с 28.10. */
export const NEWS_CHANNEL_ID = -1004449671466;
const BOT_USERNAME = "yupland_heroes_bot";

const SETTING: Record<IssueKind, string> = { day: "vestnik_chat_day", week: "vestnik_chat_week" };

/**
 * Чат выпуска: из настроек; null — некуда. В канал по умолчанию НЕ шлём (владелец,
 * 09.11.2026: «ничего отправлять в канал не надо») — сводка недели больше не выходит.
 */
export async function chatFor(kind: IssueKind): Promise<number | null> {
  const rows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = ${sqlStr(SETTING[kind])}`,
    {
      wrapJson: true,
    },
  ).catch(() => [])) as Array<{ value: string | null }>;
  const v = Number(rows?.[0]?.value);
  if (Number.isSafeInteger(v) && v !== 0) return v;
  return null;
}

/** Запомнить чат выпуска; null — выключить выход в этот чат. */
export async function setChat(kind: IssueKind, chatId: number | null): Promise<void> {
  const key = sqlStr(SETTING[kind]);
  await mcpExec(
    chatId === null
      ? `DELETE FROM yuplink.settings WHERE key = ${key}`
      : `INSERT INTO yuplink.settings (key, value) VALUES (${key}, ${sqlStr(String(chatId))})
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  );
}

/** Подпись поста: название, дата и куда идти играть. */
export function captionOf(title: string, lang: "ru" | "en"): string {
  const play = lang === "en" ? "Play" : "Играть";
  return `<b>${title}</b>\n${play}: @${BOT_USERNAME}`;
}

/** Кнопка под одной картинкой: главная мини-апка бота (в группах web_app нельзя). */
const playButton = (lang: "ru" | "en") => ({
  inline_keyboard: [
    [{ text: lang === "en" ? "Play" : "Играть", url: `https://t.me/${BOT_USERNAME}?startapp` }],
  ],
});

const png = (buf: Buffer) => new Blob([new Uint8Array(buf)], { type: "image/png" });

/**
 * Итог отправки. rejected — Telegram ответил отказом: ничего не ушло, можно
 * повторить (migrateTo — группа стала супергруппой, у чата новый номер).
 * unknown — связь оборвалась: могло и уйти, повтор рискует вторым выпуском.
 */
export type SendOutcome =
  | { status: "ok" }
  | { status: "rejected"; migrateTo?: number }
  | { status: "unknown" };

/** Ответ Telegram на отказ → номер нового чата, если группа переехала. */
export function migrateOf(body: unknown): number | undefined {
  const id = (body as { parameters?: { migrate_to_chat_id?: unknown } })?.parameters
    ?.migrate_to_chat_id;
  return typeof id === "number" && Number.isSafeInteger(id) ? id : undefined;
}

/** Страницы выпуска: одна — фото с кнопкой, несколько — альбомом (подпись у первой). */
export async function sendPages(
  chatId: number,
  pages: Buffer[],
  caption: string,
  lang: "ru" | "en",
): Promise<SendOutcome> {
  // Буквально process.env.X — так сборка вшивает значение (vite define).
  const token = process.env.TELEGRAM_GAME_BOT_TOKEN;
  if (!token || pages.length === 0) return { status: "rejected" };
  const form = new FormData();
  form.set("chat_id", String(chatId));
  let method = "sendPhoto";
  if (pages.length === 1) {
    form.set("photo", png(pages[0]), "vestnik.png");
    form.set("caption", caption);
    form.set("parse_mode", "HTML");
    form.set("reply_markup", JSON.stringify(playButton(lang)));
  } else {
    method = "sendMediaGroup";
    const media = pages.map((_, i) => ({
      type: "photo",
      media: `attach://p${i}`,
      ...(i === 0 && { caption, parse_mode: "HTML" }),
    }));
    form.set("media", JSON.stringify(media));
    pages.forEach((p, i) => form.set(`p${i}`, png(p), `vestnik-${i + 1}.png`));
  }
  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    console.warn(`[vestnik] ${method}(${chatId}) без ответа:`, e instanceof Error ? e.message : e);
    return { status: "unknown" };
  }
  if (res.ok) return { status: "ok" };
  // Ответ пришёл, но с отказом: 5xx у Telegram — тоже «неизвестно».
  const body = await res.json().catch(() => null);
  console.warn(`[vestnik] ${method}(${chatId}) → ${res.status}`, JSON.stringify(body));
  if (res.status >= 500) return { status: "unknown" };
  return { status: "rejected", migrateTo: migrateOf(body) };
}
