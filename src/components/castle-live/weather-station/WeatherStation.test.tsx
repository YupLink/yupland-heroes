// «Метеостанция» на экране: карточка в Ратуше (цена владельца, «Построить» /
// «Построено»), иконка в замке только со зданием, окно — мир, погода сейчас,
// отсчёт до смены и шансы целыми процентами; перечитываем после смены.
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { StationWorld } from "@/server/api/weather-station/wstation-list";

vi.mock("@/server/api/castle-townhall/townhall-state", () => ({ getTownHall: vi.fn(), upgradeTownHall: vi.fn() }));
vi.mock("@/server/api/castle-townhall/townhall-buy", () => ({ buyCastleBuilding: vi.fn() }));
vi.mock("@/server/api/beta-raid/my-resources", () => ({ getMyResources: vi.fn() }));
vi.mock("@/server/api/mine-office/mine-office-own", () => ({ getMineOffice: vi.fn() }));
vi.mock("@/server/api/weather-station/wstation-own", () => ({ getWeatherStationOwned: vi.fn() }));
vi.mock("@/server/api/weather-station/wstation-list", () => ({ getWeatherStation: vi.fn() }));
vi.mock("@/server/api/weather-station/wstation-ritual", () => ({ castWeatherRitual: vi.fn() }));
vi.mock("@/server/api/weather-station/wstation-admin", () => ({ adminRenameWorld: vi.fn(), adminSetWorldHidden: vi.fn() }));
vi.mock("@/server/api/user-auth", () => ({ getSession: vi.fn() }));
vi.mock("@/server/api/game-auction", () => ({ listAuctions: vi.fn() }));
vi.mock("@/server/api/beta-raid/harvest-summary", () => ({ getHarvestSummary: vi.fn() }));
vi.mock("@/server/api/gifts", () => ({ getMyGifts: vi.fn() }));
// Язык — русский (стор zustand при рендере на сервере берёт начальное «en»).
vi.mock("@/lib/i18n", async (orig) => {
  const real = await orig<typeof import("@/lib/i18n")>();
  return {
    ...real,
    useLang: () => "ru",
    useT: () => (key: string, params?: Record<string, string | number>) => real.tFor("ru", key, params),
  };
});

const { TownHallWeatherStation } = await import("../TownHallWeatherStation");
const { TOWN_HALL_KEY } = await import("../useTownHall");
const { WEATHER_STATION_OWNED_KEY } = await import("../useWithWeatherStation");
const { CastleRewardRail } = await import("../CastleRewardRail");
const { WeatherStationWorld } = await import("./WeatherStationWorld");
const { WeatherStationModal } = await import("./WeatherStationModal");
const { WEATHER_STATION_WORLDS_KEY, stationRefetchMs } = await import("./useWeatherStation");

const render = (node: ReactNode, data: Array<[readonly unknown[], unknown]> = []) => {
  const qc = new QueryClient();
  for (const [key, value] of data) qc.setQueryData(key, value);
  return renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
};
const flat = (html: string) => html.replace(/\u00a0/g, " ").replace(/<!-- -->/g, "");

const hall = (o: Record<string, unknown>) => ({
  level: 1,
  catalog: [
    {
      kind: "weather_station",
      cost: { wood: 1_000, stone: 500, gold: 500, diamonds: 0 },
      max: 1,
      needLevel: 1,
      owned: 0,
      problem: null,
      ...o,
    },
  ],
  buildings: [],
  resources: { wood: 2_000, stone: 900, gold: 900, diamonds: 0 },
});

describe("карточка в Ратуше", () => {
  it("цена владельца и «Построить»; алмазов в цене нет", () => {
    const html = flat(render(<TownHallWeatherStation ru />, [[TOWN_HALL_KEY, hall({})]]));
    expect(html).toContain("Метеостанция");
    for (const n of ["1 000", ">500<"]) expect(html).toContain(n);
    expect(html).toContain("Построить");
    expect(html).not.toContain('disabled=""');
  });
  it("построена — без покупки", () => {
    const html = render(<TownHallWeatherStation ru />, [[TOWN_HALL_KEY, hall({ owned: 1, problem: "max" })]]);
    expect(html).toContain("Построено");
    expect(html).not.toContain("Построить");
  });
});

describe("иконка в замке", () => {
  it("нет здания — нет иконки; есть — появляется", () => {
    const label = "Метеостанция";
    expect(render(<CastleRewardRail lang="ru" />, [[WEATHER_STATION_OWNED_KEY, { owned: false }]])).not.toContain(label);
    expect(render(<CastleRewardRail lang="ru" />, [[WEATHER_STATION_OWNED_KEY, { owned: true }]])).toContain(label);
  });
});

const NOW = Date.parse("2026-10-28T12:44:53Z");
const world = (o: Partial<StationWorld> = {}): StationWorld => ({
  mapId: "map_a",
  name: "Мир Альфа",
  kind: "rain",
  temperatureC: 10,
  nextAt: Date.parse("2026-10-28T15:00:00Z"),
  levels: [
    { value: "clear", p: 25 },
    { value: "overcast", p: 50 },
    { value: "storm", p: 25 },
  ],
  temps: [
    { value: 0, p: 100 / 3 },
    { value: 10, p: 100 / 3 },
    { value: 20, p: 100 / 3 },
  ],
  votes: {},
  targets: ["clear", "overcast", "storm", "warmer", "colder"],
  hidden: false,
  ...o,
});
const Block = (p: { w: StationWorld; mine?: "clear" | "warmer" | null; shamans?: number; admin?: boolean }) => (
  <WeatherStationWorld w={p.w} now={NOW} mine={p.mine ?? null} shamans={p.shamans ?? 0} admin={p.admin} />
);

describe("блок мира", () => {
  it("мир, погода сейчас, отсчёт до смены и шансы целыми процентами", () => {
    const html = flat(render(<Block w={world()} />));
    expect(html).toContain("Мир Альфа");
    expect(html).toContain("Дождь +10°");
    expect(html).toContain("2:15:07");
    for (const s of ["Ясно</span> <b", "Пасмурно", "Шторм"]) expect(html).toContain(s);
    expect(html).toContain(">25 %<");
    expect(html).toContain(">50 %<");
    expect(html).toContain(">0°<");
    expect(html).toContain(">+20°<");
    expect(html.match(/>33 %</g)).toHaveLength(3);
  });
  it("минус — типографский; меньше часа — «м:сс»; смена прошла — «0:00»", () => {
    const cold = flat(render(<Block w={world({ kind: "blizzard", temperatureC: -20 })} />));
    expect(cold).toContain("Метель −20°");
    const soon = world({ nextAt: NOW + 5 * 60_000 + 9_000 });
    expect(flat(render(<Block w={soon} />))).toContain("5:09");
    expect(flat(render(<Block w={world({ nextAt: NOW - 1 })} />))).toContain("0:00");
  });
});

describe("обряд шамана", () => {
  it("шаманы есть — кнопка «Обряд»; нет — она выключена", () => {
    expect(flat(render(<Block w={world()} shamans={2} />))).toMatch(/<button[^>]*>(?:(?!disabled).)*Обряд/);
    expect(flat(render(<Block w={world()} shamans={0} />))).toMatch(/disabled=""[^>]*>.*Обряд/);
  });
  it("обряд в этом мире уже был — «Ваш обряд», кнопки нет; в другом мире своя кнопка (по одному в каждом)", () => {
    const here = flat(render(<Block w={world()} shamans={2} mine="warmer" />));
    expect(here).toContain("Ваш обряд: Теплее +3 %");
    expect(here).not.toMatch(/<button[^>]*>[^<]*<svg[^>]*>.*?<\/svg>Обряд<\/button>/);
    const other = flat(render(<Block w={world({ mapId: "map_b" })} shamans={2} mine={null} />));
    expect(other).toContain(">Обряд<");
  });
  it("админ: переименовать и скрыть; скрытый мир помечен; игроку кнопок нет", () => {
    const html = flat(render(<Block w={world({ hidden: true })} admin />));
    expect(html).toContain('aria-label="Переименовать мир"');
    expect(html).toContain('aria-label="Вернуть в станцию"');
    expect(html).toContain(">скрыт<");
    expect(flat(render(<Block w={world()} />))).not.toContain("Переименовать мир");
  });
  it("голоса этой смены видны", () => {
    const html = flat(render(<Block w={world({ votes: { clear: 5, warmer: 2 } })} />));
    expect(html).toContain("Голоса шаманов: Ясно 5 · Теплее 2");
  });
});

describe("окно", () => {
  afterEach(() => vi.useRealTimers());
  it("миры из ответа; отсчёт — по часам сервера", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    // Часы телефона на 10 минут вперёд: отсчёт всё равно от часов сервера.
    const data = { worlds: [world()], serverNow: NOW - 600_000, clientAt: NOW, mine: {}, shamans: 3, admin: false };
    const html = flat(render(<WeatherStationModal icon="x.webp" onClose={() => {}} />, [[WEATHER_STATION_WORLDS_KEY, data]]));
    expect(html).toContain("Метеостанция");
    expect(html).toContain("Мир Альфа");
    expect(html).toContain("2:25:07");
  });
  it("миров нет — так и пишем", () => {
    const data = { worlds: [], serverNow: NOW, clientAt: NOW, mine: {}, shamans: 0, admin: false };
    expect(render(<WeatherStationModal icon="x.webp" onClose={() => {}} />, [[WEATHER_STATION_WORLDS_KEY, data]])).toContain(
      "Миров с погодой нет",
    );
  });
  it("перечитать: чуть позже ближайшей смены, не реже раза в минуту, не чаще раза в 5 с", () => {
    expect(stationRefetchMs([], NOW)).toBe(60_000);
    expect(stationRefetchMs([world({ nextAt: NOW + 20_000 }), world({ nextAt: NOW + 50_000 })], NOW)).toBe(22_000);
    expect(stationRefetchMs([world({ nextAt: NOW + 3_600_000 })], NOW)).toBe(60_000);
    expect(stationRefetchMs([world({ nextAt: NOW - 30_000 })], NOW)).toBe(5_000);
  });
});
