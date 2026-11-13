// Заказ генератора артефактов (§8.122): рисуют бесплатные, пока могут; исчерпаны
// или лежат — fal.ai (владелец 11.11.2026); лаборатория fal.ai не трогает.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateStep } from "./generate";

const PNG = Buffer.from([137, 80, 78, 71]);
const FAL_OK = Response.json({
  images: [{ url: `data:image/jpeg;base64,${PNG.toString("base64")}` }],
});

/** Бесплатные: SANA — как скажут, остальные не отвечают; fal.ai — рисует. */
function world(sanaUp: boolean, calls: string[]): typeof fetch {
  return (async (input: string | URL) => {
    const u = String(input);
    calls.push(u);
    if (u.startsWith("https://fal.run/")) return FAL_OK.clone();
    if (sanaUp && u.endsWith("/gradio_api/call/run")) return Response.json({ event_id: "e1" });
    if (sanaUp && u.includes("/gradio_api/call/run/e1"))
      return new Response(
        `event: complete\ndata: [[{"image":{"url":"https://sana.hanlab.ai/gradio_api/file=/tmp/x.webp"}}], 1]\n\n`,
      );
    if (sanaUp && u.startsWith("https://sana.hanlab.ai/gradio_api/file=")) return new Response(PNG);
    return new Response("", { status: 502 });
  }) as typeof fetch;
}

describe("платный fal.ai после бесплатных", () => {
  beforeEach(() => {
    process.env.FAL_KEY = "k1";
  });
  afterEach(() => {
    delete process.env.FAL_KEY;
  });

  it("бесплатный нарисовал — fal.ai не зовём", async () => {
    const calls: string[] = [];
    const r = await generateStep("p", 1, null, world(true, calls), true);
    expect(r).toMatchObject({ kind: "ok", provider: "sana-hanlab" });
    expect(calls.some((u) => u.startsWith("https://fal.run/"))).toBe(false);
  });

  it("бесплатные исчерпаны или лежат — рисует fal.ai, до Horde не доходим", async () => {
    const calls: string[] = [];
    const r = await generateStep("p", 1, null, world(false, calls), true);
    expect(r).toMatchObject({ kind: "ok", provider: "fal-flux-schnell" });
    expect(calls.some((u) => u.includes("aihorde.net"))).toBe(false);
  });

  it("не заказ игрока (лаборатория) — fal.ai не трогаем", async () => {
    const calls: string[] = [];
    await generateStep("p", 1, null, world(false, calls), false);
    expect(calls.some((u) => u.startsWith("https://fal.run/"))).toBe(false);
  });
});
