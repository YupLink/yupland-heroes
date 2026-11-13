// Игровой бот: кнопка «Играть» ведёт сразу в игру (/chips), реферал — в адресе.
import { describe, expect, it } from "vitest";
import { GAME_URL, gamePlayButton } from "./tgGameBot";

describe("кнопка игрового бота", () => {
  it("открывает игру, реферал — в адресе", () => {
    expect(GAME_URL).toBe("https://service.yupland.io/chips");
    expect(gamePlayButton("🎮 Играть").inline_keyboard[0][0]).toEqual({
      text: "🎮 Играть",
      web_app: { url: "https://service.yupland.io/chips" },
    });
    expect(gamePlayButton("🎮 Play", "tg42").inline_keyboard[0][0].web_app.url).toBe(
      "https://service.yupland.io/chips?ref=tg42",
    );
  });
});
