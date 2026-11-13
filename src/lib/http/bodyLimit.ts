// Потолок размера запроса (аудит 11.11, остаток zod 3). Проверка входа zod 3
// разбирает присланный список целиком и только потом отказывает «слишком
// длинный» — один запрос в сотни мегабайт съедал бы память процесса. Здесь
// запрос отбивается по заголовку, до чтения тела.
//
// Пороги — по замеру прода 10–12.11 (177 тыс. запросов с телом): самая тяжёлая
// server-функция 40 КБ (редактор карты шлёт клетки пачками по 500), картинка
// в /api/upload до 2,7 МБ при потолке файла 8 МБ.

export const BODY_LIMIT = 1024 * 1024;
export const UPLOAD_BODY_LIMIT = 10 * 1024 * 1024;

const NO_BODY = new Set(["GET", "HEAD", "OPTIONS"]);

export function bodyLimitFor(pathname: string): number {
  return pathname === "/api/upload" ? UPLOAD_BODY_LIMIT : BODY_LIMIT;
}

/** Ответ-отказ, если запрос тяжелее порога; null — пропустить. */
export function oversizedBody(method: string, pathname: string, headers: Headers): Response | null {
  if (NO_BODY.has(method.toUpperCase())) return null;
  const len = headers.get("content-length");
  if (len === null) {
    // Тело без длины (chunked) размер заранее не сообщает. Наш клиент, Telegram
    // и Xsolla длину шлют всегда (за двое суток прода — ни одного такого запроса).
    return headers.has("transfer-encoding")
      ? Response.json({ error: "length_required" }, { status: 411 })
      : null;
  }
  const n = Number(len);
  if (!Number.isFinite(n) || n < 0) return Response.json({ error: "bad_length" }, { status: 400 });
  return n > bodyLimitFor(pathname)
    ? Response.json({ error: "payload_too_large" }, { status: 413 })
    : null;
}
