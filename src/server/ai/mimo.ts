// Клиент к MiMo (Anthropic-совместимый Messages API) — по образцу задачника
// (blok_zadach/server/mimo.py), у которого те же ключи и тот же сервер.
//
// Ключи попадают в серверный бандл через define из .env (см. vite.config.ts:
// .env подмешивается ТОЛЬКО в окружения ssr/nitro), клиенту недоступны.
// Вызывать только из server fn с requireAdmin(): ИИ платный, и «сгенерируй
// рецепт» из рук игрока — это счёт на чужие деньги.
//
// Наружу из ошибок уходят ТОЛЬКО статус и хост: они долетают до тоста в
// админке и в логи, а ни ключу, ни телу запроса (промпт с описанием карты)
// там делать нечего. process.env читается внутри функций, а не на верхнем
// уровне модуля: серверный модуль, утёкший в клиент, ронял гидрацию
// (knowledge: pg.ts).

const HOST_TOKEN_PLAN = "https://token-plan-sgp.xiaomimimo.com";
const HOST_API = "https://api.xiaomimimo.com";
const DEFAULT_MODEL = "mimo-v2.5-pro";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 4000;
/** После 429 ключ отдыхает 5 минут, после 401/403 — час (как в задачнике). */
const COOLDOWN_RATE_MS = 5 * 60_000;
const COOLDOWN_AUTH_MS = 60 * 60_000;

export type MimoKey = { key: string; host: string };

/**
 * (ключ, хост) по приоритету из `MIMO_API_KEYS`: список через запятую, хост
 * можно задать явно суффиксом `ключ@https://host`, иначе решает префикс ключа:
 * `tp-` — тарифный план, всё остальное — общий API.
 */
export function parseMimoKeys(raw: string): MimoKey[] {
  const out: MimoKey[] = [];
  for (const chunk of raw.split(",")) {
    const at = chunk.indexOf("@");
    const key = (at >= 0 ? chunk.slice(0, at) : chunk).trim();
    const host = (at >= 0 ? chunk.slice(at + 1) : "").trim();
    if (!key) continue;
    out.push({ key, host: host || (key.startsWith("tp-") ? HOST_TOKEN_PLAN : HOST_API) });
  }
  return out;
}

const keys = (): MimoKey[] =>
  parseMimoKeys(process.env.MIMO_API_KEYS ?? process.env.MIMO_API_KEY ?? "");

export function mimoConfigured(): boolean {
  return keys().length > 0;
}

/** Ключ → когда снова можно пробовать (мс эпохи). Живёт в памяти процесса. */
const cooldown = new Map<string, number>();

type MessagesResponse = { content?: Array<{ type?: string; text?: string }> };

async function post(
  { key, host }: MimoKey,
  prompt: string,
  maxTokens: number,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${host}/anthropic/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.MIMO_MODEL ?? DEFAULT_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Один вопрос — один текстовый ответ (блоки размышлений отбрасываются).
 * 429/5xx/сеть/таймаут — следующий ключ; прочие 4xx — сразу ошибка, другим
 * ключом её не исправить.
 */
export async function askMimo(
  prompt: string,
  opts?: { maxTokens?: number; timeoutMs?: number },
): Promise<string> {
  const list = keys();
  if (list.length === 0) throw new Error("MiMo не настроен: нет ключей");
  const maxTokens = opts?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let last = "все ключи на паузе после отказа";
  for (const kh of list) {
    if ((cooldown.get(kh.key) ?? 0) > Date.now()) continue;
    let res: Response;
    try {
      res = await post(kh, prompt, maxTokens, timeoutMs);
    } catch (e) {
      last = `${kh.host}: ${e instanceof Error && e.name === "AbortError" ? "таймаут" : "сеть"}`;
      continue;
    }
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as MessagesResponse;
      return (data.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
    }
    last = `${kh.host}: HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403)
      cooldown.set(kh.key, Date.now() + COOLDOWN_AUTH_MS);
    else if (res.status === 429) cooldown.set(kh.key, Date.now() + COOLDOWN_RATE_MS);
    else if (res.status < 500) throw new Error(`MiMo не ответил: ${last}`);
  }
  throw new Error(`MiMo не ответил: ${last}`);
}
