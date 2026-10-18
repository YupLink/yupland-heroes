// Подтверждение снятия издалека и «кто батрачит»: часы отдыха из общего модуля
// и на языке игрока, координаты грядки, портрет с уровнем — и оба языка в словаре.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { dict } from "@/lib/translations";
import { dict as fieldDict } from "@/lib/translations/braid-field";

const lang = vi.hoisted(() => ({ now: "ru" as "ru" | "en" }));

vi.mock("@/lib/i18n", () => ({
  useLang: () => lang.now,
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.[lang.now] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) =>
      String(vars?.[k] ?? ""),
    ),
}));
vi.mock("@/api", () => ({ recallHeroFromField: vi.fn() }));
vi.mock("@/lib/query", () => ({ invalidateHeroQueries: vi.fn() }));
vi.mock("@/server/api/heroes-read", () => ({ listMyHeroes: vi.fn(async () => []) }));

const { FieldRecallConfirm } = await import("./FieldRecallConfirm");
const { FieldMyHero } = await import("./FieldMyHero");

const render = (node: ReactNode) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>,
  );
const confirm = () => render(<FieldRecallConfirm heroId="hero_w" at="30,-90" onClose={() => {}} />);

describe("FieldRecallConfirm", () => {
  it("отдых и грядка по-русски, без цены", () => {
    lang.now = "ru";
    expect(confirm()).toContain("Снять с работы · отдых 3 ч · грядка 30, -90");
    expect(confirm()).toContain("Отмена");
    expect(confirm()).not.toContain("DARAI");
  });

  it("отдых и грядка по-английски", () => {
    lang.now = "en";
    expect(confirm()).toContain("Recall from work · 3 h rest · field 30, -90");
  });

  it("у каждого нового ключа есть ru и en", () => {
    for (const [key, v] of Object.entries(fieldDict)) {
      expect(v.ru, key).toBeTruthy();
      expect(v.en, key).toBeTruthy();
    }
  });
});

describe("FieldMyHero", () => {
  it("портрет, имя и уровень того самого героя", () => {
    lang.now = "ru";
    const known = [{ id: "hero_w", imageUrl: "/h.png", rarity: "legendary", level: 12 }];
    const out = render(<FieldMyHero hero={{ id: "hero_w", name: "Воин" }} known={known} />);
    expect(out).toContain("Батрачит: Воин");
    expect(out).toContain("12 ур.");
    expect(out).toContain("ring-[#f5c451]");
    expect(out).toContain("<img");
  });

  it("героя ещё нет в списке — хотя бы имя, без выдуманного уровня", () => {
    lang.now = "ru";
    const out = render(<FieldMyHero hero={{ id: "hero_x", name: "Лучник" }} />);
    expect(out).toContain("Батрачит: Лучник");
    expect(out).not.toContain("ур.");
  });
});
