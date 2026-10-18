// Новая книга (таверна и окно героя на карте, дизайн Ангелины): «Забыть» — по тем
// же правилам, что в SpellbookGrid. До 09.10.2026 кнопки здесь не было вовсе, и
// зелье забвения тратилось впустую.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dict } from "@/lib/translations";

vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.ru ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));
vi.mock("@/api", () => ({ getMyOblivion: vi.fn() }));
vi.mock("@/lib/hooks/useEnergy", () => ({ useEnergy: () => ({ data: { energy: 99 } }) }));
vi.mock("@/server/api/beta-raid/spell-book", () => ({
  getHeroSpellbook: vi.fn(),
  getOwnedHeroSpellbook: vi.fn(),
}));
vi.mock("@/server/api/beta-raid/spell-cast", () => ({ castSpell: vi.fn() }));
vi.mock("@/server/api/beta-raid/spell-learn", () => ({ forgetSpell: vi.fn() }));

vi.mock("@/components/beta-raid/ResourceActionDialog", () => ({
  ResourceActionDialog: ({ children }: { children?: unknown }) => children,
}));

const { TavernSpellbook } = await import("./TavernSpellbook");

const entry = {
  id: "sp_a",
  name: "Огненный шар",
  description: "",
  image: null,
  kind: "boost",
  effects: [],
  energyCost: 5,
  cooldownMinutes: 10,
  baseEnergyCost: 5,
  baseCooldownMinutes: 10,
  minInt: 0,
  active: true,
  readyAt: null,
  cooldownLeftSec: 0,
  canCast: true,
  reasonKey: null,
};
const book = {
  hero: { heroId: "h_me", name: "Воин", spec: null, rarity: "rare", intellect: 10 },
  slots: { total: 3, used: 1, free: 2 },
  discountPercent: 0,
  spells: [entry],
};

function render(oblivion: unknown, props: { heroId?: string; readOnly?: boolean } = {}) {
  // Книга прячет записи, пока идёт перечитка, — данные в тесте считаем свежими.
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(["hero-spellbook"], book);
  if (props.heroId) qc.setQueryData(["hero-spellbook", "view", null, props.heroId], book);
  qc.setQueryData(["my-oblivion"], oblivion);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <TavernSpellbook {...props} />
    </QueryClientProvider>,
  );
}

describe("TavernSpellbook — «Забыть» только с «Забвением» и только в своей книге", () => {
  it("без эффекта кнопки нет", () => {
    const html = render({ level: 0, until: null });
    expect(html).toContain("Огненный шар");
    expect(html).not.toContain("Забыть");
  });

  it("заряд есть — кнопка есть", () => {
    expect(render({ level: 1, until: null })).toContain("Забыть");
  });

  it("чужая книга или только чтение — кнопки нет даже с эффектом", () => {
    expect(render({ level: 1, until: null }, { heroId: "h_other" })).not.toContain("Забыть");
    expect(render({ level: 1, until: null }, { readOnly: true })).not.toContain("Забыть");
  });
});
