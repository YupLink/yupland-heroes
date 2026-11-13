// Окно героя → слот → «Слот „Голова“ — выбери артефакт» (скриншот владельца,
// 28.10): зачарованный в списке и в надетом — с ✦ и процентом, обычный — без.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GearItemView, GearSlotView } from "@/server/api/heroes-gear";

vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (key: string) => key,
}));

const { GearSlotDetails } = await import("./GearSlotDetails");

const item = (itemId: string, name: string, enchantPct?: number): GearItemView => ({
  itemId,
  itemIds: [itemId],
  count: 1,
  templateId: `tpl_${itemId}`,
  name,
  imageUrl: null,
  rarity: "rare",
  slot: "Голова",
  statType: "attack",
  statAmount: 3,
  immunities: [],
  fishBonusPct: 0,
  statKey: "atk",
  parts: [],
  total: 0,
  durability: 100,
  ...(enchantPct != null ? { enchantPct } : {}),
});

const slot = (worn: GearItemView | null): GearSlotView =>
  ({ key: "head", slot: "Голова", index: 1, item: worn }) as GearSlotView;

const render = (worn: GearItemView | null, candidates: GearItemView[]) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <GearSlotDetails
        slot={slot(worn)}
        candidates={candidates}
        readOnly={false}
        atCastle
        equipPending={false}
        unequipPending={false}
        onEquip={() => {}}
        onUnequip={() => {}}
      />
    </QueryClientProvider>,
  );

describe("список выбора артефакта в слот", () => {
  it("зачарованный кандидат — ✦ и «+15%», обычный — без отметки", () => {
    const html = render(null, [item("a", "Fisherman's hat", 15), item("b", "Builder Cap")]);
    expect(html.match(/data-enchant-mark=/g)).toHaveLength(1);
    expect(html).toContain('title="Зачарован +15%"');
    expect(html).toContain(">+15%<");
    // Отметка стоит в строке своего предмета, а не соседнего.
    const hat = html.indexOf("Fisherman&#x27;s hat");
    const cap = html.indexOf("Builder Cap");
    const mark = html.indexOf("data-enchant-mark=");
    expect(hat).toBeGreaterThan(-1);
    expect(mark).toBeGreaterThan(hat);
    expect(mark).toBeLessThan(cap);
  });

  it("надетый зачарованный с минусом — «−10%»", () => {
    const html = render(item("w", "Builder Cap", -10), []);
    expect(html).toContain('title="Зачарован −10%"');
    expect(html).toContain(">−10%<");
  });

  it("ничего не зачаровано — отметок нет", () => {
    const html = render(item("w", "Cap"), [item("a", "Hat"), item("b", "Helm")]);
    expect(html).not.toContain("data-enchant-mark");
  });
});
