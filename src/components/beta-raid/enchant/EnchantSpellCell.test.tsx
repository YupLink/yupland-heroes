// Ячейка заклинания у игрока (владелец, 28.10.2026): редкость словом цветом
// редкости, выбранная — aria-pressed и ✓; у админа — как было.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { dict } from "@/lib/translations";

vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.ru ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));

const { EnchantSpellCell } = await import("@/components/beta-raid/enchant/EnchantSpellCell");

const ODDS = { success: 50, none: 30, destroy: 20 };
const cell = (p: { rarity: "common" | "legendary"; pressed: boolean; player?: boolean }) =>
  renderToStaticMarkup(
    <EnchantSpellCell
      name="Молитва"
      rarity={p.rarity}
      boost={[20, 20]}
      odds={ODDS}
      chips={[]}
      pressed={p.pressed}
      player={p.player}
      onClick={() => {}}
    />,
  );

describe("EnchantSpellCell", () => {
  it("игрок, выбранная легендарная: aria-pressed, ✓ и «Легендарное»", () => {
    const out = cell({ rarity: "legendary", pressed: true, player: true });
    expect(out).toContain('class="ench-cell ench-spell ench-r-legendary is-player"');
    expect(out).toContain('aria-pressed="true"');
    expect(out).toContain('<span class="ench-check" aria-hidden="true">✓</span>');
    expect(out).toContain('<span class="ench-rt">Легендарное</span>');
    // Редкость — над названием.
    expect(out.indexOf("Легендарное")).toBeLessThan(out.indexOf("Молитва"));
  });

  it("игрок, не выбранная обычная: «Обычное», без ✓", () => {
    const out = cell({ rarity: "common", pressed: false, player: true });
    expect(out).toContain('aria-pressed="false"');
    expect(out).toContain('<span class="ench-rt">Обычное</span>');
    expect(out).not.toContain("✓");
  });

  it("админ: без подписи редкости, ✓ и класса игрока", () => {
    const out = cell({ rarity: "legendary", pressed: true });
    expect(out).toContain('aria-pressed="true"');
    expect(out).not.toContain("ench-rt");
    expect(out).not.toContain("✓");
    expect(out).not.toContain("is-player");
  });
});
