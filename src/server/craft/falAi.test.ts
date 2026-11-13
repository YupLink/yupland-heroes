// fal.ai: картинка из ответа (data URI), занято — ждать, нет денег/ключа — не рисует.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { falImage, falOn } from "./falAi";

const PNG = Buffer.from([137, 80, 78, 71]);
const dataUri = `data:image/jpeg;base64,${PNG.toString("base64")}`;

function answer(body: unknown, status = 200, seen: RequestInit[] = []): typeof fetch {
  return (async (_u: string, init?: RequestInit) => {
    if (init) seen.push(init);
    return Response.json(body, { status });
  }) as unknown as typeof fetch;
}

describe("fal.ai", () => {
  beforeEach(() => {
    process.env.FAL_KEY = "k1";
  });
  afterEach(() => {
    delete process.env.FAL_KEY;
  });

  it("картинка — из ответа; ключ, посев, настройки как у Cloudflare", async () => {
    const seen: RequestInit[] = [];
    const r = await falImage("p", 42, answer({ images: [{ url: dataUri }] }, 200, seen));
    expect(r).toEqual({ kind: "ok", image: PNG });
    expect((seen[0].headers as Record<string, string>).Authorization).toBe("Key k1");
    expect(JSON.parse(String(seen[0].body))).toMatchObject({
      seed: 42,
      image_size: { width: 1024, height: 1024 },
      num_inference_steps: 4,
      sync_mode: true,
    });
  });

  it("занято или сбой у них — ждать", async () => {
    expect((await falImage("p", 1, answer({}, 429))).kind).toBe("wait");
    expect((await falImage("p", 1, answer({}, 503))).kind).toBe("wait");
  });

  it("нет денег / неверный ключ — не рисует", async () => {
    expect((await falImage("p", 1, answer({ detail: "Exhausted balance" }, 403))).kind).toBe(
      "fail",
    );
    expect((await falImage("p", 1, answer({}, 401))).kind).toBe("fail");
  });

  it("чужой адрес вместо картинки и NSFW — брак", async () => {
    const foreign = answer({ images: [{ url: "https://evil.example/x.png" }] });
    expect((await falImage("p", 1, foreign)).kind).toBe("fail");
    const nsfw = answer({ images: [{ url: dataUri }], has_nsfw_concepts: [true] });
    expect((await falImage("p", 1, nsfw)).kind).toBe("fail");
  });

  it("без ключа — выключен", async () => {
    delete process.env.FAL_KEY;
    expect(falOn()).toBe(false);
    expect((await falImage("p", 1, answer({}))).kind).toBe("fail");
  });
});
