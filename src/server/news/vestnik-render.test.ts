// Сборка выпуска целиком: шрифты, вёрстка, satori и sharp — без базы и сети.
import { describe, expect, it, vi } from "vitest";
import type { NewsDigest } from "@/lib/news/types";

const digest = vi.hoisted(
  (): NewsDigest => ({
    days: 1,
    from: "2026-10-29T00:00:00.000Z",
    to: "2026-10-30T00:00:00.000Z",
    totals: {
      active: 101,
      newPlayers: 0,
      steps: 62084,
      energy: 154012,
      fights: 1624,
      wins: 1235,
      gathered: 788,
      mines: 58,
      planted: 121,
      land: 304,
      dynamite: 10,
      gold: 2_656_000,
      diamonds: 4968,
      darai: 719_728_803,
    },
    leaders: {
      gold: [{ name: "@player_two", value: 1015486, portrait: "/x.jpg" }],
      diamonds: [],
      darai: [],
      wood: [],
      stone: [],
      steps: [{ name: "@Player_One", value: 6724 }],
      energy: [],
      fights: [{ name: "@player_3", value: 227 }],
      gathered: [{ name: "Игрок Ab12cd", value: 114 }],
      mines: [],
    },
    updates: [
      {
        date: "2026-10-29",
        items: ["Рубить руками можно и с топором.", "Промокоды — в профиле."],
        headline: {
          title: "Рубить руками можно и с топором",
          lead: "Топор цел.",
          images: ["/a.webp"],
        },
      },
    ],
  }),
);

vi.mock("@/server/api/news/news-digest", () => ({ buildIssueDigest: vi.fn(async () => digest) }));
vi.mock("./vestnik-promo", () => ({ issuePromo: vi.fn(async () => "K7QX-2M4P") }));
vi.mock("./vestnik-images", () => ({ pic: vi.fn(async () => null) }));

const { renderIssue } = await import("./vestnik-render");
const { dayWindow, recentWeek } = await import("@/lib/news/vestnikWindow");

const PNG = [0x89, 0x50, 0x4e, 0x47];

describe("renderIssue", () => {
  it("выпуск дня — одна страница PNG 1080×1350 и код", async () => {
    const issue = await renderIssue(dayWindow(Date.parse("2026-10-29T12:00:00Z")), "ru", true);
    expect(issue.pages).toHaveLength(1);
    expect([...issue.pages[0].subarray(0, 4)]).toEqual(PNG);
    expect(issue.pages[0].readUInt32BE(16)).toBe(1080);
    expect(issue.pages[0].readUInt32BE(20)).toBe(1350);
    expect(issue.promo).toBe("K7QX-2M4P");
  });

  it("превью и API — без промокода: код заводит только публикация", async () => {
    const { issuePromo } = await import("./vestnik-promo");
    vi.mocked(issuePromo).mockClear();
    const issue = await renderIssue(dayWindow(Date.parse("2026-10-28T12:00:00Z")), "ru");
    expect(issue.promo).toBeNull();
    expect(issuePromo).not.toHaveBeenCalled();
  });

  it("сводка недели — две страницы, и по-английски тоже", async () => {
    const issue = await renderIssue(recentWeek(Date.parse("2026-10-29T12:00:00Z")), "en");
    expect(issue.pages).toHaveLength(2);
    for (const p of issue.pages) expect([...p.subarray(0, 4)]).toEqual(PNG);
  });
});
