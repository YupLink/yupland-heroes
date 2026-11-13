import { describe, expect, it } from "vitest";
import { fmtNum, newsText, periodLabel, plural } from "./newsText";
import { ACTIVITY_BOARDS, WEALTH_BOARDS, type NewsDigest, type NewsTotals } from "./types";

const ZERO: NewsTotals = {
  active: 0,
  newPlayers: 0,
  steps: 0,
  energy: 0,
  fights: 0,
  wins: 0,
  gathered: 0,
  mines: 0,
  planted: 0,
  land: 0,
  dynamite: 0,
  gold: 0,
  diamonds: 0,
  darai: 0,
};

function digest(over: Partial<NewsDigest> = {}): NewsDigest {
  const leaders = Object.fromEntries(
    [...WEALTH_BOARDS, ...ACTIVITY_BOARDS].map((b) => [b, []]),
  ) as unknown as NewsDigest["leaders"];
  return {
    days: 7,
    from: "2026-10-23T00:00:00.000Z",
    to: "2026-10-29T18:00:00.000Z",
    totals: { ...ZERO },
    leaders,
    updates: [],
    ...over,
  };
}

describe("newsText helpers", () => {
  it("числа: разряды до миллиона, дальше — млн / M", () => {
    expect(fmtNum(847071, "en")).toBe("847,071");
    expect(fmtNum(1_616_388, "ru")).toBe("1,6 млн");
    expect(fmtNum(1_616_388, "en")).toBe("1.6M");
  });

  it("русское число слова", () => {
    expect(plural(1, "шаг", "шага", "шагов")).toBe("шаг");
    expect(plural(3, "шаг", "шага", "шагов")).toBe("шага");
    expect(plural(11, "шаг", "шага", "шагов")).toBe("шагов");
    expect(plural(21, "шаг", "шага", "шагов")).toBe("шаг");
    expect(plural(112, "шаг", "шага", "шагов")).toBe("шагов");
    // От миллиона число печатается «1 млн» — слово всегда «шагов».
    expect(plural(1_000_001, "шаг", "шага", "шагов")).toBe("шагов");
    expect(plural(2_000_003, "алмаз", "алмаза", "алмазов")).toBe("алмазов");
  });

  it("период: неделя, один день, через месяц", () => {
    expect(periodLabel("2026-10-23T00:00:00Z", "2026-10-29T18:00:00Z", "ru")).toBe("23–29 октября");
    expect(periodLabel("2026-10-29T00:00:00Z", "2026-10-29T18:00:00Z", "ru")).toBe("29 октября");
    expect(periodLabel("2026-09-30T00:00:00Z", "2026-10-29T18:00:00Z", "en")).toBe(
      "Sep 30 – Oct 29",
    );
  });
});

describe("newsText", () => {
  it("цифры, лидеры (первые три) и что нового", () => {
    const d = digest({
      totals: {
        ...ZERO,
        active: 147,
        newPlayers: 6,
        steps: 847400,
        energy: 1616388,
        fights: 16601,
        wins: 12000,
        gold: 2_780_335,
        diamonds: 5172,
      },
      updates: [{ date: "2026-10-29", items: ["Рубить руками можно и с топором."] }],
    });
    d.leaders.gold = [
      { name: "@a", value: 1015462 },
      { name: "@b", value: 345466 },
      { name: "@c", value: 142049 },
      { name: "@d", value: 1 },
    ];
    const text = newsText(d, "ru");
    expect(text).toContain("YupLand · 23–29 октября");
    expect(text).toContain("Играли 147 игроков, новых — 6.");
    expect(text).toContain("Вместе прошли 847\u00a0400 шагов, потратили 1,6 млн энергии.");
    expect(text).toContain("Боёв — 16\u00a0601 (побед — 12\u00a0000).");
    expect(text).toContain("На руках у игроков: 2,8 млн золота, 5\u00a0172 алмаза.");
    expect(text).toContain("Золото: @a — 1");
    expect(text).not.toContain("@d");
    expect(text).toContain("29.10\n• Рубить руками можно и с топором.");
  });

  it("нули не печатаются, пустые разделы пропускаются", () => {
    const text = newsText(digest(), "en");
    expect(text).not.toContain("Fights");
    expect(text).not.toContain("Trees planted");
    expect(text).not.toContain("The richest");
    expect(text).not.toContain("What's new");
    expect(text).toContain("0 players played.");
    expect(text).not.toContain("energy");
    expect(text).not.toContain("hold");
  });

  it("первая часть строки нулевая — следующая с заглавной", () => {
    const d = digest({ totals: { ...ZERO, active: 1, gathered: 5, dynamite: 3 } });
    const ru = newsText(d, "ru");
    expect(ru).toContain("\nРубки и добычи — 5.");
    expect(ru).toContain("\nВзорвано динамита — 3.");
    expect(newsText(d, "en")).toContain("1 player played.");
  });
});
