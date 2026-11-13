import { afterEach, describe, expect, it, vi } from "vitest";
import { migrateOf, sendPages } from "./vestnik-publish";

const page = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const real = globalThis.fetch;

describe("отправка выпуска в Telegram", () => {
  afterEach(() => {
    globalThis.fetch = real;
    delete process.env.TELEGRAM_GAME_BOT_TOKEN;
  });

  const answer = (status: number, body: unknown) => {
    process.env.TELEGRAM_GAME_BOT_TOKEN = "t";
    const f = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    globalThis.fetch = f as unknown as typeof fetch;
    return f;
  };

  it("одна страница — фото; принято — ok", async () => {
    const f = answer(200, { ok: true });
    expect(await sendPages(-1, [page], "<b>x</b>", "ru")).toEqual({ status: "ok" });
    expect(String((f.mock.calls[0] as unknown[])[0])).toMatch(/\/sendPhoto$/);
  });

  it("две страницы — альбом", async () => {
    const f = answer(200, { ok: true });
    await sendPages(-1, [page, page], "x", "ru");
    expect(String((f.mock.calls[0] as unknown[])[0])).toMatch(/\/sendMediaGroup$/);
  });

  it("отказ — можно повторить; группа переехала — новый номер", async () => {
    answer(400, { ok: false, parameters: { migrate_to_chat_id: -1009 } });
    expect(await sendPages(-1, [page], "x", "ru")).toEqual({
      status: "rejected",
      migrateTo: -1009,
    });
    answer(403, { ok: false, description: "bot was kicked" });
    expect(await sendPages(-1, [page], "x", "ru")).toEqual({
      status: "rejected",
      migrateTo: undefined,
    });
  });

  it("нет ответа или 5xx — «неизвестно», повторять нельзя", async () => {
    answer(502, {});
    expect(await sendPages(-1, [page], "x", "ru")).toEqual({ status: "unknown" });
    process.env.TELEGRAM_GAME_BOT_TOKEN = "t";
    globalThis.fetch = (async () => {
      throw new Error("timeout");
    }) as unknown as typeof fetch;
    expect(await sendPages(-1, [page], "x", "ru")).toEqual({ status: "unknown" });
  });

  it("без токена — отказ без сети", async () => {
    expect(await sendPages(-1, [page], "x", "ru")).toEqual({ status: "rejected" });
    expect(migrateOf({ parameters: { migrate_to_chat_id: "x" } })).toBeUndefined();
  });
});
