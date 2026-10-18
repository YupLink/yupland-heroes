// Подпись session-cookie. Вынесено из auth.ts, чтобы держать криптографию
// в одном месте (§13 ПРАВИЛА.md).
//
// ЗАЧЕМ: раньше в cookie лежало голое имя кошелька, и сервер ему верил —
// достаточно было послать `Cookie: gd_wallet=victim.near`, чтобы получить
// полный доступ к чужому аккаунту (см. knowledge.md, connectwallet-critical).
// Теперь к значению приписан HMAC на серверном секрете: подделать значение,
// не зная SESSION_SECRET, нельзя.
//
// ВАЖНО: это защита от ПОДДЕЛКИ cookie, а не доказательство владения
// кошельком — его даёт connectWalletSigned (NEP-413) при установке сессии.
//
// HMAC берём из @noble/hashes, а не из node:crypto: auth.ts утягивается в
// клиентский бандл, и node:crypto ронял бы прод-сборку («createHmac is not
// exported by __vite-browser-external»). @noble изоморфен и синхронен —
// getCurrentWallet() синхронный, async-вариант (WebCrypto) тут не подошёл бы.
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64urlnopad } from "@scure/base";

const SEP = "~";

/**
 * Секрет для подписи. В проде обязателен: без него подписывать нечем, а
 * молча принимать неподписанное — значит оставить ту самую дыру открытой.
 * В dev допускаем заглушку, чтобы локальный превью не требовал настройки.
 */
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET не задан — вход отключён (иначе cookie можно подделать)"
    );
  }
  return "dev-only-insecure-session-secret";
}

function sign(value: string): string {
  const enc = new TextEncoder();
  return base64urlnopad.encode(hmac(sha256, enc.encode(secret()), enc.encode(value)));
}

/** `wallet` → `wallet~<hmac>` для записи в cookie. */
export function signCookieValue(value: string): string {
  return `${value}${SEP}${sign(value)}`;
}

/**
 * Разбирает `wallet~<hmac>`; возвращает wallet только если подпись верна.
 * Старый формат (без подписи) отвергается — такие сессии просто
 * протухают, пользователь логинится заново.
 */
export function readSignedCookieValue(raw: string | null): string | null {
  if (!raw) return null;
  const at = raw.lastIndexOf(SEP);
  if (at <= 0) return null; // старый неподписанный формат или мусор
  const value = raw.slice(0, at);
  const got = raw.slice(at + SEP.length);
  const want = sign(value);
  // Сравнение за постоянное время: не выходим раньше на первом отличии,
  // чтобы по времени ответа нельзя было подбирать подпись побайтово.
  if (got.length !== want.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0 ? value : null;
}
