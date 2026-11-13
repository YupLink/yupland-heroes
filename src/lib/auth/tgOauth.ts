// Вход через Telegram в браузере своей кнопкой (владелец, 09.11.2026: «Telegram тоже
// иногда долго ждать — на доли секунды, но заметно»). Раньше кнопкой был виджет
// Telegram — iframe с oauth.telegram.org, который грузится при каждом открытии и
// каждой смене языка. Теперь кнопка своя (видна сразу), а нажатие открывает то же
// окно входа Telegram — протокол telegram.org/js/telegram-widget.js (TelegramLogin._auth):
// всплывающее окно oauth.telegram.org/auth присылает {event:'auth_result', result};
// если окно открылось переходом, Telegram возвращает на return_to с #tgAuthResult=…
// Данные и подпись — те же, что у виджета: сервер проверяет их как раньше.

export const TG_OAUTH_ORIGIN = "https://oauth.telegram.org";

export type TgAuthData = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

/** Адрес окна входа (как в widget.js). */
export function tgOauthUrl(o: {
  botId: number;
  origin: string;
  lang: string;
  returnTo: string;
}): string {
  return (
    `${TG_OAUTH_ORIGIN}/auth?bot_id=${encodeURIComponent(String(o.botId))}` +
    `&origin=${encodeURIComponent(o.origin)}&request_access=write` +
    `&lang=${encodeURIComponent(o.lang)}&return_to=${encodeURIComponent(o.returnTo)}`
  );
}

const isAuthData = (v: unknown): v is TgAuthData => {
  const o = v as Partial<TgAuthData> | null;
  return (
    !!o && Number.isSafeInteger(o.id) && Number.isFinite(o.auth_date) && typeof o.hash === "string"
  );
};

/** #tgAuthResult=<base64url JSON> из адреса (возврат переходом); нет — null. */
export function parseTgAuthHash(hash: string): TgAuthData | null {
  const m = /[#?&]tgAuthResult=([A-Za-z0-9\-_=]*)$/.exec(hash);
  if (!m) return null;
  try {
    let data = (m[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    const pad = data.length % 4;
    if (pad > 1) data += "=".repeat(4 - pad);
    const v: unknown = JSON.parse(atob(data));
    return isAuthData(v) ? v : null;
  } catch {
    return null;
  }
}

/** Ответ окна входа из message: только от этого окна и только auth_result. */
export function authFromMessage(raw: unknown): TgAuthData | false | null {
  let data: { event?: string; result?: unknown };
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : (raw as typeof data);
  } catch {
    return null;
  }
  if (data?.event !== "auth_result") return null;
  return isAuthData(data.result) ? data.result : false;
}

/**
 * Открыть окно входа (синхронно, внутри нажатия — иначе браузер его заблокирует).
 * done(data) — вошёл; done(false) — закрыл окно или отказал. Ответ — отписка.
 */
export function openTgOauth(botId: number, lang: string, done: (d: TgAuthData | false) => void) {
  const w = 550;
  const h = 470;
  const left = Math.max(0, (screen.width - w) / 2);
  const top = Math.max(0, (screen.height - h) / 2);
  const url = tgOauthUrl({
    botId,
    origin: location.origin,
    lang,
    returnTo: location.href.replace(/#.*$/, ""),
  });
  const popup = window.open(
    url,
    `telegram_oauth_bot${botId}`,
    `width=${w},height=${h},left=${left},top=${top},status=0,location=0,menubar=0,toolbar=0`,
  );
  let finished = false;
  const finish = (d: TgAuthData | false) => {
    if (finished) return;
    finished = true;
    window.removeEventListener("message", onMessage);
    clearInterval(closed);
    done(d);
  };
  const onMessage = (e: MessageEvent) => {
    if (!popup || e.source !== popup) return;
    const d = authFromMessage(e.data);
    if (d !== null) finish(d);
  };
  window.addEventListener("message", onMessage);
  // Закрыл окно без входа — отказ (как checkClose в widget.js).
  const closed = setInterval(() => {
    if (!popup || popup.closed) finish(false);
  }, 300);
  popup?.focus();
  return () => finish(false);
}
