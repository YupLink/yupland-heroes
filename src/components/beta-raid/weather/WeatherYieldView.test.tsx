// Показ выхода «в час» с погодой: окно шахты (MineYieldLine) и «Добыча»
// (HarvestSourceList). Число — с погодой, рядом значок с названием (ru/en);
// коэффициент 1, гриб и шахта старого образца — как было, без значка.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { dict } from "@/lib/translations";
import { NO_WEATHER, type WeatherCoefs } from "@/lib/raid/weather";
import type { MapWeatherShown } from "@/lib/raid/weatherYield";
import type { MineV2View } from "@/lib/mineExtra";
import type { MineRow } from "@/server/api/beta-raid/mine-pendings";
import type { HarvestField } from "@/server/api/beta-raid/harvest-fields";

const st = vi.hoisted(() => ({
  lang: "ru" as "ru" | "en",
  maps: new Map<string, MapWeatherShown>(),
  my: "world",
}));
vi.mock("@/lib/i18n", () => ({
  useLang: () => st.lang,
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.[st.lang] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));
vi.mock("./useWeatherByMap", () => ({
  useWeatherByMap: () => st.maps,
  useMyMapWeather: (on = true) => (on ? st.maps.get(st.my) : undefined),
}));
vi.mock("@/components/beta-raid/weather/useWeatherByMap", () => ({
  useWeatherByMap: () => st.maps,
  useMyMapWeather: (on = true) => (on ? st.maps.get(st.my) : undefined),
}));

const { MineYieldLine } = await import("../mine/MineYieldLine");
const { HarvestSourceList } = await import("../hud/HarvestSourceList");

const NOW = Date.parse("2026-10-28T10:30:00Z");
const H = 3_600_000;
const coefs = (mine: number, farm: number): WeatherCoefs => ({ ...NO_WEATHER, mine, farm });
const setMaps = (rows: Array<[string, MapWeatherShown["kind"], WeatherCoefs]>) => {
  st.maps = new Map(rows.map(([id, kind, c]) => [id, { kind, coefs: c }]));
};
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const view: MineV2View = {
  mode: "base",
  lifeLeft: 1,
  lifeAt: new Date(NOW).toISOString(),
  breakAt: NOW + 100 * H,
  broken: false,
  stdYield: 10,
  mult: 1,
  repairCost: { gold: 20 },
};

describe("окно шахты", () => {
  it("v2 с погодой — число с погодой и значок", () => {
    setMaps([["world", "rain", coefs(0.5, 1)]]);
    const html = renderToStaticMarkup(
      <MineYieldLine v2={view} yieldAmount={10} resName="камень" />,
    );
    expect(text(html)).toBe("5 камень в час");
    expect(html).toContain('aria-label="Дождь"');
    expect(html).toContain('title="Дождь"');
  });
  it("режим ×2 — множитель погоды в формуле; en — название по-английски", () => {
    st.lang = "en";
    setMaps([["world", "fog", coefs(0.6, 1)]]);
    const html = renderToStaticMarkup(
      <MineYieldLine v2={{ ...view, mult: 2 }} yieldAmount={10} resName="stone" />,
    );
    expect(text(html)).toBe("10 × 2 × 0.6 = 12 stone per hour");
    expect(html).toContain('aria-label="Fog"');
    st.lang = "ru";
  });
  it("коэффициент 1 — строка прежняя, без значка", () => {
    setMaps([["world", "clear", coefs(1, 2)]]);
    const html = renderToStaticMarkup(
      <MineYieldLine v2={{ ...view, mult: 2 }} yieldAmount={10} resName="камень" />,
    );
    expect(text(html)).toBe("10 × 2 = 20 камень в час");
    expect(html).not.toContain("data-weather-badge");
  });
  it("шахта старого образца и гриб — без погоды", () => {
    setMaps([["world", "storm", coefs(0.01, 0.01)]]);
    const html = renderToStaticMarkup(<MineYieldLine v2={null} yieldAmount={7} resName="DARAI" />);
    expect(text(html)).toBe("7 DARAI в час");
    expect(html).not.toContain("data-weather-badge");
  });
});

const v2Life = {
  mode: "base" as const,
  lifeLeft: 1,
  lifeAt: new Date(NOW).toISOString(),
  breakAt: NOW + 100 * H,
  broken: false,
};
const mine = (over: Partial<MineRow>): MineRow => ({
  mapId: "world",
  q: 1,
  r: 1,
  resource: "stone",
  token: null,
  yield: 10,
  claimedHours: 0,
  capturedAt: NOW - H / 2,
  maxHours: 100,
  stepHours: 1,
  v2: v2Life,
  ...over,
});
const field = (over: Partial<HarvestField>): HarvestField => ({
  mapId: "world",
  q: 4,
  r: 4,
  reward: { kind: "item", itemId: "milk", name: "Молоко", image: null },
  perHour: 0.14,
  pending: 0,
  ready: 0,
  growing: 0,
  stored: null,
  storedAt: null,
  personalSlots: null,
  heroName: "Герой",
  workers: 1,
  ...over,
});

describe("«Добыча»", () => {
  it("группа с двух карт — сумма по своим коэффициентам, два значка; строки — свои", () => {
    setMaps([
      ["world", "fog", coefs(0.6, 0.5)],
      ["floor2", "blizzard", coefs(0.055, 0.055)],
    ]);
    const html = renderToStaticMarkup(
      <HarvestSourceList
        now={NOW}
        mines={[mine({}), mine({ mapId: "floor2", q: 2, yield: 20, floor: "Этаж 2" })]}
        fields={[field({})]}
      />,
    );
    const group = html.slice(
      html.indexOf("harvest-group-summary"),
      html.indexOf("harvest-group-details"),
    );
    // 10 × 0,6 + 20 × 0,055 = 7,1
    expect(text(group)).toContain("7.1/ч");
    expect(group.match(/data-weather-badge/g)).toHaveLength(2);
    const rows = html.slice(
      html.indexOf("harvest-group-details"),
      html.indexOf('data-harvest-source-group="farms"'),
    );
    expect(text(rows)).toContain("6/ч");
    expect(text(rows)).toContain("1.1/ч");
    expect(rows).toContain('aria-label="Туман"');
    expect(rows).toContain('aria-label="Метель"');
    // Поле: 0,14 × 0,5 = 0,07 и значок своей карты.
    const farms = html.slice(html.indexOf('data-harvest-source-group="farms"'));
    expect(text(farms)).toContain("0.07/ч");
    expect(farms).toContain('data-weather-badge="fog"');
  });
  it("грибы и коэффициент 1 — числа прежние, без значков", () => {
    setMaps([
      ["world", "clear", coefs(1, 1)],
      ["floor2", "storm", coefs(0.01, 0.01)],
    ]);
    const html = renderToStaticMarkup(
      <HarvestSourceList
        now={NOW}
        mines={[
          mine({ yield: 615.33 }),
          mine({
            mapId: "floor2",
            v2: null,
            resource: "token",
            token: "DARAI",
            yield: 18,
            mushroom: { kind: "darai", image: null, diesAt: NOW + H },
          }),
        ]}
        fields={[field({ mapId: "world" })]}
      />,
    );
    expect(text(html)).toContain("615.33/ч");
    expect(text(html)).toContain("18/ч");
    expect(text(html)).toContain("0.14/ч");
    expect(html).not.toContain("data-weather-badge");
  });
});
