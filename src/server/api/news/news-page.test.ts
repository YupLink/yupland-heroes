// Страница газеты для людей (08.11.2026): разделы на месте, данные экранированы.
import { describe, expect, it } from "vitest";
import { newsPageHtml } from "./news-page";
import type { NewsDigest } from "@/lib/news/types";

const leaders = (name: string) => [{ name, value: 5 }];
const digest = {
  days: 7,
  from: "2026-11-02T00:00:00Z",
  to: "2026-11-08T12:00:00Z",
  totals: {
    active: 3,
    newPlayers: 1,
    steps: 10,
    energy: 5,
    fights: 2,
    wins: 1,
    gathered: 0,
    mines: 0,
    planted: 0,
    land: 0,
    dynamite: 0,
    gold: 100,
    diamonds: 1,
    darai: 0,
  },
  leaders: {
    gold: leaders("<script>x</script>"),
    diamonds: [],
    darai: [],
    wood: [],
    stone: [],
    steps: leaders("Om"),
    energy: [],
    fights: [],
    gathered: [],
    mines: [],
  },
  updates: [{ date: "2026-11-08", items: ["Бинокль & лестница"] }],
  discussions: ["шахты"],
  tournaments: { active: [], soon: [] },
} as unknown as NewsDigest;

describe("newsPageHtml", () => {
  const html = newsPageHtml({
    digest,
    text: "пост <b>",
    promo: { date: "2026-11-08", code: "AB-CD" },
    treasure: null,
    key: "k1",
    lang: "ru",
    paper: null,
    nonce: "abc",
  });
  it("газета дня, сводка недели, промокод, итоги, лидеры, текст — по тому же ключу", () => {
    expect(html).toContain("image=day");
    expect(html).toContain("image=week");
    expect(html).toContain("key=k1");
    expect(html).toContain("AB-CD");
    expect(html).toContain("Итоги");
    expect(html).toContain("Богачи");
    expect(html).toContain("Скопировать");
  });
  it("имена и тексты экранированы", () => {
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&#60;script&#62;");
    expect(html).toContain("пост &#60;b&#62;");
    expect(html).toContain("Бинокль &#38; лестница");
  });
  it("скрипт с меткой ответа, без on…-атрибутов (CSP)", () => {
    expect(html).toContain('<script nonce="abc">');
    expect(html).not.toMatch(/\son[a-z]+=/);
  });
});
