// Зерно бросков заброса (ПРАВИЛА §8.35). Ключ нажатия «Забросить» (op) выбирает
// браузер: считайся шанс прямо от него, скрипт перебирал бы ключи у себя и слал
// только «уловистые» — рыба в каждом забросе вместо шанса. Поэтому шанс рыбы и
// выбор улова считаются от HMAC на серверном секрете (том же, что подписывает
// сессию, sessionCookie): тот же заброс — то же зерно (повтор запроса и вторая
// вкладка видят тот же исход), а угадать его без секрета нельзя.
//
// Аудит 14.10 (п.3): зерно только от op можно было ПОВТОРИТЬ — твин-разведчик
// видит, что op дал рыбу, а сборщик бросает тот же op и ловит то же самое.
// Теперь в зерне аккаунт и соль заброса (raid_fishing.seed_salt — случайная,
// пишется при старте, миграция fish-04-seed-salt): чужой op у другого аккаунта
// и повторный бросок своего бросают по-новому. У строк без соли (забросы,
// начатые до выката) — прежняя формула, их исход задним числом не меняется.
// HMAC — из @noble/hashes, как у подписи сессии.
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64urlnopad } from "@scure/base";

/** Секрет сервера. В проде обязателен (без него не работает и вход), в dev — заглушка. */
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET не задан");
  return "dev-only-insecure-session-secret";
}

/** Сообщение под HMAC: с солью — аккаунт, op и соль; без соли — как до 14.10. */
export const seedMessage = (account: string, op: string, salt: string | null): string =>
  salt ? `fish-seed:${account}:${op}:${salt}` : `fish-seed:${op}`;

/**
 * Зерно бросков заброса op аккаунта: от него — шанс рыбы (fishHit) и выбор
 * улова. salt — соль строки рыбалки; null — старая строка, прежняя формула.
 */
export function fishSeed(account: string, op: string, salt: string | null): string {
  const enc = new TextEncoder();
  const msg = enc.encode(seedMessage(account, op, salt));
  return base64urlnopad.encode(hmac(sha256, enc.encode(secret()), msg));
}
