// Аномалия на экране (05.11.2026): панель погоды игрока показывает −60…+60 и огненный дождь
// (ru/en), значок огненного дождя — восьмая клетка атласа, окно метеостанции — «Не клюёт»,
// «Не работают», «Стоимость ×20» и сцена жаркого шторма; админка климата — один ползунок на
// диапазон, галка и выбор холод / жара.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { WEATHER_ANOMALY_COEFS, type WeatherCoefs } from "@/lib/raid/weather";
import type { StationWorld } from "@/server/api/weather-station/wstation-list";

const st = vi.hoisted(() => ({ lang: "ru" as "ru" | "en" }));
vi.mock("@/server/api/weather-station/wstation-list", () => ({ getWeatherStation: vi.fn() }));
vi.mock("@/server/api/weather-station/wstation-ritual", () => ({ castWeatherRitual: vi.fn() }));
vi.mock("@/server/api/weather-station/wstation-admin", () => ({
  adminRenameWorld: vi.fn(),
  adminSetWorldHidden: vi.fn(),
}));
vi.mock("@/lib/i18n", async (orig) => {
  const real = await orig<typeof import("@/lib/i18n")>();
  return {
    ...real,
    useLang: () => st.lang,
    useT: () => (key: string, params?: Record<string, string | number>) =>
      real.tFor(st.lang, key, params),
  };
});

const { RaidWeatherPanel } = await import("./RaidWeatherPanel");
const { WeatherBadge } = await import("./WeatherBadge");
const { WeatherStationModal } =
  await import("@/components/castle-live/weather-station/WeatherStationModal");
const { WEATHER_STATION_WORLDS_KEY } =
  await import("@/components/castle-live/weather-station/useWeatherStation");
const { WeatherClimateFields } = await import("@/components/admin/WeatherClimateFields");

const flat = (html: string) => html.replace(/\u00a0/g, " ").replace(/<!-- -->/g, "");
const ANOMALY: WeatherCoefs = { ...WEATHER_ANOMALY_COEFS };
const panel = (degrees: number, kind: "fire_rain" | "blizzard", ru = true) =>
  renderToStaticMarkup(
    <RaidWeatherPanel
      ru={ru}
      degrees={degrees}
      kind={kind}
      coefs={ANOMALY}
      effectsOn
      isAdmin={false}
      worldName="Пекло"
    />,
  );

describe("панель погоды игрока", () => {
  it("аномалия показывается: огненный дождь +50°C, метель −60°C (ru/en)", () => {
    expect(panel(50, "fire_rain")).toContain("Погода: Пекло, Огненный дождь, +50°C");
    expect(panel(-60, "blizzard")).toContain("Погода: Пекло, Метель, −60°C");
    expect(panel(60, "fire_rain", false)).toContain("Weather: Пекло, Fire rain, +60°C");
  });
  it("за −60…+60 — не показывается (нет выдуманной погоды)", () => {
    expect(panel(61, "fire_rain")).toBe("");
    expect(panel(-70, "blizzard")).toBe("");
  });
});

describe("значок огненного дождя", () => {
  it("восьмая клетка атласа 3×3 и название на языке игрока", () => {
    const html = renderToStaticMarkup(<WeatherBadge kind="fire_rain" />);
    expect(html).toContain('data-weather-badge="fire_rain"');
    expect(html).toContain("background-position:50% 100%");
    expect(html).toContain('title="Огненный дождь"');
  });
});

describe("метеостанция в аномалию", () => {
  const NOW = Date.parse("2026-11-05T12:00:00Z");
  const world: StationWorld = {
    mapId: "map_hot",
    name: "Пекло",
    kind: "fire_rain",
    temperatureC: 50,
    nextAt: NOW + 3_600_000,
    levels: [{ value: "storm", p: 100 }],
    temps: [
      { value: 40, p: 30 },
      { value: 50, p: 40 },
      { value: 60, p: 30 },
    ],
    votes: {},
    targets: ["storm", "warmer", "colder"],
    hidden: false,
  };
  it("влияние: не клюёт, не работают, стоимость ×20; сцена — жаркий шторм", () => {
    const qc = new QueryClient();
    qc.setQueryData(WEATHER_STATION_WORLDS_KEY, {
      worlds: [world],
      serverNow: NOW,
      clientAt: NOW,
      mine: {},
      shamans: 0,
      admin: false,
    });
    const html = flat(
      renderToStaticMarkup(
        <QueryClientProvider client={qc}>
          <WeatherStationModal icon="x.webp" onClose={() => {}} />
        </QueryClientProvider>,
      ),
    );
    expect(html).toContain("Огненный дождь");
    expect(html).toContain("Не клюёт");
    expect(html.match(/Не работают/g)).toHaveLength(2);
    expect(html.match(/Стоимость ×20/g)).toHaveLength(2);
    expect(html).toContain("/weather-station/scenes/hot/storm.webp");
  });
});

describe("климат мира в админке", () => {
  const render = (node: ReactNode) => renderToStaticMarkup(node);
  it("диапазоны — по одному ползунку с двумя концами; аномалия — галка и холод / жара", () => {
    const html = flat(
      render(
        <WeatherClimateFields
          climate={{ tempMin: -20, tempMax: 30, levels: ["overcast", "storm"], anomaly: "heat" }}
          set={() => {}}
          disabled={false}
        />,
      ),
    );
    expect(html.match(/role="slider"/g)).toHaveLength(4);
    expect(html).toContain("−20° … +30°");
    expect(html).toContain("пасмурно … шторм");
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("Жара +50/+60°");
    expect(html).not.toContain('type="number"');
  });
  it("без аномалии выбора холод / жара нет", () => {
    const html = render(
      <WeatherClimateFields
        climate={{
          tempMin: -40,
          tempMax: 40,
          levels: ["clear", "overcast", "storm"],
          anomaly: null,
        }}
        set={() => {}}
        disabled={false}
      />,
    );
    expect(html).not.toContain("Холод");
    expect(html).toContain("ясно … шторм");
  });
});
