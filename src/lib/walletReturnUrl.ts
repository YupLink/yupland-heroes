// Адрес возврата из окна кошелька (connect / sign / sign-message) приходит из
// ссылки — значит, его может подсунуть кто угодно. Пускаем только https
// (и http на localhost для разработки dApp): «javascript:…» в failure_url
// выполнил бы чужой код на нашем домене по нажатию «Отклонить» (аудит 11.11.2026).
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Разобранный адрес возврата или null, если он не https (или не http на localhost). */
export function safeReturnUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol === "https:") return u;
  if (u.protocol === "http:" && LOCAL.has(u.hostname)) return u;
  return null;
}

/** Тот же адрес, только когда он безопасен; иначе бросок (окно уйдёт назад, а не по ссылке). */
export function returnUrlOrThrow(raw: string): URL {
  const u = safeReturnUrl(raw);
  if (!u) throw new Error("unsafe return url");
  return u;
}
