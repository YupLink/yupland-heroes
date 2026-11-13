// Права на расстановку: базовые здания — всем, покупные — построившим, декор и
// стили — купленным в Ратуше (или набором), дорожки — со стилем дорожек; админ
// и дизайнер — всё. Совпадает с тем, что показывает редактор.
import { describe, expect, it } from "vitest";
import {
  decodeModularLayout,
  serializeModularLayout,
} from "@/components/castle-live/modularCastleLayout";
import { originals } from "@/components/castle-live/modularCastleProfiles";
import { ownedBuildingTemplates } from "@/components/castle-live/modularBuildingRegistry";
import { decorCatalog } from "@/components/castle-live/modularDecorCatalog";
import { DEFAULT_BUILDINGS, DEFAULT_DECOR, NEWSPAPER_KIOSK_KIND } from "@/lib/townHallCatalog";
import { parseSaveInput, type ModularLayoutItem } from "./layout-schema";
import {
  BASE_LAYOUT_BUILDINGS,
  OWNED_LAYOUT_BUILDINGS,
  layoutRightsProblem,
  type LayoutOwnership,
} from "./layout-rights";

const base = (): ModularLayoutItem[] =>
  parseSaveInput({ revision: 0, layout: serializeModularLayout(decodeModularLayout([])) }).layout;
const gateIdx = (l: ModularLayoutItem[]) => l.findIndex((b) => b.id === "gates");
const nobody: LayoutOwnership = { buildings: {}, decor: [], full: false };
const check = (l: ModularLayoutItem[], own: Partial<LayoutOwnership> = {}) =>
  layoutRightsProblem(l, { ...nobody, ...own })?.message ?? null;
const decor = (catalogId: string, n = 0): ModularLayoutItem => ({
  id: `decor:${catalogId}-${n}`,
  x: 400,
  y: 850,
  size: 150,
  baseSize: 150,
  caption: { x: 0, y: 0, font: 12, height: 23 },
  decor: true,
  catalogId,
});
const building = (id: string): ModularLayoutItem => ({
  id,
  x: 700,
  y: 900,
  size: 220,
  caption: { x: 0, y: -8, font: 12, height: 23 },
});
const styled = (patch: Partial<ModularLayoutItem>) => {
  const l = base();
  l[gateIdx(l)] = { ...l[gateIdx(l)], ...patch };
  return l;
};

describe("списки прав = сцена замка", () => {
  it("базовые — исходная сцена и Банк, покупные — шаблоны редактора", () => {
    expect(BASE_LAYOUT_BUILDINGS).toEqual([...originals.map((b) => b.id), "bank"]);
    const rights = new Set([...BASE_LAYOUT_BUILDINGS, ...OWNED_LAYOUT_BUILDINGS]);
    for (const id of Object.keys(ownedBuildingTemplates)) expect(rights.has(id)).toBe(true);
  });
  it("покупное без облика в сцене — только здание Ратуши (облик приходит позже)", () => {
    for (const id of OWNED_LAYOUT_BUILDINGS)
      expect(id in ownedBuildingTemplates || id in DEFAULT_BUILDINGS).toBe(true);
    expect(OWNED_LAYOUT_BUILDINGS).toContain(NEWSPAPER_KIOSK_KIND);
  });
  it("каждый продаваемый в Ратуше вид декора есть в каталоге замка", () => {
    const sold = Object.keys(DEFAULT_DECOR).filter((k) => !k.includes(":"));
    const all = new Set(decorCatalog.map((d) => d.id));
    for (const k of sold) expect(all.has(k)).toBe(true);
  });
});

describe("layoutRightsProblem", () => {
  it("базовая сцена с Банком — у любого, без покупок", () => {
    expect(check([...base(), building("bank")])).toBeNull();
  });
  it("покупное здание — только построенное, одно на id", () => {
    for (const id of OWNED_LAYOUT_BUILDINGS) {
      expect(check([...base(), building(id)])).toBe(`castle.layout_not_owned|{"id":"${id}"}`);
      expect(check([...base(), building(id)], { buildings: { [id]: 1 } })).toBeNull();
    }
    expect(
      check([...base(), building("casino"), building("casino")], { buildings: { casino: 1 } }),
    ).toBe('castle.layout_duplicate|{"id":"casino"}');
  });
  it("незнакомое здание — отказ", () => {
    expect(check([...base(), building("dragon_lair")])).toBe(
      'castle.layout_unknown|{"id":"dragon_lair"}',
    );
  });
  it("декор — купленный вид, ставится сколько угодно", () => {
    expect(check([...base(), decor("well")])).toBe('castle.layout_not_owned|{"id":"well"}');
    const many = [decor("well", 1), decor("well", 2), decor("well", 3)];
    expect(check([...base(), ...many], { decor: ["well"] })).toBeNull();
    expect(check([...base(), decor("elven-bench")], { decor: ["well"] })).toBe(
      'castle.layout_not_owned|{"id":"elven-bench"}',
    );
    expect(check([...base(), decor("elven-bench")], { decor: ["appearance:elven"] })).toBeNull();
    expect(check([...base(), decor("golden-throne")], { full: true })).toBe(
      'castle.layout_unknown|{"id":"golden-throne"}',
    );
  });
  it("стили ворот: «base» — всем, остальные — купленным", () => {
    expect(
      check(styled({ buildingStyle: "base", roadStyle: "base", territoryStyle: "base" })),
    ).toBeNull();
    expect(check(styled({ buildingStyle: "elven" }))).toBe(
      'castle.layout_not_owned|{"id":"appearance:elven"}',
    );
    expect(check(styled({ buildingStyle: "elven" }), { decor: ["appearance:elven"] })).toBeNull();
    expect(check(styled({ roadStyle: "winter" }))).toBe(
      'castle.layout_not_owned|{"id":"road:winter"}',
    );
    expect(check(styled({ roadStyle: "winter" }), { decor: ["road:winter"] })).toBeNull();
    expect(check(styled({ territoryStyle: "infernal" }), { decor: ["road:infernal"] })).toBe(
      'castle.layout_not_owned|{"id":"territory:infernal"}',
    );
    expect(
      check(styled({ territoryStyle: "infernal" }), { decor: ["territory:infernal"] }),
    ).toBeNull();
  });
  it("дорожки — когда есть хоть один стиль дорожек", () => {
    const roads = styled({ roadSegments: [[1, 2, 3, 4]], pathCells: [[0, 1]] });
    expect(check(roads)).toBe('castle.layout_not_owned|{"id":"road"}');
    expect(check(roads, { decor: ["road:elven"] })).toBeNull();
    expect(check(styled({ roadSegments: [], pathCells: [] }))).toBeNull();
  });
  it("админ и дизайнер — весь декор и стили, но не чужие здания", () => {
    const all = styled({
      buildingStyle: "celestial",
      roadStyle: "buckwheat",
      roadSegments: [[1, 2, 3, 4]],
    });
    const items = decorCatalog.map((d, i) => decor(d.id, i));
    expect(check([...all, ...items], { full: true })).toBeNull();
    expect(check([...all, building("architect")], { full: true })).toBe(
      'castle.layout_not_owned|{"id":"architect"}',
    );
  });
});
