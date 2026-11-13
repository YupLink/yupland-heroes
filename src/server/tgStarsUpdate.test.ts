// Звёзды через игровой бот (владелец 02.11.2026): счёт выставляет @yupland_heroes_bot, на
// pre_checkout отвечает тот бот, чей счёт, зачисление — идемпотентно, письмо — от того же бота.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  answers: [] as Array<{ id: string; ok: boolean; bot: string }>,
  walletMsgs: [] as number[],
  gameMsgs: [] as number[],
  credits: [] as Array<{ chargeId: string; tgId: number; amountStars: number }>,
}));

vi.mock("./tg", async (orig) => ({
  ...(await orig<typeof import("./tg")>()),
  answerPreCheckoutQuery: async (id: string, ok: boolean, _m?: string, bot = "wallet") => {
    s.answers.push({ id, ok, bot });
    return true;
  },
  tgSendMessage: async (id: number) => {
    s.walletMsgs.push(id);
    return true;
  },
}));
vi.mock("./tgGameBot", () => ({
  gameBotSend: async (id: number) => {
    s.gameMsgs.push(id);
    return true;
  },
  gamePlayButton: () => ({ inline_keyboard: [] }),
}));
vi.mock("./userLang", () => ({ getUserLang: async () => "ru" }));
vi.mock("./api/currency/stars", () => ({
  creditAccountStars: async (a: { chargeId: string; tgId: number; amountStars: number }) => {
    s.credits.push(a);
    return { credited: true, balance: a.amountStars };
  },
}));

const { handleStarsUpdate, starsPayloadOk } = await import("./tgStarsUpdate");
const { createStarsInvoiceLink } = await import("./tg");

const payer = { id: 777 };
const accStars = JSON.stringify({ k: "acc_stars", tg: 777, o: 100 });

beforeEach(() => {
  s.answers = [];
  s.walletMsgs = [];
  s.gameMsgs = [];
  s.credits = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("звёзды через игровой бот", () => {
  it("счёт выставляет игровой бот — его токеном", async () => {
    vi.stubEnv("TELEGRAM_GAME_BOT_TOKEN", "GAME");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "WALLET");
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ ok: true, result: "https://t.me/$inv" }));
    });
    const link = await createStarsInvoiceLink({
      title: "Пополнение",
      description: "100★",
      payload: accStars,
      amountStars: 100,
    });
    expect(link).toBe("https://t.me/$inv");
    expect(urls).toEqual(["https://api.telegram.org/botGAME/createInvoiceLink"]);
  });

  it("pre_checkout: отвечает тот бот, чей счёт; чужой payload — отказ", async () => {
    const pcq = {
      id: "q1",
      from: payer,
      currency: "XTR",
      total_amount: 100,
      invoice_payload: accStars,
    };
    expect(await handleStarsUpdate({ pre_checkout_query: pcq }, "game")).toBe(true);
    expect(await handleStarsUpdate({ pre_checkout_query: { ...pcq, id: "q2" } }, "wallet")).toBe(
      true,
    );
    await handleStarsUpdate(
      { pre_checkout_query: { ...pcq, id: "q3", invoice_payload: "x" } },
      "game",
    );
    expect(s.answers).toEqual([
      { id: "q1", ok: true, bot: "game" },
      { id: "q2", ok: true, bot: "wallet" },
      { id: "q3", ok: false, bot: "game" },
    ]);
    expect(starsPayloadOk("USD", accStars, 100)).toBe(false);
  });

  it("successful_payment: зачисление по платежу, письмо — от игрового бота", async () => {
    const sp = {
      currency: "XTR",
      total_amount: 100,
      invoice_payload: accStars,
      telegram_payment_charge_id: "ch1",
    };
    expect(
      await handleStarsUpdate({ message: { from: payer, successful_payment: sp } }, "game"),
    ).toBe(true);
    expect(s.credits).toEqual([{ chargeId: "ch1", tgId: 777, amountStars: 100 }]);
    expect(s.gameMsgs).toEqual([777]);
    expect(s.walletMsgs).toEqual([]);
  });

  it("не платёжный апдейт — не наш", async () => {
    expect(await handleStarsUpdate({ message: { from: payer } }, "game")).toBe(false);
    expect(s.answers).toEqual([]);
  });
});
