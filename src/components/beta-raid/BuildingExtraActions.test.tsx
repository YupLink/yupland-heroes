// Запасной путь окна постройки: «Осмотреть округу» — только у вышки. Вид,
// которого клиент не знает (старая версия у игрока, новая постройка на
// сервере), — пусто, а не «Осмотреть округу на undefined клеток».
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BuildingExtra } from "@/lib/buildingEffect";

vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (key: string) => key,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/humanError", () => ({ humanError: (e: Error) => e.message }));
vi.mock("@/server/api/beta-raid/tower-reveal", () => ({ revealFromTower: vi.fn() }));
vi.mock("./fogReveal", () => ({ revealFogCells: vi.fn() }));
vi.mock("@/lib/hooks/useEnergy", () => ({ ENERGY_KEY: ["energy"] }));
// Окна построек — заглушки: проверяем только, что попадает в запасной путь.
const stub = vi.hoisted(() => (name: string) => ({ [name]: () => name }));
vi.mock("./TreeLevelAction", () => stub("TreeLevelAction"));
vi.mock("./SignModal", () => stub("SignModal"));
vi.mock("./university/UniversityAction", () => stub("UniversityAction"));
vi.mock("./museum/MuseumAction", () => stub("MuseumAction"));
vi.mock("./TavernAction", () => stub("TavernAction"));
vi.mock("./ShipyardAction", () => stub("ShipyardAction"));
vi.mock("./tournament/TournamentAction", () => stub("TournamentAction"));
vi.mock("./CasinoAction", () => stub("CasinoAction"));
vi.mock("./FieldAction", () => stub("FieldAction"));
vi.mock("./WarehouseAction", () => stub("WarehouseAction"));
vi.mock("./MineAction", () => stub("MineAction"));
vi.mock("./MarketAction", () => stub("MarketAction"));
vi.mock("./PortalAction", () => stub("PortalAction"));
vi.mock("./BoostAction", () => stub("BoostAction"));
vi.mock("./ChambersAction", () => stub("ChambersAction"));
vi.mock("./OblivionAction", () => stub("OblivionAction"));
vi.mock("./spell-pillar/SpellPillarAction", () => stub("SpellPillarAction"));
vi.mock("@/components/beta-raid/enchant/EnchantAction", () => stub("EnchantAction"));

const { BuildingExtraActions } = await import("./BuildingExtraActions");

const render = (extra: unknown) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <BuildingExtraActions q={1} r={2} extra={extra as BuildingExtra} onDone={() => {}} />
    </QueryClientProvider>,
  );

describe("BuildingExtraActions — запасной путь", () => {
  it("незнакомый вид — ничего (не «Осмотреть округу»)", () => {
    expect(render({ kind: "brand_new_shop", can: true })).toBe("");
    expect(render({ kind: "enchant_v2" })).toBe("");
  });

  it("вышка — «Осмотреть округу», лавка — своё окно", () => {
    const tower = render({
      kind: "watchtower",
      energy: 5,
      radius: 3,
      used: false,
      can: true,
      reasonKey: null,
    });
    expect(tower).toContain("braid.scout_for");
    expect(tower).toContain("braid.reveal_terrain");
    expect(render({ kind: "enchant" })).toBe("EnchantAction");
  });
});
