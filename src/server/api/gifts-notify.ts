// Письмо о подарке: «тебе пришло, зайди и забери».
//
// Молчаливый подарок игрок не заметит — он не следит за кружком на карте.
// Поэтому письмо шлёт САМА выдача, а не каждая ручка по-своему: раньше
// уведомляла только массовая раздача, а подарок за предмет, пак или разовое
// начисление уходил в тишину.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

/** Пауза между порциями писем: у Bot API свои лимиты, спешка ловит 429. */
const CHUNK = 25;
const GAP_MS = 250;

/**
 * Кому писать. Что именно подарили, письму знать не нужно: текст один на все
 * виды, а состав игрок читает в окне подарка.
 */
export type GiftNotice = {
  accountId: string;
  /** Начисление по подписке — своё письмо: имя тарифа по языкам (владелец 25.10.2026). */
  esubTier?: { ru: string; en: string };
};

type Row = { account_id: string; telegram_id: number | string | null };

/**
 * Разослать письма получателям. Возвращает, скольким дошло.
 * Не бросает: подарок уже записан, и падение телеграма его не отменяет.
 */
export async function notifyGifts(list: GiftNotice[]): Promise<number> {
  if (list.length === 0) return 0;
  const accounts = [...new Set(list.map((g) => g.accountId))];
  // Telegram — из аккаунта, а нет там — из его кошельков: id мог остаться на
  // пустом аккаунте-держателе (см. gifts-active), и письмо ушло бы в никуда.
  const rows = (await mcpExec(
    `SELECT a.id AS account_id,
            COALESCE(a.telegram_id,
              (SELECT u.telegram_id FROM yuplink.users u
                WHERE u.account_id = a.id AND u.telegram_id IS NOT NULL
                ORDER BY u.telegram_id LIMIT 1)) AS telegram_id
       FROM yuplink.accounts a
      WHERE a.id IN (${accounts.map((a) => sqlStr(a)).join(",")});`,
    { wrapJson: true },
  ).catch(() => [])) as Row[];

  const tgByAccount = new Map<string, number>();
  for (const r of rows ?? []) {
    if (r.telegram_id != null) tgByAccount.set(r.account_id, Number(r.telegram_id));
  }
  const targets = list.filter((g) => tgByAccount.has(g.accountId));
  if (targets.length === 0) return 0;

  // Письма о подарках — от игрового бота с кнопкой в игру (владелец 20.10).
  const { gameBotSendIfEnabled, gamePlayButton } = await import("../tgGameBot");
  const { getUserLang } = await import("../userLang");
  const { tFor } = await import("@/lib/i18n");

  const writeTo = async (g: GiftNotice): Promise<boolean> => {
    const tgId = tgByAccount.get(g.accountId) as number;
    const lang = await getUserLang(tgId).catch(() => "ru" as const);
    // Только зов, без описи: что именно дали, игрок прочтёт в окне подарка.
    // Подписка — «начисление», забрать день в день; прочее — подарок на 48 ч.
    const raw = g.esubTier && ((lang === "en" ? g.esubTier.en : g.esubTier.ru) || g.esubTier.ru);
    // Письмо — HTML: «&» или «<» в имени тарифа Telegram отклонил бы молча.
    const tier = raw && raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const text = tier
      ? [
          `<b>${tFor(lang, "bot.esub_title", { tier })}</b>`,
          "",
          tFor(lang, "bot.esub_footer"),
        ].join("\n")
      : [`<b>${tFor(lang, "bot.gift_title")}</b>`, "", tFor(lang, "bot.gift_footer")].join("\n");
    return gameBotSendIfEnabled(tgId, text, gamePlayButton(tFor(lang, "bot.game_play"))).catch(
      () => false,
    );
  };

  let sent = 0;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const done = await Promise.all(targets.slice(i, i + CHUNK).map(writeTo));
    sent += done.filter(Boolean).length;
    if (i + CHUNK < targets.length) await new Promise((r) => setTimeout(r, GAP_MS));
  }
  return sent;
}
