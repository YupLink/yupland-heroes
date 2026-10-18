// Проверка Bearer-ключа за постоянное время: обычное сравнение строк
// прерывается на первом несовпавшем байте и по времени ответа выдаёт,
// сколько байт ключа угадано.
export async function bearerMatches(header: string | null, secret: string): Promise<boolean> {
  if (!header || !secret) return false;
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const { timingSafeEqual, createHash } = await import("node:crypto");
  // Хэшируем обе стороны: длины выравниваются, длина ключа не утекает.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

/** Тело запроса не длиннее max байт: поток режем, а не читаем целиком. */
export async function readCapped(request: Request, max: number): Promise<string | null> {
  const body = request.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}
