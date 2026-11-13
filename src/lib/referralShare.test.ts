// «Поделиться» приглашением (09.11.2026): в Телеграме — ссылка бота в его окне выбора
// чата, в браузере — ссылка сайта; подпись «кто позвал» — @ник или «друг».
import { describe, expect, it } from "vitest";
import { cleanTgName, inviteWhoText, shareLink, tgShareUrl } from "./referralShare";

describe("ссылка «Поделиться»", () => {
  it("окно Телеграма: ссылка и текст закодированы", () => {
    expect(tgShareUrl("https://t.me/bot?start=ref1", "Зову & 🎁")).toBe(
      "https://t.me/share/url?url=https%3A%2F%2Ft.me%2Fbot%3Fstart%3Dref1&text=%D0%97%D0%BE%D0%B2%D1%83%20%26%20%F0%9F%8E%81",
    );
  });

  it("в Телеграме — ссылка бота, в браузере — сайта; нет сайта — бота", () => {
    expect(shareLink(true, "tg-link", "web-link")).toBe("tg-link");
    expect(shareLink(false, "tg-link", "web-link")).toBe("web-link");
    expect(shareLink(true, null, "web-link")).toBe("web-link");
    expect(shareLink(false, "tg-link", "")).toBe("tg-link");
  });
});

describe("кто позвал", () => {
  it("ник без «@», мусор — null; подпись — @ник или «друг»", () => {
    expect(cleanTgName("@Player_One")).toBe("Player_One");
    expect(cleanTgName("<b>x</b>")).toBeNull();
    expect(cleanTgName(null)).toBeNull();
    expect(inviteWhoText({ invited: true, name: "Player_One" }, "друг")).toBe("@Player_One");
    expect(inviteWhoText({ invited: true, name: null }, "друг")).toBe("друг");
  });
});
