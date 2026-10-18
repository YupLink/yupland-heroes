// Метки ассетов (владелец, 25.09): местности и расы у декора и построек.
// Пусто — подходит всем; ограничивает только отмеченное.
import { describe, expect, it } from "vitest";
import {
  raceAllowed,
  raceOfTheme,
  racesFromName,
  scopeByRace,
  terrainAllowed,
} from "@/lib/raid/assetTags";
import { decorPlan } from "@/lib/raid/zonegen/decorPlan";
import { buildAutoTags } from "@/server/api/beta-raid/asset-tags-auto";
import { AFF, recipe } from "@/test/zonegenFixture";

describe("раса по имени", () => {
  it("склонения и составные имена", () => {
    expect(racesFromName("Магазин единорога")).toEqual(["Единорог"]);
    expect(racesFromName("Кабаньи ворота")).toEqual(["Кабан"]);
    expect(racesFromName("Пчелинные ворта")).toEqual(["Пчела"]);
    expect(racesFromName("Драконий магазин")).toEqual(["Дракон"]);
    expect(racesFromName("Юпик Лавка")).toEqual(["Юпик"]);
  });

  it("ДраКошка не путается с Драконом", () => {
    expect(racesFromName("Виходка")).toEqual(["ДраКошка"]);
    expect(racesFromName("Драконо кошки")).toEqual(["ДраКошка"]);
  });

  it("без расы — пусто (Северный, Адский, просто «Лавка»)", () => {
    expect(racesFromName("Северная Лавка")).toEqual([]);
    expect(racesFromName("Лавка")).toEqual([]);
    expect(raceOfTheme("Адский")).toBeNull();
    expect(raceOfTheme("Виходка")).toBe("ДраКошка");
  });
});

describe("правила меток", () => {
  it("пусто = подходит всем", () => {
    expect(raceAllowed([], null)).toBe(true);
    expect(terrainAllowed([], "grass")).toBe(true);
    expect(terrainAllowed(["grass"], undefined)).toBe(true);
  });

  it("расовая постройка — только в город своей расы", () => {
    expect(raceAllowed(["Кабан"], "Кабан")).toBe(true);
    expect(raceAllowed(["Кабан"], "Юпик")).toBe(false);
    expect(raceAllowed(["Кабан"], null)).toBe(false);
  });

  it("город расы: чужие постройки убраны, чужие облики сняты", () => {
    const options = [
      { id: "shop", skins: [{ races: ["Юпик"] }, { races: ["Кабан"] }, {}] },
      { id: "boar-gate", races: ["Кабан"] },
      { id: "well" },
    ];
    const scoped = scopeByRace(options, "Юпик");
    expect(scoped.map((o) => o.id)).toEqual(["shop", "well"]);
    expect(scoped[0].skins).toHaveLength(2);
  });
});

describe("декор генератора по меткам", () => {
  it("декор с меткой другой местности сюда не ставится", () => {
    const plan = decorPlan("grass", AFF.byTerrain.grass, recipe(), {
      ...AFF,
      decorTerrains: { bush: ["sand"] },
    });
    expect(plan?.ids).toEqual(["tree"]);
  });

  it("местность без опыта берёт отмеченный для неё декор даже в строгом режиме", () => {
    const plan = decorPlan("sand", undefined, recipe({ decorStrict: true }), {
      ...AFF,
      decorTerrains: { rock: ["sand"] },
    });
    expect(plan?.ids).toEqual(["rock"]);
  });

  it("без меток — как раньше", () => {
    expect(decorPlan("sand", undefined, recipe({ decorStrict: true }), AFF)).toBeNull();
  });
});

describe("автоматическая разметка", () => {
  it("декору — местности с карты и раса из имени; постройкам — только раса", () => {
    const tags = buildAutoTags(
      [{ id: "d1", name: "Кабанье дерево", terrains: ["t1", "t2"] }],
      [{ id: "b1", name: "Магазин единорога" }],
      [{ id: "s1", name: "Юпик Таверна" }],
    );
    expect(tags).toEqual([
      { refId: "d1", kind: "decoration", terrains: ["t1", "t2"], races: ["Кабан"] },
      { refId: "b1", kind: "building", terrains: [], races: ["Единорог"] },
      { refId: "s1", kind: "skin", terrains: [], races: ["Юпик"] },
    ]);
  });
});
