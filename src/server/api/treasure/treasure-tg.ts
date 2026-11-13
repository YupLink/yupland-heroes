// Клад → админам в Telegram (владелец 07.11.2026: «админ — это я и Ярослав, больше
// под этот термин никто не становится»). Получатели — ровно ADMIN_TG_IDS, без
// добора по кошелькам ADMIN_WALLETS (sendTgMessageToAdmins добирает и их).
// Бот — тот же, что пишет админам служебное (@yuplink_bot, TELEGRAM_BOT_TOKEN).
// Скрин уходит файлом (multipart): ссылкой пришлось бы отдавать ключ API газеты.
import { tgSendMessage } from "@/server/tg";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { mskText, prizeText, type TreasurePrize } from "@/lib/treasure";

/** Админы для клада — только жёсткий список. Буквально process.env.X (vite define). */
export function treasureAdminIds(): number[] {
  return Array.from(
    new Set(
      (process.env.ADMIN_TG_IDS ?? "")
        .split(/[\s,]+/)
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isSafeInteger(n) && n > 0),
    ),
  );
}

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Place = TreasurePrize & { world: string; q: number; r: number; expiresAt: number };

export function placedCaption(t: Place): string {
  return [
    "🗝 <b>Клад закопан</b>",
    `Мир: ${esc(t.world)}`,
    `Координаты: ${t.q},${t.r}`,
    `Приз: ${esc(prizeText(t))}`,
    `Лежит до: ${mskText(t.expiresAt)}`,
  ].join("\n");
}

export function foundText(
  t: Pick<Place, "world" | "q" | "r" | "resource" | "token" | "amount" | "name">,
  nick: string | null,
): string {
  return [
    `🎉 <b>Клад найден!</b> ${nick ? `@${esc(nick)}` : "игрок без ника"}`,
    `Мир: ${esc(t.world)}`,
    `Координаты: ${t.q},${t.r}`,
    `Приз: ${esc(prizeText(t))}`,
  ].join("\n");
}

/** Фото с подписью каждому админу. Ответ — сколько дошло. */
export async function sendAdminsPhoto(jpeg: Buffer, caption: string): Promise<number> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return 0;
  let sent = 0;
  for (const id of treasureAdminIds()) {
    const form = new FormData();
    form.set("chat_id", String(id));
    form.set("photo", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "treasure.jpg");
    form.set("caption", caption);
    form.set("parse_mode", "HTML");
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) sent++;
      else console.warn(`[treasure] sendPhoto(${id}) → ${res.status}`);
    } catch (e) {
      console.warn(`[treasure] sendPhoto(${id}):`, e instanceof Error ? e.message : e);
    }
  }
  return sent;
}

/** Текст каждому админу. Ответ — сколько дошло. */
export async function sendAdminsText(text: string): Promise<number> {
  let sent = 0;
  for (const id of treasureAdminIds()) {
    if (await tgSendMessage(id, text, { replyMarkup: null })) sent++;
  }
  return sent;
}

/**
 * Сигнал админам — один раз на повод и метку (слот дня, id клада): повтор обхода
 * с той же меткой молчит, новая метка — снова сигнал. Текст — HTML, экранировать.
 */
export async function alertOnce(reason: string, mark: string, text: string): Promise<void> {
  const got = (await mcpExec(
    `INSERT INTO yuplink.settings (key, value) VALUES (${sqlStr(`treasure_alert_${reason}`)}, ${sqlStr(mark)})
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      WHERE yuplink.settings.value IS DISTINCT FROM EXCLUDED.value
     RETURNING 1 AS ok`,
    { wrapJsonCte: true },
  ).catch(() => [])) as unknown[];
  if (Array.isArray(got) && got.length > 0) await sendAdminsText(text).catch(() => 0);
}
