// Клиент MiMo: разбор ключей, обход ключей по 429/5xx и — главное — ни
// ключа, ни промпта в тексте ошибки. Сеть — заглушка fetch (setup.ts её
// и так запрещает).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askMimo, mimoConfigured, parseMimoKeys } from "./mimo";

const SECRET_A = "tp-aaaa-secret";
const SECRET_B = "sk-bbbb-secret";

const reply = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("parseMimoKeys", () => {
  it("хост по префиксу: tp- → тарифный план, иначе общий API", () => {
    expect(parseMimoKeys(`${SECRET_A}, ${SECRET_B}`)).toEqual([
      { key: SECRET_A, host: "https://token-plan-sgp.xiaomimimo.com" },
      { key: SECRET_B, host: "https://api.xiaomimimo.com" },
    ]);
  });

  it("явный хост суффиксом @, пустые куски пропускаются", () => {
    expect(parseMimoKeys(`,${SECRET_B}@https://my.host , `)).toEqual([
      { key: SECRET_B, host: "https://my.host" },
    ]);
  });
});

describe("askMimo", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    // Ключи здесь свои: два, чтобы был кому передать эстафету.
    vi.stubEnv("MIMO_API_KEYS", `${SECRET_A},${SECRET_B}`);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("без ключей — не настроен и падает до похода в сеть", async () => {
    vi.stubEnv("MIMO_API_KEYS", "");
    expect(mimoConfigured()).toBe(false);
    await expect(askMimo("x")).rejects.toThrow(/нет ключей/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("склеивает только text-блоки, ключ уходит заголовком x-api-key", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        content: [
          { type: "thinking", text: "hm" },
          { type: "text", text: "{" },
          { type: "text", text: "}" },
        ],
      }),
    );
    expect(mimoConfigured()).toBe(true);
    expect(await askMimo("вопрос")).toBe("{}");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://token-plan-sgp.xiaomimimo.com/anthropic/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe(SECRET_A);
    expect(JSON.parse(String(init.body))).toMatchObject({
      messages: [{ role: "user", content: "вопрос" }],
    });
  });

  it("429 у первого ключа — эстафета второму, ответ приходит", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(200, { content: [{ type: "text", text: "ok" }] }));
    expect(await askMimo("вопрос")).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1] as [string])[0]).toContain("api.xiaomimimo.com");
  });

  it("все ключи отказали — в ошибке хост и статус, но ни ключа, ни промпта", async () => {
    // Ключи после 429 выше ещё на паузе: свежая пара, чтобы проверить 5xx.
    vi.stubEnv("MIMO_API_KEYS", "tp-fresh-one@https://h1.test,sk-fresh-two@https://h2.test");
    fetchMock
      .mockResolvedValueOnce(reply(503))
      .mockRejectedValueOnce(new TypeError("fetch failed"));
    const err = await askMimo("СЕКРЕТНЫЙ ПРОМПТ").catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/h2\.test: сеть/);
    expect((err as Error).message).not.toContain("fresh");
    expect((err as Error).message).not.toContain("ПРОМПТ");
  });

  it("4xx кроме 429/401/403 — сразу ошибка, второй ключ не дёргается", async () => {
    vi.stubEnv("MIMO_API_KEYS", "tp-bad-req@https://h3.test,sk-never@https://h4.test");
    fetchMock.mockResolvedValueOnce(reply(400));
    await expect(askMimo("x")).rejects.toThrow(/h3\.test: HTTP 400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
