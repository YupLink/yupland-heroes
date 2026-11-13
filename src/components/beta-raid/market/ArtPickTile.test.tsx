// Плитка пикера артефактов: в ломбарде отмеченная группа — с галочкой и, если
// свободных больше одной, со степпером штук; без multi — как было. DOM нет:
// рендер в строку.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (key: string, p?: { n?: string }) => (p?.n ? `${key}:${p.n}` : key),
}));

const { ArtPickTile } = await import("./ArtPickTile");

const a = { templateId: "a", name: "Меч", count: 3, wear: 100, imageUrl: null };
const render = (o: {
  picked: boolean;
  multi: boolean;
  count?: number;
  ench?: { enchanted: number; enchantPct: number };
}) =>
  renderToStaticMarkup(
    // Полоса прочности спрашивает флаг поломки через react-query.
    <QueryClientProvider client={new QueryClient()}>
      <ArtPickTile
        a={{ ...a, count: o.count ?? a.count, ...o.ench }}
        picked={o.picked}
        n={2}
        multi={o.multi}
        onTap={() => {}}
        onN={() => {}}
      />
    </QueryClientProvider>,
  );

describe("ArtPickTile", () => {
  it("ломбард: отмеченная группа — рамка, галочка и степпер со своим числом", () => {
    const html = render({ picked: true, multi: true });
    expect(html).toContain("border-gold");
    expect(html).toContain("lucide-check");
    expect(html).toContain('aria-label="+"');
    expect(html).toContain(">2<");
    expect(html).toContain("market.art_free:3");
  });

  it("одна свободная — степпера нет; не отмечена — ни галочки, ни степпера", () => {
    expect(render({ picked: true, multi: true, count: 1 })).not.toContain('aria-label="+"');
    const off = render({ picked: false, multi: true });
    expect(off).not.toContain("lucide-check");
    expect(off).not.toContain('aria-label="+"');
  });

  it("без multi — выделение рамкой, как раньше, без галочки и степпера", () => {
    const html = render({ picked: true, multi: false });
    expect(html).toContain("border-gold");
    expect(html).not.toContain("lucide-check");
    expect(html).not.toContain('aria-label="+"');
  });

  it("зачарованный в группе — ✦ в углу, подпись «… · 1 из 3»; без зачарованных — нет", () => {
    const html = render({ picked: false, multi: true, ench: { enchanted: 1, enchantPct: 10 } });
    expect(html).toContain("data-enchant-mark");
    expect(html).toContain('title="Зачарован +10% · 1 из 3"');
    expect(render({ picked: false, multi: true })).not.toContain("data-enchant-mark");
  });
});
