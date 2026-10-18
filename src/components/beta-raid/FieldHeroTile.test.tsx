// Плитка героя на поле: уровень виден всегда, у занятого — где он батрачит.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/i18n", async (orig) => {
  const real = await orig<typeof import("@/lib/i18n")>();
  return {
    ...real,
    useT: () => (k: string, p?: Record<string, string | number>) => real.tFor("ru", k, p),
  };
});
const { FieldHeroTile } = await import("./FieldHeroTile");

const hero = (over: Record<string, unknown> = {}) => ({
  id: "hero_1",
  name: "Fyrk - Cracked Rune",
  imageUrl: null,
  rarity: "rare",
  level: 5,
  busyAt: null,
  restUntil: null,
  main: false,
  ...over,
});
const html = (h: ReturnType<typeof hero>, here = "70,-9") =>
  renderToStaticMarkup(
    <FieldHeroTile hero={h} here={here} now={Date.now()} chosen={false} onPick={() => {}} />,
  );

describe("плитка героя на поле", () => {
  it("занят на другой ферме: уровень и где работает, кнопка неактивна", () => {
    const out = html(hero({ busyAt: "34,70" }));
    expect(out).toContain("5 ур.");
    expect(out).toContain("ферма 34,70");
    expect(out).toContain('disabled=""');
  });

  it("свободен: только уровень, можно выбрать", () => {
    const out = html(hero());
    expect(out).toContain("5 ур.");
    expect(out).not.toContain("ферма");
    expect(out).not.toContain('disabled=""');
  });

  it("основной: уровень и «основной»", () => {
    const out = html(hero({ main: true, level: 40 }));
    expect(out).toContain("40 ур.");
    expect(out).toContain("основной");
  });

  it("работает тут: «тут», не «ферма»", () => {
    const out = html(hero({ busyAt: "70,-9" }));
    expect(out).toContain("тут");
    expect(out).not.toContain("ферма");
  });
});
