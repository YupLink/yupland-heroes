import { describe, expect, it } from "vitest";
import type { NewsDigest } from "@/lib/news/types";
import { bareName, mainStory, metaLine, otherNews } from "./vestnik-copy";

const base = (over: Partial<NewsDigest> = {}): NewsDigest =>
  ({
    days: 1,
    from: "2026-10-29T00:00:00.000Z",
    to: "2026-10-30T00:00:00.000Z",
    totals: { steps: 62084 },
    leaders: { steps: [{ name: "@Player_One", value: 6724 }] },
    updates: [],
    ...over,
  }) as unknown as NewsDigest;

describe("тексты выпуска", () => {
  it("главная новость — заголовок дня из «Что нового»", () => {
    const headline = {
      title: "Погода меняется плавно",
      lead: "Метеостанция.",
      images: ["/s.webp"],
    };
    const d = base({ updates: [{ date: "2026-10-28", items: ["Погода.", "Гриб."], headline }] });
    expect(mainStory(d, "ru")).toBe(headline);
    expect(otherNews(d, headline, 5)).toEqual(["Гриб."]);
  });

  it("обновлений нет — заголовок из цифр, без выдумок", () => {
    const s = mainStory(base(), "ru");
    expect(s.title).toBe("Герои прошли 62 084 шага");
    expect(s.lead).toBe("Дальше всех — @Player_One: 6 724.");
    expect(mainStory(base(), "en").title).toBe("Heroes walked 62,084 steps");
  });

  it("шапка: номер, вид выпуска и дата", () => {
    const w = { kind: "day", date: "2026-10-29", from: "", to: "", number: 1 } as const;
    expect(metaLine(w, base(), "ru")).toEqual(["№ 1 · ежедневный выпуск", "29 октября 2026"]);
  });

  it("без обновлений истории из цифр чередуются по дням, картинки — из игры", () => {
    const withEvents = (from: string) =>
      base({
        from,
        leaders: { steps: [{ name: "@Player_One", value: 6724, portrait: "/hero.jpg" }] },
        highlights: {
          monster: { name: "Чайка (5 Lv)", image: "/gull.png", n: 76 },
          decor: { name: "Дерево Гречи", image: "/tree.webp", n: 19 },
        },
      } as Partial<NewsDigest>);
    const days = ["2026-10-29", "2026-10-30", "2026-10-31"].map((d) =>
      mainStory(withEvents(`${d}T00:00:00.000Z`), "ru"),
    );
    expect(new Set(days.map((x) => x.title)).size).toBe(3);
    const prey = days.find((x) => x.title.startsWith("Главная добыча"));
    expect(prey).toMatchObject({ title: "Главная добыча — Чайка", lead: "Побед за день: 76." });
    expect(prey?.images).toEqual(["/gull.png", "/hero.jpg", "/tree.webp"]);
    const chop = days.find((x) => x.title.startsWith("Больше всего рубили"));
    expect(chop?.images[0]).toBe("/tree.webp");
  });

  it("уровень из имени монстра в заголовок не идёт", () => {
    expect(bareName("Адская Гончая (10 Lv)")).toBe("Адская Гончая");
    expect(bareName("Дерево Гречи")).toBe("Дерево Гречи");
  });

  it("«Сгенерировать заново»: заголовок дня тот же, картинка другая; без заголовка — другая история", () => {
    const headline = {
      title: "Погода меняется плавно",
      lead: "Метеостанция.",
      images: ["/s.webp"],
    };
    const d = base({
      updates: [{ date: "2026-10-28", items: ["Погода."], headline }],
      highlights: { monster: { name: "Чайка", image: "/gull.png", n: 5 } },
    } as Partial<NewsDigest>);
    expect(mainStory(d, "ru", 0)).toBe(headline);
    const again = mainStory(d, "ru", 1);
    expect(again.title).toBe("Погода меняется плавно");
    expect(again.images).not.toEqual(["/s.webp"]);
    expect(otherNews(d, again, 5)).toEqual([]);
    const plain = base({
      highlights: { monster: { name: "Чайка", image: "/gull.png", n: 5 } },
    } as Partial<NewsDigest>);
    expect(mainStory(plain, "ru", 1).title).not.toBe(mainStory(plain, "ru", 0).title);
  });
});
