// Первый в цепочке лаборатории (§8.81): FLUX.1-schnell на Cloudflare Workers AI
// по бесплатному ключу владельца (28.10.2026). Ключи — CF_ACCOUNT_ID и
// CF_AI_TOKEN в .env сборки; нет ключей — генератор молча пропускается.
// Бесплатно 10 000 «нейронов» в сутки (сброс в 00:00 UTC); замер 28.10: одна
// картинка 1024×1024 — 172,8 нейрона, ≈ 57 картинок в сутки, 2–3 с. Размер и
// посев модель не принимает — только запрос и число шагов (до 8).
import type { Fetch, GenResult } from "./genTypes";
import { errText } from "./genTypes";

const MODEL = "@cf/black-forest-labs/flux-1-schnell";
const MAX_BYTES = 8 * 1024 * 1024;

/** Секунд до следующей полуночи UTC — тогда Cloudflare обнуляет суточный лимит. */
export function untilUtcMidnight(now = Date.now()): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(300, Math.ceil((next.getTime() - now) / 1000));
}

type CfAnswer = {
  success?: boolean;
  result?: { image?: string };
  errors?: Array<{ code?: number; message?: string }>;
};

export async function cfImage(prompt: string, f: Fetch = fetch): Promise<GenResult> {
  const account = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_AI_TOKEN;
  if (!account || !token) return { kind: "fail", why: "cf: no key" };
  try {
    const r = await f(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${MODEL}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.slice(0, 2048), steps: 4 }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    const d = (await r.json().catch(() => ({}))) as CfAnswer;
    const why = `cf: ${(d.errors ?? []).map((e) => e.message).join("; ") || r.status}`.slice(
      0,
      200,
    );
    // Суточный бесплатный лимит кончился — до полуночи UTC.
    if (r.status === 429 || /neuron|allocation|daily/i.test(why)) {
      return { kind: "wait", seconds: untilUtcMidnight(), why };
    }
    if (r.status >= 500) return { kind: "wait", seconds: 120, why };
    const b64 = d.result?.image;
    if (!r.ok || !d.success || typeof b64 !== "string") return { kind: "fail", why };
    const image = Buffer.from(b64, "base64");
    if (image.length === 0 || image.length > MAX_BYTES)
      return { kind: "fail", why: "cf: bad size" };
    return { kind: "ok", image };
  } catch (e) {
    return { kind: "wait", seconds: 120, why: `cf: ${errText(e)}` };
  }
}
