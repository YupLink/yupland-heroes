// Основной бесплатный генератор лаборатории (§8.81): официальное демо SANA-1.6B
// лаборатории MIT HAN Lab (sana.hanlab.ai). Своя видеокарта лаборатории, не
// ZeroGPU Hugging Face — квоты на адрес нет. Ключ не нужен. Веса Apache-2.0.
// Замер 26.10.2026: 9–11 с на картинку 1024×1024, 20+ вызовов подряд без
// отказов; предмет верный, мотив расы виден (шлем пчелы — соты и крылья,
// сапоги юпика — рога). Демо — исследовательское, без обещаний: ляжет — цепочка
// (generate.ts) пойдёт к следующему генератору.
//
// Стиль «Pixel art» демо сам дописывает к запросу «pixel-art … 8-bit»;
// отрицательный запрос убирает тень под предметом, рамки и лишние предметы.
import { downloadImage, errText, type Fetch, type GenResult } from "./genTypes";

const HOST = "https://sana.hanlab.ai";
// Без «скрещённого оружия» и «эмблем» SANA любит дорисовать за мечом посох,
// за шлемом — мечи (замер 26.10: с ними 6 из 6 проб — один предмет).
const NEGATIVE = [
  "shadow, drop shadow, cast shadow, ground, floor, reflection, frame, border, text, watermark",
  "multiple objects, two items, crossed weapons, second weapon, extra weapons, weapon behind",
  "emblem, badge, coat of arms, scenery, background pattern",
].join(", ");

/** Итог из потока /gradio_api/call/run/<id>: адрес картинки или текст отказа. */
export function parseSanaStream(text: string): { url: string } | { error: string } | null {
  const done = /event: complete\ndata: (.*)/.exec(text);
  if (done) {
    try {
      const data = JSON.parse(done[1]) as Array<Array<{ image?: { url?: unknown } }>>;
      const url = data?.[0]?.[0]?.image?.url;
      return typeof url === "string" ? { url } : { error: "no image" };
    } catch {
      return { error: "bad answer" };
    }
  }
  const err = /event: error\ndata: (.*)/.exec(text);
  return err ? { error: err[1].slice(0, 200) } : null;
}

export async function sanaImage(
  prompt: string,
  seed: number,
  f: Fetch = fetch,
): Promise<GenResult> {
  try {
    const start = await f(`${HOST}/gradio_api/call/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // prompt, negative, style, use_negative, num_imgs, seed, h, w, guidance, pag, steps, randomize
      body: JSON.stringify({
        data: [prompt, NEGATIVE, "Pixel art", true, 1, seed, 1024, 1024, 4.5, 1.0, 20, false],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (start.status === 429 || start.status >= 500) {
      return { kind: "wait", seconds: 300, why: `sana ${start.status}` };
    }
    if (!start.ok) return { kind: "fail", why: `sana ${start.status}` };
    const { event_id: id } = (await start.json()) as { event_id?: string };
    if (!id) return { kind: "fail", why: "sana no event" };
    const stream = await f(`${HOST}/gradio_api/call/run/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(90_000),
    });
    const done = parseSanaStream(await stream.text());
    if (!done) return { kind: "wait", seconds: 120, why: "sana no result" };
    if ("error" in done) return { kind: "wait", seconds: 300, why: `sana: ${done.error}` };
    return await downloadImage(done.url, (u) => u.startsWith(`${HOST}/gradio_api/file=`), f);
  } catch (e) {
    return { kind: "wait", seconds: 120, why: `sana: ${errText(e)}` };
  }
}
