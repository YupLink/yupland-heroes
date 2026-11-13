// Схема расстановки замка: настоящий вывод serializeModularLayout проходит,
// лишние поля отбрасываются, пределы и стили держатся, отказы — ключами.
import { describe, expect, it } from "vitest";
import {
  decodeModularLayout,
  serializeModularLayout,
} from "@/components/castle-live/modularCastleLayout";
import { buildingStyleIds } from "@/components/castle-live/modularBuildingStyles";
import { castlePathStyles } from "@/components/castle-live/castlePathStyles";
import { castleTerritoryStyles } from "@/components/castle-live/castleTerritoryStyles";
import { appearanceStyles } from "@/components/castle-live/castleAppearanceAccess";
import { createDecor, decorCatalog } from "@/components/castle-live/modularDecorCatalog";
import { ownedBuildingTemplates } from "@/components/castle-live/modularBuildingRegistry";
import { humanError } from "@/lib/humanError";
import { useAppStore } from "@/lib/store";
import { LAYOUT_MAX_ITEMS, parseSaveInput, type ModularLayoutInput } from "./layout-schema";

/** Сцена «как у редактора»: все базовые, все покупные здания и декор каждого вида. */
function fullScene() {
  const scene = decodeModularLayout([]);
  for (const make of Object.values(ownedBuildingTemplates)) {
    const b = make();
    if (b) scene.push({ ...b, baseSize: b.size });
  }
  decorCatalog.forEach((d, i) => scene.push(createDecor(d.id, `decor:${i}-x`, 400, 850)!));
  const gates = scene.find((b) => b.id === "gates")!;
  Object.assign(gates, {
    buildingStyle: "elven",
    roadStyle: "winter",
    territoryStyle: "celestial",
    pathCells: [
      [1, 2],
      [-70, 70],
    ],
    roadSegments: [[10, 20, 46.5, 38.25]],
  });
  return serializeModularLayout(scene);
}

const errOf = (d: unknown): string => {
  try {
    parseSaveInput(d);
    return "ok";
  } catch (e) {
    return (e as Error).message;
  }
};
const scene = () => fullScene() as ModularLayoutInput[];
const withItem = (patch: Record<string, unknown>, i = 0) =>
  scene().map((b, k) => (k === i ? { ...b, ...patch } : b));

describe("отказы — ru и en через humanError", () => {
  it("ключ с подстановкой и без", () => {
    useAppStore.setState({ lang: "ru" });
    expect(humanError(new Error('castle.layout_not_owned|{"id":"casino"}'))).toBe(
      "Расстановка не сохранена: casino не куплено",
    );
    useAppStore.setState({ lang: "en" });
    expect(humanError(new Error("castle.layout_too_big"))).toBe(
      "Layout not saved: too many objects",
    );
    expect(humanError(new Error('castle.layout_bad|{"at":"layout.0.x"}'))).toBe(
      "Layout not saved: invalid data (layout.0.x)",
    );
    useAppStore.setState({ lang: "ru" });
  });
});

describe("стили сервера = стили замка", () => {
  it("здания, дорожки, земля и наборы — один список", () => {
    expect([...buildingStyleIds]).toEqual([...appearanceStyles]);
    expect(castlePathStyles.map((s) => s.id)).toEqual([...appearanceStyles]);
    expect(castleTerritoryStyles.map((s) => s.id)).toEqual([...appearanceStyles]);
  });
});

describe("parseSaveInput", () => {
  it("вывод serializeModularLayout проходит как есть, все поля на месте", () => {
    const layout = scene();
    const r = parseSaveInput({ revision: 0, layout });
    expect(r.layout).toEqual(JSON.parse(JSON.stringify(layout)));
    const gates = r.layout.find((b) => b.id === "gates")!;
    expect(gates).toMatchObject({
      buildingStyle: "elven",
      roadStyle: "winter",
      territoryStyle: "celestial",
    });
    expect(gates.roadSegments).toEqual([[10, 20, 46.5, 38.25]]);
    const decor = r.layout.find((b) => b.decor)!;
    expect(decor).toMatchObject({ catalogId: decorCatalog[0].id, baseSize: decorCatalog[0].size });
  });
  it("базовая сцена без правок (ничего не куплено) — тоже", () => {
    const layout = serializeModularLayout(decodeModularLayout([]));
    expect(parseSaveInput({ revision: 3, layout }).layout).toHaveLength(10);
  });
  it("лишние поля отбрасываются: и у объекта, и чужой аккаунт во входе", () => {
    const r = parseSaveInput({
      revision: 1,
      account: "acc_other",
      wallet: "w_other",
      layout: withItem({ image: "x.png", volumes: [], name: "Рынок" }),
    }) as unknown as Record<string, unknown>;
    expect(r).not.toHaveProperty("account");
    expect(r).not.toHaveProperty("wallet");
    const first = (r.layout as Record<string, unknown>[])[0];
    expect(first).not.toHaveProperty("image");
    expect(first).not.toHaveProperty("volumes");
  });
  it("ревизия — целое ≥ 0", () => {
    expect(errOf({ revision: -1, layout: [] })).toBe('castle.layout_bad|{"at":"revision"}');
    expect(errOf({ revision: 1.5, layout: [] })).toBe('castle.layout_bad|{"at":"revision"}');
    expect(errOf({ layout: [] })).toBe('castle.layout_bad|{"at":"revision"}');
    expect(errOf({ revision: 0, layout: null })).toBe('castle.layout_bad|{"at":"layout"}');
  });
  it("числа конечные и в пределах редактора", () => {
    const bad = (patch: Record<string, unknown>) => errOf({ revision: 0, layout: withItem(patch) });
    expect(bad({ x: Number.NaN })).toBe('castle.layout_bad|{"at":"layout.0.x"}');
    expect(bad({ x: Number.POSITIVE_INFINITY })).toBe('castle.layout_bad|{"at":"layout.0.x"}');
    expect(bad({ x: 1401 })).toBe('castle.layout_bad|{"at":"layout.0.x"}');
    expect(bad({ y: 329 })).toBe('castle.layout_bad|{"at":"layout.0.y"}');
    expect(bad({ size: 601 })).toBe('castle.layout_bad|{"at":"layout.0.size"}');
    expect(bad({ x: "10" })).toBe('castle.layout_bad|{"at":"layout.0.x"}');
    expect(bad({ caption: { x: 0, y: 0, font: 40, height: 23 } })).toBe(
      'castle.layout_bad|{"at":"layout.0.caption.font"}',
    );
    expect(bad({ caption: undefined })).toBe('castle.layout_bad|{"at":"layout.0.caption"}');
    expect(bad({ mirrored: "yes" })).toBe('castle.layout_bad|{"at":"layout.0.mirrored"}');
    expect(bad({ id: "Hall; DROP" })).toBe('castle.layout_bad|{"at":"layout.0.id"}');
    expect(bad({ pathCells: [[1.5, 2]] })).toBe(
      'castle.layout_bad|{"at":"layout.0.pathCells.0.0"}',
    );
    expect(bad({ roadSegments: [[1, 2, 3]] })).toBe(
      'castle.layout_bad|{"at":"layout.0.roadSegments.0"}',
    );
  });
  it("незнакомый стиль — отказ", () => {
    const gate = scene().findIndex((b) => b.id === "gates");
    const bad = (patch: Record<string, unknown>) =>
      errOf({ revision: 0, layout: withItem(patch, gate) });
    expect(bad({ roadStyle: "golden" })).toBe(
      `castle.layout_bad|{"at":"layout.${gate}.roadStyle"}`,
    );
    expect(bad({ buildingStyle: "" })).toBe(
      `castle.layout_bad|{"at":"layout.${gate}.buildingStyle"}`,
    );
  });
  it("декор — три признака сразу: decor, «decor:»-id, вид каталога", () => {
    const d = scene().findIndex((b) => b.decor);
    const at = `castle.layout_bad|{"at":"layout.${d}.decor"}`;
    expect(errOf({ revision: 0, layout: withItem({ catalogId: undefined }, d) })).toBe(at);
    expect(errOf({ revision: 0, layout: withItem({ decor: false }, d) })).toBe(at);
    expect(errOf({ revision: 0, layout: withItem({ id: "fountain" }, d) })).toBe(at);
    expect(errOf({ revision: 0, layout: withItem({ catalogId: "tree" }, 0) })).toBe(
      'castle.layout_bad|{"at":"layout.0.decor"}',
    );
  });
  it("предел объектов и размера", () => {
    const many = Array.from({ length: LAYOUT_MAX_ITEMS + 1 }, (_, i) => ({
      ...scene()[0],
      id: `b${i}`,
    }));
    expect(errOf({ revision: 0, layout: many })).toBe("castle.layout_too_big");
    const roads = Array.from({ length: 1000 }, (_, i) => [
      100.123456789 + i,
      200.123456789,
      300.123456789,
      400.123456789,
    ]);
    const heavy = Array.from({ length: 300 }, (_, i) => ({
      ...scene()[0],
      id: `b${i}`,
      roadSegments: roads,
    }));
    expect(errOf({ revision: 0, layout: heavy })).toBe("castle.layout_too_big");
  });
});
