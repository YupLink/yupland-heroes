// Публичные Space на Hugging Face с ZeroGPU (FLUX.1-schnell, SanaSprint):
// ключ не нужен, но у безымянного клиента квота GPU на адрес — по докам
// 2 мин в сутки, а вызов «просит» свою долю (FLUX — 60 с, SanaSprint — 5 с).
// Кончилась квота — это «подождать», а не ошибка: задание ждёт и пробует
// снова. HF_TOKEN в окружении (необязателен) — квота бесплатного аккаунта.
//
// Запрос — через очередь Gradio (queue/join + queue/data): обычный /call/
// на отказ квоты отдаёт пустое «error: null», а очередь — текст причины.
import { randomBytes } from "node:crypto";
import { downloadImage, errText, type Fetch, type GenResult } from "./genTypes";

type Done = { ok: true; url: string } | { ok: false; error: string };

/** «Try again in 0:12:30» → секунды; нет срока — 10 минут; не чаще раза в 5
 *  минут (Space отвечает «0:00:00» и тут же снова отказывает). */
export function retryAfter(msg: string): number {
  const m = /try again in (\d+):(\d{2}):(\d{2})/i.exec(msg);
  const s = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 600;
  return Math.max(300, s);
}

/** Поток queue/data → итог последнего process_completed (null — итога нет). */
export function parseStream(text: string): Done | null {
  let last: Done | null = null;
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    let msg: {
      msg?: string;
      success?: boolean;
      title?: string;
      output?: { data?: Array<{ url?: unknown }>; error?: unknown };
    };
    try {
      msg = JSON.parse(line.slice(6));
    } catch {
      continue;
    }
    if (msg?.msg !== "process_completed") continue;
    const url = msg.output?.data?.[0]?.url;
    if (msg.success)
      last = typeof url === "string" ? { ok: true, url } : { ok: false, error: "no image" };
    else last = { ok: false, error: String(msg.output?.error ?? msg.title ?? "error") };
  }
  return last;
}

const BUSY = /quota|queue is full|too many|GPU task aborted|no GPU/i;

const fnIndex = new Map<string, number>();
/** Номер функции infer в Space (по имени из /config; не вышло — 2, как на 28.10). */
async function inferIndex(space: string, f: Fetch): Promise<number> {
  const known = fnIndex.get(space);
  if (known != null) return known;
  try {
    const r = await f(`${space}/config`, { signal: AbortSignal.timeout(15_000) });
    const cfg = (await r.json()) as { dependencies?: Array<{ api_name?: string }> };
    const i = cfg.dependencies?.findIndex((d) => d.api_name === "infer") ?? -1;
    fnIndex.set(space, i >= 0 ? i : 2);
    return i >= 0 ? i : 2;
  } catch {
    return 2;
  }
}

/** Картинка от функции infer публичного Space; data — её входы по порядку. */
export async function spaceImage(
  space: string,
  data: unknown[],
  f: Fetch = fetch,
): Promise<GenResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.HF_TOKEN) headers.Authorization = `Bearer ${process.env.HF_TOKEN}`;
  const session = randomBytes(6).toString("hex");
  try {
    const join = await f(`${space}/gradio_api/queue/join`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        data,
        fn_index: await inferIndex(space, f),
        session_hash: session,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (join.status === 429 || join.status >= 500) {
      return { kind: "wait", seconds: 300, why: `join ${join.status}` };
    }
    if (!join.ok) return { kind: "fail", why: `join ${join.status}` };
    const stream = await f(`${space}/gradio_api/queue/data?session_hash=${session}`, {
      headers,
      signal: AbortSignal.timeout(120_000),
    });
    const done = parseStream(await stream.text());
    if (!done) return { kind: "wait", seconds: 120, why: "no result" };
    if (!done.ok) {
      return BUSY.test(done.error)
        ? { kind: "wait", seconds: retryAfter(done.error), why: done.error.slice(0, 200) }
        : { kind: "fail", why: done.error.slice(0, 200) };
    }
    // Картинку берём только с того же Space — чужой адрес в ответе не качаем.
    return await downloadImage(done.url, (u) => u.startsWith(`${space}/`), f, headers);
  } catch (e) {
    // Сеть, таймаут, Space спит и просыпается — попробуем позже.
    return { kind: "wait", seconds: 120, why: errText(e) };
  }
}
