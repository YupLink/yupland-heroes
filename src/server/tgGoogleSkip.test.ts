// Google-игроку (id ≥ 2^52) в Telegram писать некуда: Bot API не зовём вовсе.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_TG_BASE } from "@/lib/auth/googleTg";

vi.mock("./db/pg", () => ({ pg: {} }));

const { tgSendMessage, tgSendPhoto } = await import("./tg");
const { gameBotSend, gamePlayButton } = await import("./tgGameBot");

const realFetch = globalThis.fetch;
let hits: string[] = [];

beforeEach(() => {
  hits = [];
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_GAME_BOT_TOKEN = "test-game-token";
  globalThis.fetch = vi.fn(async (url: unknown) => {
    hits.push(String(url));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_GAME_BOT_TOKEN;
});

describe("Telegram: Google-id молча пропускаем", () => {
  it("сообщение, фото и игровой бот на Google-id — false без похода в Bot API", async () => {
    const google = GOOGLE_TG_BASE + 3;
    await expect(tgSendMessage(google, "hi")).resolves.toBe(false);
    await expect(tgSendPhoto(google, "https://x/p.png", "hi")).resolves.toBe(false);
    await expect(gameBotSend(google, "hi", gamePlayButton("Play"))).resolves.toBe(false);
    expect(hits).toEqual([]);
  });

  it("настоящему Telegram отправляем как раньше", async () => {
    await expect(tgSendMessage(700000002, "hi")).resolves.toBe(true);
    await expect(gameBotSend(700000002, "hi", gamePlayButton("Play"))).resolves.toBe(true);
    expect(hits).toHaveLength(2);
  });
});
