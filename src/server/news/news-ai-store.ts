// Кэш ИИ «Вестника» (yuplink.news_ai, news-01): пересказы DeepSeek считаются
// один раз — DeepSeek и Cloudflare не дёргаются на каждый показ страницы.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";

type Row = { body: unknown; image_b64: string | null; age_s: number | string };

export type Cached<T> = { body: T | null; image: Buffer | null; ageSeconds: number };

/** Запись кэша; нет или сбой базы — null. */
export async function readAi<T>(key: string): Promise<Cached<T> | null> {
  const rows = (await mcpExec(
    `SELECT body, encode(image, 'base64') AS image_b64,
            extract(epoch from now() - created_at)::int AS age_s
       FROM yuplink.news_ai WHERE key = ${sqlStr(key)}`,
    { wrapJson: true },
  ).catch(() => [])) as Row[];
  const r = rows?.[0];
  if (!r) return null;
  return {
    body: (r.body as T) ?? null,
    image: r.image_b64 ? Buffer.from(r.image_b64.replace(/\s/g, ""), "base64") : null,
    ageSeconds: Number(r.age_s) || 0,
  };
}

/** Положить пересказ (JSON) — новое затирает старое. */
export async function writeAiBody(key: string, body: unknown): Promise<void> {
  await mcpExec(
    `INSERT INTO yuplink.news_ai (key, body) VALUES (${sqlStr(key)}, ${sqlStr(JSON.stringify(body))}::jsonb)
     ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, created_at = now()`,
  ).catch((e) => console.warn("[news-ai] не записалось:", e instanceof Error ? e.message : e));
}
