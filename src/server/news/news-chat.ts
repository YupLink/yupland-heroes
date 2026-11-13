// Чат сообщества https://t.me/arhei_yup («В гостях у Юпика Ар-Хей», -1002166870776).
// Игровой бот, админ этого чата, получает все сообщения (вебхук) и кладёт текст
// в news_chat_msg; хранятся 30 дней. С 08.11.2026 ИИ их НЕ пересказывает
// (владелец: «просто собирались данные — всё, что писали, без анализа ИИ»):
// API газеты отдаёт сообщения как есть (chatMessages).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";

/** Чат сообщества по умолчанию — тот, что назвал владелец. */
export const COMMUNITY_CHAT_ID = -1002166870776;
const KEEP_DAYS = 30;

type TgMessage = {
  message_id?: number;
  date?: number;
  text?: string;
  caption?: string;
  chat?: { id: number };
  from?: { is_bot?: boolean; username?: string; first_name?: string };
};

/** Сообщение чата сообщества → в базу (команды и боты — мимо). */
export async function storeChatMessage(m: TgMessage | undefined): Promise<boolean> {
  const text = (m?.text ?? m?.caption ?? "").trim();
  if (!m || m.chat?.id !== COMMUNITY_CHAT_ID || !text || text.startsWith("/") || m.from?.is_bot) {
    return false;
  }
  if (!Number.isSafeInteger(m.message_id) || !Number.isFinite(m.date)) return false;
  const author = m.from?.username ? `@${m.from.username}` : (m.from?.first_name ?? null);
  await mcpExec(
    `INSERT INTO yuplink.news_chat_msg (chat_id, msg_id, at, author, text)
     VALUES (${COMMUNITY_CHAT_ID}, ${m.message_id}, to_timestamp(${Math.floor(m.date as number)}),
             ${author ? sqlStr(author.slice(0, 64)) : "NULL"}, ${sqlStr(text.slice(0, 2000))})
     ON CONFLICT (chat_id, msg_id) DO NOTHING`,
  );
  return true;
}

/** Старше 30 дней — прочь (зовёт проход газеты). */
export const pruneChatSql = (): string =>
  `DELETE FROM yuplink.news_chat_msg WHERE at < now() - interval '${KEEP_DAYS} days'`;

/** Сообщение чата как есть: когда, кто (ник Telegram или имя), текст. */
export type NewsChatMsg = { at: string; author: string | null; text: string };

/** Потолок сообщений за окно — 30 дней живого чата с запасом. */
const MAX_MESSAGES = 5000;

/**
 * Всё, что писали в чат за окно, — как есть, по порядку, БЕЗ пересказа ИИ
 * (владелец 08.11.2026: «чтобы данные не суммировались ИИ, а просто
 * собирались — всё, что писали»). end = null — по сейчас.
 */
export async function chatMessages(fromIso: string, end: string | null): Promise<NewsChatMsg[]> {
  const toIso = end ?? new Date().toISOString();
  const rows = (await mcpExec(
    `SELECT at, author, text FROM yuplink.news_chat_msg
      WHERE chat_id = ${COMMUNITY_CHAT_ID} AND at >= ${sqlStr(fromIso)} AND at < ${sqlStr(toIso)}
      ORDER BY at, msg_id LIMIT ${MAX_MESSAGES}`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ at: string; author: string | null; text: string }>;
  return (rows ?? []).map((r) => ({
    at: new Date(r.at).toISOString(),
    author: r.author ?? null,
    text: String(r.text ?? ""),
  }));
}
