// Cloudflare Workers AI: картинка base64, лимит суток — ждать до полуночи UTC,
// без ключей — молча мимо.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cfImage, untilUtcMidnight } from "./cfWorkersAi";

const PNG = Buffer.from([137, 80, 78, 71]);
const answer = (body: unknown, status = 200) =>
  (async () => Response.json(body, { status })) as unknown as typeof fetch;

describe("Cloudflare Workers AI", () => {
  beforeEach(() => {
    process.env.CF_ACCOUNT_ID = "acc";
    process.env.CF_AI_TOKEN = "tok";
  });
  afterEach(() => {
    delete process.env.CF_ACCOUNT_ID;
    delete process.env.CF_AI_TOKEN;
  });

  it("картинка — из base64 ответа", async () => {
    const r = await cfImage(
      "p",
      answer({ success: true, result: { image: PNG.toString("base64") } }),
    );
    expect(r).toEqual({ kind: "ok", image: PNG });
  });

  it("суточный лимит — ждать до полуночи UTC", async () => {
    const r = await cfImage(
      "p",
      answer(
        {
          success: false,
          errors: [{ message: "you have used up your daily free allocation of 10,000 neurons" }],
        },
        429,
      ),
    );
    expect(r.kind).toBe("wait");
  });

  it("нет ключей — мимо, без запроса", async () => {
    delete process.env.CF_AI_TOKEN;
    let asked = false;
    const r = await cfImage("p", (async () => {
      asked = true;
      return new Response("");
    }) as unknown as typeof fetch);
    expect(r).toEqual({ kind: "fail", why: "cf: no key" });
    expect(asked).toBe(false);
  });

  it("неверный запрос — отказ", async () => {
    const r = await cfImage(
      "p",
      answer({ success: false, errors: [{ message: "Bad input" }] }, 400),
    );
    expect(r).toEqual({ kind: "fail", why: "cf: Bad input" });
  });

  it("до полуночи UTC — не меньше 5 минут", () => {
    expect(untilUtcMidnight(Date.UTC(2026, 9, 28, 23, 59, 0))).toBe(300);
    expect(untilUtcMidnight(Date.UTC(2026, 9, 28, 12, 0, 0))).toBe(12 * 3600);
  });
});
