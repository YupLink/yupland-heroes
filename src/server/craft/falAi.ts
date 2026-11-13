// Платный генератор (владелец, 11.11.2026: «арты после бесплатного — через fal.ai…
// когда лимит в том, чем делали до этого, исчерпается»; «чтобы было недорого»;
// «точно не SANA — поставь ту же, что делает у нас на бесплатном»): FLUX.1-schnell
// на fal.ai — та же модель и те же настройки, что Cloudflare в бесплатной цепочке
// (им нарисовано 127 из 173 артов генератора): 1024×1024, 4 шага, тот же запрос.
// Цена $0,003 за мегапиксель; 1024×1024 fal.ai считает за один (замер 11.11:
// X-Fal-Billable-Units 1) — $0,003 за арт. Ключ — FAL_KEY в .env сборки; нет
// ключа — генератора нет, и предел 50 генераций в сутки на всех остаётся
// (art-gen-sql). Картинка приходит прямо в ответе (sync_mode), чужие адреса не качаем.
import type { Fetch, GenResult } from "./genTypes";
import { errText } from "./genTypes";

const URL = "https://fal.run/fal-ai/flux/schnell";
/** Как у Cloudflare: квадрат 1024, 4 шага. */
const SIDE = 1024;
const STEPS = 4;
const MAX_BYTES = 8 * 1024 * 1024;

/** Платный генератор подключён (ключ есть). */
export const falOn = (): boolean => !!process.env.FAL_KEY;

type FalAnswer = {
  images?: Array<{ url?: string }>;
  has_nsfw_concepts?: boolean[];
  detail?: unknown;
};

const DATA_URI = /^data:image\/[a-z+]+;base64,/i;

export async function falImage(prompt: string, seed: number, f: Fetch = fetch): Promise<GenResult> {
  const key = process.env.FAL_KEY;
  if (!key) return { kind: "fail", why: "fal: no key" };
  try {
    const r = await f(URL, {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: prompt.slice(0, 2048),
        image_size: { width: SIDE, height: SIDE },
        num_inference_steps: STEPS,
        seed,
        num_images: 1,
        sync_mode: true,
        enable_safety_checker: true,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const d = (await r.json().catch(() => ({}))) as FalAnswer;
    const why = `fal: ${r.status} ${typeof d.detail === "string" ? d.detail : ""}`
      .trim()
      .slice(0, 200);
    // Занято (одновременных много) или сбой у них — повторить позже.
    if (r.status === 429 || r.status >= 500) return { kind: "wait", seconds: 60, why };
    // Ключ неверный, кончились деньги или лимит трат — этот генератор не рисует.
    if (!r.ok) return { kind: "fail", why };
    if (d.has_nsfw_concepts?.[0]) return { kind: "fail", why: "fal: nsfw" };
    const url = d.images?.[0]?.url ?? "";
    if (!DATA_URI.test(url)) return { kind: "fail", why: "fal: no image" };
    const image = Buffer.from(url.replace(DATA_URI, ""), "base64");
    if (image.length === 0 || image.length > MAX_BYTES)
      return { kind: "fail", why: "fal: bad size" };
    return { kind: "ok", image };
  } catch (e) {
    return { kind: "wait", seconds: 120, why: `fal: ${errText(e)}` };
  }
}
