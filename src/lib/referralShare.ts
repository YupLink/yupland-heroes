// Ссылка «Поделиться» и подпись «кто позвал» (идея тестера 05.11, владелец «Можно»;
// 09.11.2026: «да, делай — только те подарки, что есть в игре уже; нужны варианты,
// если это будет не ТГ»). Подарок в тексте — то, что новичок и так получает: свой
// герой на выбор из шести рас (меню входа, game-start).

/** Кто позвал: есть ли приглашение и @ник пригласившего (без ника — «друг»). */
export type InviteWho = { invited: boolean; name: string | null };

/** Окно «Поделиться» Телеграма: выбор чата, текст и ссылка уже вписаны. */
export const tgShareUrl = (link: string, text: string): string =>
  `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;

/**
 * Какой ссылкой делиться: в Телеграме — ссылкой бота (друг откроет игру в нём),
 * в браузере — ссылкой сайта (откроется где угодно; вход — Telegram или Google).
 */
export function shareLink(inTelegram: boolean, tgLink: string | null, webLink: string): string {
  return inTelegram && tgLink ? tgLink : webLink || tgLink || "";
}

/** Ник из базы — без «@» и пробелов; пусто и мусор — null. */
export function cleanTgName(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim().replace(/^@/, "") : "";
  return /^[A-Za-z0-9_]{3,32}$/.test(s) ? s : null;
}

/** Строка «кто позвал» для подписи: «@nick» или слово «друг» нужного языка. */
export const inviteWhoText = (who: InviteWho, friend: string): string =>
  who.name ? `@${who.name}` : friend;
