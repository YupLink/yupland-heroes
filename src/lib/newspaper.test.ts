// Газеты (§8.96): недели киоска (пн–вс UTC, новые первыми) и откуда можно
// брать картинку выпуска.
import { describe, expect, it } from "vitest";
import {
  groupByWeek,
  isNewspaperDate,
  isNewspaperImageUrl,
  weekOf,
  type NewspaperView,
} from "./newspaper";

const v = (date: string): NewspaperView => ({
  issueId: `npi_${date}`,
  date,
  title: null,
  imageUrl: "/x.webp",
  deferred: false,
  read: true,
  kiosk: true,
  canDefer: false,
});

describe("недели киоска", () => {
  it("weekOf — понедельник своей недели", () => {
    expect(weekOf("2026-10-26")).toBe("2026-10-26");
    expect(weekOf("2026-11-01")).toBe("2026-10-26");
    expect(weekOf("2026-11-02")).toBe("2026-11-02");
    expect(weekOf("кривая")).toBe("кривая");
  });
  it("groupByWeek — недели и выпуски от новых к старым", () => {
    const g = groupByWeek([v("2026-10-27"), v("2026-11-03"), v("2026-10-31")]);
    expect(g.map((w) => w.week)).toEqual(["2026-11-02", "2026-10-26"]);
    expect(g[1].issues.map((i) => i.date)).toEqual(["2026-10-31", "2026-10-27"]);
    expect(groupByWeek([])).toEqual([]);
  });
});

describe("картинка и дата выпуска", () => {
  it("свой сайт и IPFS — да, чужое и не https — нет", () => {
    expect(isNewspaperImageUrl("/newspapers/2026-10-31.webp")).toBe(true);
    expect(isNewspaperImageUrl("https://service.yupland.io/n/1.png")).toBe(true);
    expect(isNewspaperImageUrl("https://gateway.pinata.cloud/ipfs/Qm1")).toBe(true);
    expect(isNewspaperImageUrl("https://ipfs.io/ipfs/Qm1")).toBe(true);
    expect(isNewspaperImageUrl("http://service.yupland.io/n/1.png")).toBe(false);
    expect(isNewspaperImageUrl("https://evil.example/yupland.io.png")).toBe(false);
    expect(isNewspaperImageUrl("https://yupland.io.evil.example/1.png")).toBe(false);
    expect(isNewspaperImageUrl("//evil.example/1.png")).toBe(false);
    expect(isNewspaperImageUrl("javascript:alert(1)")).toBe(false);
  });
  it("дата — настоящий день YYYY-MM-DD", () => {
    expect(isNewspaperDate("2026-10-31")).toBe(true);
    expect(isNewspaperDate("2026-13-01")).toBe(false);
    expect(isNewspaperDate("31.10.2026")).toBe(false);
  });
});
