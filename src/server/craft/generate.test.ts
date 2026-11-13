// Цепочка генераторов: первый нарисовавший — автор; заказ в Horde — ждём его;
// все отказали — попытка тратится; кто-то занят — ждём.
import { describe, expect, it } from "vitest";
import { generateStep } from "./generate";

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

function fake(route: Route): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) =>
    route(String(input), init)) as typeof fetch;
}

const PNG = Buffer.from([137, 80, 78, 71]);
const sse = (s: string) => new Response(s);

const SANA_OK: Route = (u) => {
  if (u.endsWith("/gradio_api/call/run")) return Response.json({ event_id: "e1" });
  if (u.includes("/gradio_api/call/run/e1"))
    return sse(
      `event: complete\ndata: [[{"image":{"url":"https://sana.hanlab.ai/gradio_api/file=/tmp/x.webp"}}], 1]\n\n`,
    );
  if (u.startsWith("https://sana.hanlab.ai/gradio_api/file=")) return new Response(PNG);
  return new Response("nope", { status: 404 });
};

const SANA_DOWN: Route = (u) =>
  u.startsWith("https://sana.hanlab.ai")
    ? new Response("", { status: 502 })
    : new Response("", { status: 404 });

const FLUX_QUOTA: Route = (u) => {
  if (u.endsWith("/config"))
    return Response.json({ dependencies: [{}, {}, { api_name: "infer" }] });
  if (u.includes("/queue/join")) return Response.json({ event_id: "f1" });
  if (u.includes("/queue/data"))
    return sse(
      `data: {"msg":"process_completed","success":false,"output":{"error":"You have exceeded your ZeroGPU quota. Try again in 0:00:00."}}\n\n`,
    );
  return new Response("", { status: 404 });
};

const HORDE_ACCEPTS: Route = (u) => {
  if (u.includes("/status/models")) return Response.json([{ name: "Z-Image-Turbo", count: 1 }]);
  if (u.endsWith("/generate/async")) return Response.json({ id: "h1", kudos: 10 });
  return new Response("", { status: 404 });
};

const both =
  (...rs: Route[]): Route =>
  (u, i) => {
    for (const r of rs) {
      if (r === SANA_OK || r === SANA_DOWN) {
        if (u.startsWith("https://sana.hanlab.ai")) return r(u, i);
      } else if (r === FLUX_QUOTA) {
        if (u.includes("flux-1-schnell")) return r(u, i);
      } else if (u.includes("aihorde.net")) return r(u, i);
    }
    return new Response("", { status: 404 });
  };

describe("цепочка генераторов", () => {
  it("SANA нарисовала — дальше не идём", async () => {
    const r = await generateStep("p", 1, null, fake(both(SANA_OK)));
    expect(r).toMatchObject({ kind: "ok", provider: "sana-hanlab" });
  });

  it("SANA лежит, у FLUX квота — заказ уходит в Horde", async () => {
    const r = await generateStep("p", 7, null, fake(both(SANA_DOWN, FLUX_QUOTA, HORDE_ACCEPTS)));
    expect(r).toMatchObject({
      kind: "pending",
      ext: { provider: "horde", id: "h1", model: "Z-Image-Turbo", seed: 7 },
    });
  });

  it("заказ в Horde готов — картинка с хранилища Horde", async () => {
    const ext = {
      provider: "horde" as const,
      id: "h1",
      model: "Z-Image-Turbo",
      at: Date.now(),
      seed: 7,
    };
    const r = await generateStep(
      "p",
      7,
      ext,
      fake((u) => {
        if (u.includes("/generate/check/h1")) return Response.json({ done: true });
        if (u.includes("/generate/status/h1"))
          return Response.json({
            generations: [{ img: "https://abc.r2.cloudflarestorage.com/x.webp" }],
          });
        if (u.startsWith("https://abc.r2.cloudflarestorage.com/")) return new Response(PNG);
        return new Response("", { status: 404 });
      }),
    );
    expect(r).toMatchObject({ kind: "ok", provider: "horde:Z-Image-Turbo" });
  });

  it("Horde ещё рисует — ждём, заказ тот же", async () => {
    const ext = { provider: "horde" as const, id: "h1", model: "x", at: Date.now(), seed: 7 };
    const r = await generateStep(
      "p",
      7,
      ext,
      fake(() => Response.json({ done: false, wait_time: 40 })),
    );
    expect(r).toEqual({ kind: "pending", seconds: 40, ext });
  });

  it("все заняты — ждать; картинку с чужого адреса не качаем", async () => {
    const r = await generateStep("p", 1, null, fake(both(SANA_DOWN, FLUX_QUOTA)));
    expect(r.kind).toBe("wait");
    const ext = { provider: "horde" as const, id: "h2", model: "x", at: Date.now(), seed: 1 };
    const evil = await generateStep(
      "p",
      1,
      ext,
      fake((u) =>
        u.includes("/check/")
          ? Response.json({ done: true })
          : Response.json({ generations: [{ img: "https://evil.example/x.webp" }] }),
      ),
    );
    expect(evil).toEqual({ kind: "fail", why: "foreign url" });
  });
});

describe("Horde: отказы", () => {
  const ext = { provider: "horde" as const, id: "h9", model: "x", at: Date.now(), seed: 1 };

  it("Z-Image отказали — тут же AlbedoBase", async () => {
    const asked: string[] = [];
    const r = await generateStep(
      "p",
      3,
      null,
      fake(
        both(SANA_DOWN, FLUX_QUOTA, (u, i) => {
          if (u.includes("/status/models"))
            return Response.json([{ name: "Z-Image-Turbo", count: 1 }]);
          if (u.endsWith("/generate/async")) {
            const model = JSON.parse(String(i?.body)).models[0] as string;
            asked.push(model);
            return model === "Z-Image-Turbo"
              ? Response.json(
                  { message: "needs kudos upfront", rc: "KudosUpfront" },
                  { status: 403 },
                )
              : Response.json({ id: "h2" });
          }
          return new Response("", { status: 404 });
        }),
      ),
    );
    expect(asked).toEqual(["Z-Image-Turbo", "AlbedoBase XL (SDXL)"]);
    expect(r).toMatchObject({ kind: "pending", ext: { model: "AlbedoBase XL (SDXL)", id: "h2" } });
  });

  it("отказ 4xx у всех — попытка тратится, а не сутки ожидания", async () => {
    const r = await generateStep(
      "p",
      3,
      null,
      fake((u) => {
        if (u.startsWith("https://sana.hanlab.ai")) return new Response("", { status: 400 });
        if (u.includes("flux-1-schnell")) return new Response("", { status: 400 });
        if (u.includes("/status/models")) return Response.json([]);
        return Response.json({ message: "bad request" }, { status: 400 });
      }),
    );
    expect(r.kind).toBe("fail");
  });

  it("Horde забыл заказ (404) — сразу «не вышло»", async () => {
    const r = await generateStep(
      "p",
      1,
      ext,
      fake(() => Response.json({ message: "not found" }, { status: 404 })),
    );
    expect(r).toEqual({ kind: "fail", why: "horde: order lost" });
  });

  it("готовую картинку по сроку не выбрасываем", async () => {
    const old = { ...ext, at: Date.now() - 2 * 3600_000 };
    const r = await generateStep(
      "p",
      1,
      old,
      fake((u) => {
        if (u.includes("/check/")) return Response.json({ done: true });
        if (u.includes("/status/"))
          return Response.json({
            generations: [{ img: "https://q.r2.cloudflarestorage.com/a.webp" }],
          });
        return new Response(PNG);
      }),
    );
    expect(r.kind).toBe("ok");
  });
});

describe("SanaSprint", () => {
  it("SANA лежит — рисует SanaSprint на Hugging Face", async () => {
    const SP = "https://efficient-large-model-sanasprint.hf.space";
    const r = await generateStep(
      "p",
      5,
      null,
      fake((u, i) => {
        if (u.startsWith("https://sana.hanlab.ai"))
          return new Response("error code: 1033", { status: 530 });
        if (u === `${SP}/config`)
          return Response.json({ dependencies: [{}, {}, { api_name: "infer" }] });
        if (u === `${SP}/gradio_api/queue/join`) {
          const body = JSON.parse(String(i?.body));
          expect(body.data[0]).toBe("p, single object only");
          return Response.json({ event_id: "s1" });
        }
        if (u.startsWith(`${SP}/gradio_api/queue/data`))
          return sse(
            `data: {"msg":"process_completed","success":true,"output":{"data":[{"url":"${SP}/gradio_api/file=/tmp/a.webp"}]}}\n\n`,
          );
        if (u.startsWith(`${SP}/gradio_api/file=`)) return new Response(PNG);
        return new Response("", { status: 404 });
      }),
    );
    expect(r).toMatchObject({ kind: "ok", provider: "hf-sana-sprint" });
  });
});
