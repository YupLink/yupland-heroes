// Серверный отказ — на языке игрока.
//
// Сервер бросает ошибки строками по-русски, и на английском интерфейсе игрок
// читал русский тост (§4.0.1). Переводить весь сервер разом — отдельная
// задача; здесь договор такой: если сообщение выглядит КЛЮЧОМ словаря
// («braid.void_blocked»), переводим его, всё остальное — как раньше.
import { humanError } from "./humanError";

/** Ключ словаря: домен, точка, имя. Обычная фраза под это не подходит. */
const KEY_RE = /^[a-z][a-z0-9]*\.[a-z0-9_]+$/i;

export function serverErrorText(
  e: unknown,
  t: (key: string) => string,
  /** Что показать, если сервер не сказал ничего внятного. */
  fallback?: string,
): string {
  const raw = (e instanceof Error ? e.message : String(e ?? "")).trim();
  // Ключ с подстановками приходит как «braid.gate_level|{"from":3}»: без этого
  // сервер мог отвечать переводимо только фразами без чисел, и отказ двери
  // («пускают героя 3–10 уровня») пришлось бы писать по-русски.
  const bar = raw.indexOf("|");
  if (bar > 0) {
    const key = raw.slice(0, bar);
    if (KEY_RE.test(key)) {
      try {
        const params = JSON.parse(raw.slice(bar + 1)) as Record<string, string | number>;
        const text = (t as (k: string, p?: Record<string, string | number>) => string)(key, params);
        if (text !== key) return text;
      } catch {
        /* не наш формат — разбираем дальше как обычную ошибку */
      }
    }
  }
  if (KEY_RE.test(raw)) {
    const text = t(raw);
    // t() возвращает сам ключ, когда его нет в словаре — значит это не ключ.
    if (text !== raw) return text;
  }
  if (!raw && fallback) return fallback;
  return humanError(e);
}
