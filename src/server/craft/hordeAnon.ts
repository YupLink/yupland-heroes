// Запасной бесплатный генератор лаборатории (§8.81): AI Horde с открытым
// анонимным ключом 0000000000 (документирован самим Horde). Рисуют видеокарты
// добровольцев, дневного лимита нет, но очередь — у анонима последняя:
// замер 26.10.2026 — 12–225 с, бывало до 16 мин. Поэтому заказ асинхронный:
// отправили — запомнили номер в задании, следующие тики спрашивают, готово ли.
//
// Модель: Z-Image-Turbo (Apache-2.0, лучше всех рисует нужный предмет), если
// её кто-то держит; иначе AlbedoBase XL (SDXL, коммерция разрешена) — её
// держат 9–11 добровольцев.
import { downloadImage, errText, type Fetch, type GenResult } from "./genTypes";

const API = "https://aihorde.net/api/v2";
const HEADERS = {
  "Content-Type": "application/json",
  apikey: "0000000000",
  "Client-Agent": "yupland-lab:1.0:https://yupland.io",
  "User-Agent": "yupland-lab/1.0",
};
const NEGATIVE = [
  "shadow, cast shadow, ground, frame, border, text, watermark, signature",
  "multiple objects, crossed weapons, second weapon, emblem, badge",
  "scenery, landscape, photo, realistic, blurry, cropped, dark background",
].join(", ");
/** Дольше — снимаем заказ и считаем попытку неудачной. */
const GIVE_UP_MS = 45 * 60_000;

export type HordeExt = { provider: "horde"; id: string; model: string; at: number; seed: number };
export type HordeStep = GenResult | { kind: "pending"; seconds: number; ext: HordeExt };

const Z_IMAGE = "Z-Image-Turbo";
const ALBEDO = "AlbedoBase XL (SDXL)";

async function pickModel(f: Fetch): Promise<string> {
  try {
    const r = await f(`${API}/status/models?type=image`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(15_000),
    });
    const list = (await r.json()) as Array<{ name?: string; count?: number }>;
    return list.some((m) => m.name === Z_IMAGE && Number(m.count) > 0) ? Z_IMAGE : ALBEDO;
  } catch {
    return ALBEDO;
  }
}

function params(model: string, seed: number) {
  const common = { width: 1024, height: 1024, n: 1, seed: String(seed) };
  return model === Z_IMAGE
    ? { ...common, steps: 8, cfg_scale: 1.0, sampler_name: "k_euler", karras: false }
    : { ...common, steps: 25, cfg_scale: 6, sampler_name: "k_euler_a", karras: true };
}

async function submitOne(prompt: string, seed: number, model: string, f: Fetch) {
  const text = model === Z_IMAGE ? prompt : `pixel art, ${prompt}`;
  const r = await f(`${API}/generate/async`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      prompt: `${text} ### ${NEGATIVE}`,
      params: params(model, seed),
      models: [model],
      nsfw: false,
      censor_nsfw: true,
      r2: true,
      // Анониму Horde всё равно ставит shared: запрос и картинка уходят в
      // открытый набор данных — для иконок игры это не тайна.
      shared: false,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
  return { status: r.status, id: j.id, message: String(j.message ?? r.status).slice(0, 160) };
}

export async function hordeSubmit(
  prompt: string,
  seed: number,
  f: Fetch = fetch,
): Promise<HordeStep> {
  try {
    let model = await pickModel(f);
    let res = await submitOne(prompt, seed, model, f);
    // Z-Image отказали (кудосы, нет исполнителя) — сразу AlbedoBase: её держат 8–11.
    if (!res.id && model === Z_IMAGE) {
      model = ALBEDO;
      res = await submitOne(prompt, seed, model, f);
    }
    if (res.id) {
      const ext: HordeExt = { provider: "horde", id: res.id, model, at: Date.now(), seed };
      return { kind: "pending", seconds: 20, ext };
    }
    // Перегрузка и лимит частоты — позже; прочий отказ (403 кудосы наперёд,
    // 400) — попытка не вышла, иначе задание сутки дёргало бы всех впустую.
    const busy = res.status === 429 || res.status >= 500;
    return busy
      ? { kind: "wait", seconds: 600, why: `horde: ${res.message}` }
      : { kind: "fail", why: `horde: ${res.message}` };
  } catch (e) {
    return { kind: "wait", seconds: 300, why: `horde: ${errText(e)}` };
  }
}

const r2 = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.hostname.endsWith(".r2.cloudflarestorage.com");
  } catch {
    return false;
  }
};

/** Снять заказ в Horde (не дождались, не вышло) — не держать чужую очередь. */
async function cancel(id: string, f: Fetch): Promise<void> {
  await f(`${API}/generate/status/${id}`, {
    method: "DELETE",
    headers: HEADERS,
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
}

async function getJson<T>(url: string, f: Fetch): Promise<{ status: number; body: T }> {
  const r = await f(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as T };
}

export async function hordeCheck(ext: HordeExt, f: Fetch = fetch): Promise<HordeStep> {
  const id = encodeURIComponent(ext.id);
  try {
    const c = await getJson<{ done?: boolean; faulted?: boolean; wait_time?: number }>(
      `${API}/generate/check/${id}`,
      f,
    );
    // Horde забыл заказ — ждать нечего.
    if (c.status === 404) return { kind: "fail", why: "horde: order lost" };
    if (c.body.faulted) {
      await cancel(id, f);
      return { kind: "fail", why: "horde: faulted" };
    }
    if (!c.body.done) {
      // Сначала «готово ли», потом срок: готовую картинку по сроку не выбрасываем.
      if (Date.now() - ext.at > GIVE_UP_MS) {
        await cancel(id, f);
        return { kind: "fail", why: "horde: too long" };
      }
      const s = Math.min(120, Math.max(15, Number(c.body.wait_time) || 30));
      return { kind: "pending", seconds: s, ext };
    }
    const st = await getJson<{ generations?: Array<{ img?: string; censored?: boolean }> }>(
      `${API}/generate/status/${id}`,
      f,
    );
    const g = st.body.generations?.[0];
    if (!g?.img || g.censored) return { kind: "fail", why: "horde: no image" };
    return await downloadImage(g.img, r2, f);
  } catch {
    // Сбой связи с Horde — заказ жив, спросим позже.
    return { kind: "pending", seconds: 60, ext };
  }
}
