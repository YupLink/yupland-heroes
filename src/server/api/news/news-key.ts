// Ключ доступа к /api/news. Живёт в yuplink.settings (news_api_key), а не в
// окружении: появляется сам, когда админ первый раз открывает вкладку
// «Новости», и ссылку с ним админ копирует оттуда же — без правки .env и
// пересборки. Сменить ключ — удалить строку: следующий админ получит новый.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mcpExec } from "@/server/db/mcpClient";

const SETTING = "news_api_key";
const TTL_MS = 60_000;
let cached: { at: number; value: string | null } | null = null;

type Row = { value: string | null };

/** Ключ из базы (кэш минута); null — ключа ещё нет, API закрыт. */
export async function readNewsKey(): Promise<string | null> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.value;
  const rows = (await mcpExec(`SELECT value FROM yuplink.settings WHERE key = '${SETTING}'`, {
    wrapJson: true,
  })) as Row[];
  const value = rows?.[0]?.value || null;
  cached = { at: now, value };
  return value;
}

/** Ключ, а нет — создать. Гонка двух админов безопасна: побеждает первая запись. */
export async function ensureNewsKey(): Promise<string> {
  const have = await readNewsKey();
  if (have) return have;
  const fresh = randomBytes(24).toString("base64url");
  await mcpExec(
    `INSERT INTO yuplink.settings (key, value) VALUES ('${SETTING}', '${fresh}')
     ON CONFLICT (key) DO NOTHING`,
  );
  cached = null;
  const value = await readNewsKey();
  if (!value) throw new Error("Ключ новостей не сохранился");
  return value;
}

/** Сравнение без утечки по времени; разная длина — сразу «нет». */
export function sameKey(given: string | null | undefined, real: string | null): boolean {
  if (!given || !real) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(real);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Ключ из запроса: ?key=… или заголовок Authorization: Bearer …. */
export function keyFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  const q = url.searchParams.get("key");
  if (q) return q;
  const auth = request.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
}
