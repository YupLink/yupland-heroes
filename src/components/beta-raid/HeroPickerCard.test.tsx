// Плитка героя: отдыхающий серый, с луной и временем отдыха вместо уровня и не
// нажимается; кончился отдых — снова обычный.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { dict } from "@/lib/translations";

vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.ru ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));

const { HeroPickerCard } = await import("./HeroPickerCard");

const NOW = Date.parse("2026-09-29T12:00:00Z");
const hero = {
  id: "hero_w",
  templateId: "tpl",
  imageUrl: null,
  race: null,
  specialization: null,
  rarity: "rare",
  level: 7,
  maxLevel: 20,
  restUntil: "2026-09-29T14:59:00Z",
};
const card = (h: typeof hero, now = NOW) =>
  renderToStaticMarkup(<HeroPickerCard hero={h} chosen={false} onPick={() => {}} now={now} />);

describe("HeroPickerCard — отдых", () => {
  it("отдыхает: серый, не нажимается, «отдых 2 ч 59 мин» вместо уровня", () => {
    const out = card(hero);
    expect(out).toContain("grayscale");
    expect(out).toContain("disabled");
    expect(out).toContain("отдых 2 ч 59 мин");
    expect(out).not.toContain("7/20");
  });

  it("отдых кончился — обычная плитка с уровнем", () => {
    const out = card(hero, Date.parse("2026-09-29T15:00:00Z"));
    expect(out).not.toContain("grayscale");
    expect(out).not.toContain("disabled");
    expect(out).not.toContain("отдых");
  });
});
