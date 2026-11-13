// Товар «Жила» в форме админа и на витрине: вид — списком из двух (не текстом и
// не пикером шаблонов), «Клеток в пачке», в скупку не ставится; плитка витрины —
// имя вида на языке игрока, сколько клеток в пачке и картинка жилы.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyMarketItem, type MarketDraft } from "@/lib/marketItem";
import type { MarketItemView } from "@/lib/buildingEffect";
import { VEIN_ART } from "@/lib/gameArt";

vi.mock("./MarketRefPicker", () => ({ MarketRefPicker: () => <i>ref-picker</i> }));
vi.mock("./MarketImageInput", () => ({ MarketImageInput: () => <i>image-input</i> }));

const { MarketGoodFields } = await import("./MarketGoodFields");
const { goodEntry } = await import("./exchange");

const draft = (o: Partial<MarketDraft> = {}): MarketDraft => ({
  ...emptyMarketItem(0, 0),
  kind: "vein",
  refId: "diamonds",
  giveAmount: 12,
  name: "Алмазная жила",
  ...o,
});
const html = (d: MarketDraft, sell = false) =>
  renderToStaticMarkup(<MarketGoodFields draft={d} set={() => {}} tokens={[]} sell={sell} />);

describe("форма админа: жила", () => {
  it("вид — список «Золотая / Алмазная жила», пачка клеток, без пикера шаблонов", () => {
    const out = html(draft());
    expect(out).toContain("Вид жилы");
    expect(out).toMatch(/<option value="gold"[^>]*>Золотая жила<\/option>/);
    expect(out).toMatch(/<option value="diamonds"[^>]*selected=""[^>]*>Алмазная жила<\/option>/);
    expect(out).toContain("Клеток в пачке");
    expect(out).not.toContain("ref-picker");
    expect(out).toContain("image-input");
    expect(out).toContain("Жила (золото / алмазы)");
  });

  it("в скупке жилы среди видов нет", () => {
    expect(html(draft({ kind: "resource", refId: "gold" }), true)).not.toContain('value="vein"');
    expect(html(draft({ kind: "resource", refId: "gold" }))).toContain('value="vein"');
  });
});

describe("плитка витрины: жила", () => {
  const item = {
    kind: "vein",
    refId: "gold",
    name: "Золотая жила",
    giveAmount: 15,
    image: VEIN_ART.gold,
  } as MarketItemView;

  it("имя — на языке игрока, количество — клеток в пачке", () => {
    expect(goodEntry(item, undefined, "en")).toMatchObject({
      amount: 15,
      label: "Gold vein",
      image: VEIN_ART.gold,
    });
    expect(goodEntry(item, undefined, "ru").label).toBe("Золотая жила");
  });
});
