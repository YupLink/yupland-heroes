import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanLines, deepseekJson } from "./deepseek";

const real = globalThis.fetch;

describe("DeepSeek", () => {
  afterEach(() => {
    globalThis.fetch = real;
    delete process.env.DEEPSEEK_API_KEY;
  });

  it("без ключа — null, в сеть не ходим", async () => {
    const f = vi.fn();
    globalThis.fetch = f as unknown as typeof fetch;
    expect(await deepseekJson("s", "u")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("ответ — JSON из сообщения модели; просим именно JSON", async () => {
    process.env.DEEPSEEK_API_KEY = "k";
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: '{"ru":["a"]}' } }] }), {
          status: 200,
        }),
    );
    globalThis.fetch = f as unknown as typeof fetch;
    expect(await deepseekJson<{ ru: string[] }>("s", "u")).toEqual({ ru: ["a"] });
    const body = JSON.parse(
      String(
        (f.mock.calls[0] as unknown[])[1] &&
          ((f.mock.calls[0] as unknown[])[1] as RequestInit).body,
      ),
    );
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.model).toBe("deepseek-chat");
  });

  it("ошибка или кривой JSON — null", async () => {
    process.env.DEEPSEEK_API_KEY = "k";
    globalThis.fetch = (async () => new Response("no", { status: 402 })) as unknown as typeof fetch;
    expect(await deepseekJson("s", "u")).toBeNull();
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "не json" } }] }), {
        status: 200,
      })) as unknown as typeof fetch;
    expect(await deepseekJson("s", "u")).toBeNull();
  });

  it("cleanLines: только строки, без пустых, с пределом", () => {
    expect(cleanLines(["  a  b ", "", 3, "c", "d"], 2)).toEqual(["a b", "c"]);
    expect(cleanLines("x", 3)).toEqual([]);
  });
});
