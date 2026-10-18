// Плитка героя в сетке инвентаря: отдыхающий серый и с таймером (владелец
// 29.09); без отдыха — обычная плитка.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/i18n", () => ({ useLang: () => "ru", useT: () => (k: string) => k }));
vi.mock("@/server/api/items", () => ({ listMyItems: vi.fn() }));
vi.mock("@/server/api/user-auth", () => ({ getSession: vi.fn() }));
vi.mock("@/components/heroes/HeroItemPanel", () => ({ HeroItemPanel: () => null }));

const { ItemSquare } = await import("./MysticInventoryCards");

const hero = {
  id: "ugi_1",
  kind: "hero",
  name: "Воин",
  imageUrl: null,
  level: 4,
  heroLevel: 7,
  race: null,
  specialization: null,
  templateId: "tpl",
} as unknown as Parameters<typeof ItemSquare>[0]["it"];

const tile = (rest: Parameters<typeof ItemSquare>[0]["rest"]) =>
  renderToStaticMarkup(<ItemSquare it={hero} onOpen={() => {}} rest={rest} />);

describe("ItemSquare — отдых героя", () => {
  it("отдыхает: серая плитка и таймер", () => {
    const out = tile({ resting: true, label: "отдых 2 ч 59 мин", left: "2 ч 59 мин" });
    expect(out).toContain("grayscale");
    expect(out).toContain("2 ч 59 мин");
    // Таймер встаёт на место уровня — на узкой плитке они бы наезжали.
    expect(out).not.toContain("7 lvl");
  });

  it("не отдыхает — обычная плитка без таймера", () => {
    const out = tile(null);
    expect(out).not.toContain("grayscale");
    expect(out).not.toContain("мин");
    expect(out).toContain("7 lvl");
  });
});
