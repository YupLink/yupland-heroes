// Своя кнопка Telegram: адрес окна входа как у widget.js, ответ окна и возврат переходом.
import { describe, expect, it } from "vitest";
import { authFromMessage, parseTgAuthHash, tgOauthUrl } from "./tgOauth";

const user = { id: 42, first_name: "A", auth_date: 1_800_000_000, hash: "abc" };
const b64url = (v: unknown) =>
  btoa(JSON.stringify(v)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("tgOauth", () => {
  it("окно входа: бот, сайт, запрос на сообщения, язык, возврат", () => {
    expect(
      tgOauthUrl({
        botId: 123,
        origin: "https://service.yupland.io",
        lang: "ru",
        returnTo: "https://service.yupland.io/?ref=tg1",
      }),
    ).toBe(
      "https://oauth.telegram.org/auth?bot_id=123&origin=https%3A%2F%2Fservice.yupland.io&request_access=write&lang=ru&return_to=https%3A%2F%2Fservice.yupland.io%2F%3Fref%3Dtg1",
    );
  });

  it("ответ окна: auth_result с данными — вход, без — отказ, чужое — мимо", () => {
    expect(authFromMessage(JSON.stringify({ event: "auth_result", result: user }))).toEqual(user);
    expect(authFromMessage(JSON.stringify({ event: "auth_result", result: false }))).toBe(false);
    expect(authFromMessage(JSON.stringify({ event: "resize" }))).toBeNull();
    expect(authFromMessage("not json")).toBeNull();
  });

  it("возврат переходом: #tgAuthResult — данные; мусор — null", () => {
    expect(parseTgAuthHash(`#tgAuthResult=${b64url(user)}`)).toEqual(user);
    expect(parseTgAuthHash("#tgAuthResult=@@@")).toBeNull();
    expect(parseTgAuthHash("#other")).toBeNull();
  });
});
