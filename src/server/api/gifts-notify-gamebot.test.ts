// Письмо о подарке уходит от игрового бота @yupland_heroes_bot с кнопкой в
// игру (владелец 20.10), язык кнопки — язык игрока.
import { describe, expect, it, vi } from "vitest";

const sent: Array<{ tg: number; text: string; button: string; url: string }> = [];
vi.mock("../db/mcpClient", () => ({
  mcpExec: async () => [
    { account_id: "acc_ru", telegram_id: 101 },
    { account_id: "acc_en", telegram_id: "202" },
    { account_id: "acc_none", telegram_id: null },
  ],
}));
vi.mock("./chips-utils", () => ({ sqlStr: (v: string) => `'${v}'` }));
vi.mock("../userLang", () => ({ getUserLang: async (tg: number) => (tg === 101 ? "ru" : "en") }));
vi.mock("../tgGameBot", async (orig) => ({
  ...(await orig<typeof import("../tgGameBot")>()),
  gameBotSendIfEnabled: async (
    tg: number,
    text: string,
    b: { inline_keyboard: Array<Array<{ text: string; web_app: { url: string } }>> },
  ) => {
    sent.push({
      tg,
      text,
      button: b.inline_keyboard[0][0].text,
      url: b.inline_keyboard[0][0].web_app.url,
    });
    return true;
  },
}));

const { notifyGifts } = await import("./gifts-notify");

describe("письмо о подарке", () => {
  it("от игрового бота, с кнопкой в игру на языке игрока; без Telegram — никому", async () => {
    const n = await notifyGifts([
      { accountId: "acc_ru" },
      { accountId: "acc_en" },
      { accountId: "acc_none" },
    ]);
    expect(n).toBe(2);
    expect(sent.map((s) => [s.tg, s.button, s.url])).toEqual([
      [101, "🎮 Играть", "https://service.yupland.io/chips"],
      [202, "🎮 Play", "https://service.yupland.io/chips"],
    ]);
  });
});

describe("письмо о начислении по подписке (владелец 25.10.2026)", () => {
  it("не «подарок» и без 48 часов: имя тарифа на языке игрока, забрать сегодня", async () => {
    sent.length = 0;
    const tier = { ru: "Эксперт", en: "Expert" };
    await notifyGifts([
      { accountId: "acc_ru", esubTier: tier },
      { accountId: "acc_en", esubTier: tier },
    ]);
    expect(sent[0].text).toBe(
      "<b>⚡ Начисление по подписке «Эксперт»</b>\n\nЗабрать можно только сегодня 👇",
    );
    expect(sent[1].text).toBe("<b>⚡ “Expert” subscription accrual</b>\n\nClaim it today only 👇");
    for (const s of sent) expect(s.text).not.toMatch(/48|подарок|gift/i);
  });

  it("обычный подарок — прежнее письмо", async () => {
    sent.length = 0;
    await notifyGifts([{ accountId: "acc_ru" }]);
    expect(sent[0].text).toContain("🎁 Тебе пришёл подарок");
  });
});

describe("имя тарифа в письме — HTML-безопасно", () => {
  it("«&» и «<» экранируются", async () => {
    sent.length = 0;
    await notifyGifts([{ accountId: "acc_ru", esubTier: { ru: "A&B <x>", en: "A&B" } }]);
    expect(sent[0].text).toContain("«A&amp;B &lt;x&gt;»");
  });
});
