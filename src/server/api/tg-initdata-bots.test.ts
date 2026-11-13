// Вход из мини-апки: подпись принимается от любого нашего бота, и сервер
// говорит, какой именно открыл приложение — кошельковый ведёт только в
// кошелёк, игровой — в игру. Чужая подпись не проходит.
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/pg", () => ({ pg: {} }));
vi.mock("../auth", () => ({ setCurrentWallet: () => {} }));

const { verifyTelegramInitData } = await import("./user-drops-hallway");

const WALLET = "111:wallet-bot-token";
const GAME = "222:game-bot-token";

function signed(token: string, fields: Record<string, string>): string {
  const check = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const fresh = () => ({
  auth_date: String(Math.floor(Date.now() / 1000)),
  user: JSON.stringify({ id: 700000001, username: "ownernick" }),
});

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = WALLET;
  process.env.TELEGRAM_GAME_BOT_TOKEN = GAME;
  delete process.env.TELEGRAM_HALLWAY_BOT_TOKEN;
});

describe("подпись мини-апки от разных ботов", () => {
  it("кошельковый бот — wallet, игровой — game, тот же игрок", async () => {
    const w = await verifyTelegramInitData(signed(WALLET, fresh()));
    const g = await verifyTelegramInitData(signed(GAME, fresh()));
    expect(w).toMatchObject({ ok: true, bot: "wallet", telegramId: 700000001 });
    expect(g).toMatchObject({ ok: true, bot: "game", telegramId: 700000001 });
  });

  it("чужой бот — подпись не проходит", async () => {
    expect(await verifyTelegramInitData(signed("333:someone-else", fresh()))).toEqual({
      ok: false,
      error: "bad_signature",
    });
  });

  it("игровой токен не задан — его подпись не проходит, кошельковая работает как раньше", async () => {
    delete process.env.TELEGRAM_GAME_BOT_TOKEN;
    expect((await verifyTelegramInitData(signed(GAME, fresh()))).ok).toBe(false);
    expect(await verifyTelegramInitData(signed(WALLET, fresh()))).toMatchObject({ ok: true, bot: "wallet" });
  });

  it("старая подпись (больше суток) — отказ", async () => {
    const old = { ...fresh(), auth_date: String(Math.floor(Date.now() / 1000) - 90_000) };
    expect(await verifyTelegramInitData(signed(GAME, old))).toEqual({ ok: false, error: "stale" });
  });
});
