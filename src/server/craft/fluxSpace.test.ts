// Клиент бесплатного генератора: квота — «подождать», чужой адрес — отказ.
import { describe, expect, it } from "vitest";
import { fluxImage } from "./fluxSpace";
import { parseStream, retryAfter } from "./zeroGpuSpace";

const SPACE = "https://black-forest-labs-flux-1-schnell.hf.space";

const done = (body: object) => `data: ${JSON.stringify({ msg: "process_completed", ...body })}\n\n`;

/** Подменный fetch: по началу адреса — свой ответ. */
function fakeFetch(stream: string, image = Buffer.from([1, 2, 3])): typeof fetch {
  return (async (url: string) => {
    if (url.endsWith("/config"))
      return Response.json({ dependencies: [{}, {}, { api_name: "infer" }] });
    if (url.includes("/queue/join")) return Response.json({ event_id: "e1" });
    if (url.includes("/queue/data")) return new Response(stream);
    return new Response(image);
  }) as unknown as typeof fetch;
}

describe("поток очереди", () => {
  it("берёт итог process_completed", () => {
    const s = `data: {"msg":"estimation"}\n\n${done({ success: true, output: { data: [{ url: `${SPACE}/f.webp` }] } })}`;
    expect(parseStream(s)).toEqual({ ok: true, url: `${SPACE}/f.webp` });
    expect(parseStream("data: {}\n")).toBeNull();
  });

  it("срок из «Try again in» — не меньше 5 минут", () => {
    expect(retryAfter("Try again in 0:12:30")).toBe(750);
    expect(retryAfter("Try again in 0:00:00")).toBe(300);
    expect(retryAfter("quota")).toBe(600);
  });
});

describe("генерация", () => {
  it("картинка с того же Space — ok", async () => {
    const s = done({
      success: true,
      output: { data: [{ url: `${SPACE}/gradio_api/file=x.webp` }] },
    });
    const r = await fluxImage("p", 1, fakeFetch(s));
    expect(r).toEqual({ kind: "ok", image: Buffer.from([1, 2, 3]) });
  });

  it("квота кончилась — ждать, а не ошибка", async () => {
    const s = done({
      success: false,
      output: {
        error:
          "You have exceeded your ZeroGPU quota (90s requested vs. 0s left). Try again in 0:05:00.",
      },
    });
    const r = await fluxImage("p", 1, fakeFetch(s));
    expect(r).toMatchObject({ kind: "wait", seconds: 300 });
  });

  it("чужой адрес картинки не качаем", async () => {
    const s = done({ success: true, output: { data: [{ url: "https://evil.example/x.webp" }] } });
    expect(await fluxImage("p", 1, fakeFetch(s))).toEqual({ kind: "fail", why: "foreign url" });
  });

  it("обрыв сети — подождать", async () => {
    const broken = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    expect(await fluxImage("p", 1, broken)).toMatchObject({ kind: "wait" });
  });
});
