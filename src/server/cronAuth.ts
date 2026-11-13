// Ключ крона (аудит 11.11.2026): раньше без CRON_SECRET в окружении крон-адреса
// пускали всех, а ключ сравнивался обычным «!==» (по времени ответа видно, сколько
// байт угадано). Теперь: ключа нет — 503 (закрыто), не тот — 401; сравнение — за
// постоянное время (perf/bearer).
import { bearerMatches } from "./perf/bearer";

/** null — можно; иначе готовый ответ-отказ. */
export async function cronDenied(request: Request): Promise<Response | null> {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return new Response("cron secret not set", { status: 503 });
  if (await bearerMatches(request.headers.get("authorization"), secret)) return null;
  return new Response("unauthorized", { status: 401 });
}
