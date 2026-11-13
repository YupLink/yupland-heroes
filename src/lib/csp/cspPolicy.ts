// Защитный заголовок страницы (CSP), аудит 11.11.2026; владелец: «делай».
// Браузер выполняет только наши скрипты — с меткой (nonce) этого ответа — и то,
// что загрузили они сами ('strict-dynamic'). Вставленный чужой <script>,
// on…-обработчик или ссылка «javascript:» без метки не запустятся.
//
// Шаг 1 — наблюдение (Report-Only): ничего не блокируется, браузер шлёт на
// /api/csp-report, что заблокировал бы. Шаг 2 — блокировка (CSP_ENFORCE=1),
// когда отчёты покажут, что вход через Telegram/Google, кошельки и игра чистые.
// 'unsafe-inline' и https: — запасной путь для старых браузеров: те, что знают
// nonce/strict-dynamic, эти слова игнорируют.

/** Заголовок: наблюдение или блокировка. */
export const cspHeaderName = (enforce: boolean): string =>
  enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";

export function cspPolicy(nonce: string): string {
  return [
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'self' https: 'unsafe-inline'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `report-uri /api/csp-report`,
  ].join("; ");
}

/** Заголовок для HTML со своей меткой (страницы без React: вестник, газета). */
export function cspHeaders(nonce: string): Record<string, string> {
  return { [cspHeaderName(process.env.CSP_ENFORCE === "1")]: cspPolicy(nonce) };
}

/** У ответа уже свой заголовок — общий не добавляем (две политики действуют обе). */
export const hasCsp = (h: Headers): boolean =>
  h.has("content-security-policy") || h.has("content-security-policy-report-only");

/** Метка ответа: 16 случайных байт в base64 (Web Crypto — есть и в Node). */
export function newNonce(): string {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}
