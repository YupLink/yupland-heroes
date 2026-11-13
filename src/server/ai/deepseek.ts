// Клиент DeepSeek (владелец, 29.10.2026: «нам нужен ИИ-пересказчик — у нас есть
// дипсик»): пересказы для «Вестника героев» — что нового в игре и о чём говорят
// в чате, и запрос для картинки главной новости.
//
// Ключ — DEEPSEEK_API_KEY в .env сборки (тот же, что у YupDar), вшивается в
// серверный код (vite define): читать только буквально process.env.X и внутри
// функции — модуль не должен падать, если ключа нет. Наружу из ошибок уходит
// только статус: ключу и тексту запроса в логах делать нечего.

const URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

export type DeepseekOpts = { maxTokens?: number; timeoutMs?: number; temperature?: number };

/** Ответ модели JSON-объектом; нет ключа, сбой или кривой JSON — null. */
export async function deepseekJson<T>(
  system: string,
  user: string,
  opts: DeepseekOpts = {},
): Promise<T | null> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 1200,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });
    if (!res.ok) {
      console.warn(`[deepseek] ответ ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content;
    return text ? (JSON.parse(text) as T) : null;
  } catch (e) {
    console.warn("[deepseek] сбой:", e instanceof Error ? e.name : "unknown");
    return null;
  }
}

/** Строки из ответа модели: только непустые строки, обрезанные, не больше max. */
export function cleanLines(v: unknown, max: number, len = 160): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.replace(/\s+/g, " ").trim().slice(0, len))
    .filter(Boolean)
    .slice(0, max);
}
