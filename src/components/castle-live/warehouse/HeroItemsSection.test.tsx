// Блок «Вещи героев»: свёрнут — только заголовок; раскрыт — карточки с коротким
// именем, где герой и вещами; кнопка к полю — только для поля на этой карте.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const st = vi.hoisted(() => ({ data: undefined as unknown, pending: false }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: st.data, isPending: st.pending, isError: false, refetch: async () => {} }),
}));
vi.mock("@/lib/i18n", () => ({ useT: () => (k: string, p?: Record<string, string>) => `${k}:${p?.time ?? ""}` }));
vi.mock("@/server/api/castle-hero-items", () => ({ getMyHeroesItems: async () => st.data }));
vi.mock("./WarehouseScreen", () => ({
  ItemArt: ({ item }: { item: { name: string } }) => <i>{item.name}</i>,
  WorldFrame: () => null,
}));

const { HeroItemsSection } = await import("./HeroItemsSection");
const hero = (id: string, extra: Record<string, unknown>) => ({
  id, name: `${id} - Long Title`, level: 3, image: null, restUntil: null, field: null,
  items: [{ stackKey: `custom:${id}`, name: `Вещь ${id}`, image: null, count: 2, kind: "custom" }], ...extra,
});

beforeEach(() => {
  st.pending = false;
  st.data = {
    total: 5,
    heroes: [
      hero("Momo", { field: { q: 41, r: 18, world: "Мир Альфа", here: true } }),
      hero("Fyrk", { field: { q: 2, r: 3, world: "Мир Бета", here: false } }),
      hero("Dorn", {}),
    ],
  };
});

describe("вещи героев в складе замка", () => {
  it("свёрнут — только заголовок, без запроса данных на экран", () => {
    const html = renderToStaticMarkup(<HeroItemsSection lang="ru" />);
    expect(html).toContain("Вещи героев");
    expect(html).not.toContain("Momo");
  });

  it("раскрыт — короткие имена, где герой, вещи; к полю — только здесь", () => {
    const html = renderToStaticMarkup(<HeroItemsSection lang="ru" initialOpen onShow={() => {}} />);
    expect(html).toContain("Героев с вещами: 3 из 5");
    expect(html).toContain(">Momo</h3>");
    expect(html).toContain('title="Momo - Long Title"');
    expect(html).toContain("На поле · 41, 18");
    expect(html).toContain("На поле · Мир Бета");
    expect(html).toContain("В замке");
    expect(html).toContain("Вещь Dorn");
    expect(html.match(/Показать поле/g)).toHaveLength(1);
  });

  it("английский и пустой список", () => {
    st.data = { total: 2, heroes: [] };
    const html = renderToStaticMarkup(<HeroItemsSection lang="en" initialOpen />);
    expect(html).toContain("Heroes&#x27; items");
    expect(html).toContain("Your other heroes carry nothing.");
  });
});
