// Окно зачарования героев глазами игрока и админа (рендер на сервере): ячейки
// обрядов «3 → 1» с редкостью, ячейки героев «+», шансы и «пропадёт» текстом,
// «Зачаровать» серая, пока героев не столько, сколько нужно; форма админа.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dict } from "@/lib/translations";
import type { HeroRiteView } from "@/lib/enchant/heroRite";

const v = vi.hoisted(() => ({ lang: "ru" as "ru" | "en" }));
vi.mock("@/lib/i18n", () => ({
  useLang: () => v.lang,
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.[v.lang] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/server/api/beta-raid", () => ({
  getHeroRiteShop: vi.fn(),
  listRiteHeroes: vi.fn(),
  saveHeroRites: vi.fn(),
  runHeroRite: vi.fn(),
  listEnchantCostOptions: vi.fn(),
}));

const { HeroRitePlayer } = await import("./HeroRitePlayer");
const { HeroRiteForm } = await import("./HeroRiteForm");
const { riteHeroesKey } = await import("./heroRiteQueries");
const { toRiteDraft, fromRiteDraft } = await import("./heroRiteDraft");

const rite: HeroRiteView = {
  id: "hrite_1",
  name: "Слияние",
  rarity: "rare",
  need: 3,
  success: 40,
  loseMin: 1,
  loseMax: 2,
  cost: [{ kind: "resource", code: "gold", amount: 100, name: "Золото", image: null, have: 50 }],
};
const at = { mapId: "m", q: 1, r: 2 };

const render = (rites = [rite]) => {
  const qc = new QueryClient();
  qc.setQueryData(riteHeroesKey("rare"), []);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <HeroRitePlayer at={at} rites={rites} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  v.lang = "ru";
});

describe("вкладка игрока", () => {
  it("ячейка обряда: «3 → 1», что выйдет, название; три пустые ячейки героев", () => {
    const html = render();
    expect(html).toContain("3 → 1");
    expect(html).toContain("Эпический");
    expect(html).toContain("Слияние");
    expect(html.match(/aria-label="Выбрать героев"/g)).toHaveLength(3);
  });

  it("шансы и «пропадёт» текстом, уровень с нуля; «Зачаровать» серая без героев", () => {
    const html = render();
    expect(html).toContain("Успех 40% — новый герой: Эпический");
    expect(html).toContain("Неудача 60% — пропадёт 1–2 из 3");
    expect(html).toContain("Новый герой — с 0 уровня");
    expect(html).toMatch(/<button type="button" class="ench-go" disabled="">/);
  });

  it("en: Success / Failure / Enchant", () => {
    v.lang = "en";
    const html = render();
    expect(html).toContain("Success 40% — a new hero: Epic");
    expect(html).toContain("Failure 60% — 1–2 of 3 will be lost");
    expect(html).toContain("Enchant");
  });
});

describe("форма админа", () => {
  it("редкость двумя кнопками, сколько героев — списком 2…10, «пропадёт» одним полем", () => {
    const html = renderToStaticMarkup(
      <HeroRiteForm d={toRiteDraft(rite)} options={[]} onChange={() => {}} onDelete={() => {}} />,
    );
    expect(html).toContain("Редкий → Эпический");
    expect(html).toContain("Эпический → Легендарный");
    expect(html.match(/class="ench-seg hrite-seg-need"/g)).toHaveLength(1);
    expect(html).toContain('value="1-2"');
  });

  it("черновик ⇄ обряд: «1-2» → пара; «4» при трёх героях — ошибка", () => {
    const d = toRiteDraft(rite);
    expect(fromRiteDraft(d)).toMatchObject({ loseMin: 1, loseMax: 2, need: 3 });
    expect(fromRiteDraft({ ...d, lose: "4" })).toBeNull();
  });
});
