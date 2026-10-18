// Живой рост в панели: когда виден ручной список, как читается число построек,
// что переносит шаблон и есть ли у каждой формы и планировки слова ru+en.
import { describe, expect, it } from "vitest";
import { dict } from "@/lib/translations";
import type { BlueprintBody } from "@/lib/raid/zonegen/blueprint-types";
import { SETTLEMENT_LAYOUTS, defaultSettlement } from "@/lib/raid/zonegen/settlement-types";
import type { TownForm } from "@/lib/raid/zonegen/town/types";
import {
  BUILDINGS_MAX,
  BUILDINGS_MIN,
  blueprintPatch,
  canSaveBlueprint,
  derivesShape,
  formKey,
  parseBuildings,
  themeChoices,
  themeLabel,
  usesManualSet,
} from "./settlementAuto";

const body = (part: Partial<BlueprintBody> = {}): BlueprintBody => {
  const s = defaultSettlement();
  return {
    layout: s.layout,
    size: s.size,
    density: s.density,
    slots: s.slots,
    roadId: s.roadId,
    built: s.built,
    auto: s.auto,
    buildings: s.buildings,
    kind: s.kind,
    theme: s.theme,
    ...part,
  };
};

describe("usesManualSet / derivesShape", () => {
  it("по умолчанию живой рост с автоподбором — ручной список не нужен", () => {
    const s = defaultSettlement();
    expect(s.layout).toBe("organic");
    expect(usesManualSet(s)).toBe(false);
  });

  it("автоподбор выключен или трафарет — город собирается из списка", () => {
    expect(usesManualSet({ layout: "organic", auto: false })).toBe(true);
    for (const layout of ["ring", "cross", "grid", "free"] as const) {
      expect(usesManualSet({ layout, auto: true })).toBe(true);
    }
  });

  it("поперечник и плотность выводит только живой рост", () => {
    expect(derivesShape("organic")).toBe(true);
    expect(derivesShape("ring")).toBe(false);
    expect(derivesShape("free")).toBe(false);
  });
});

describe("parseBuildings", () => {
  it("в границах — число, дробное округляется", () => {
    expect(parseBuildings("12")).toBe(12);
    expect(parseBuildings(String(BUILDINGS_MIN))).toBe(BUILDINGS_MIN);
    expect(parseBuildings(String(BUILDINGS_MAX))).toBe(BUILDINGS_MAX);
    expect(parseBuildings("7.4")).toBe(7);
  });

  it("недобранное «1» по дороге к «12» не зажимается в 3", () => {
    expect(parseBuildings("1")).toBeNull();
    expect(parseBuildings("")).toBeNull();
    expect(parseBuildings("  ")).toBeNull();
    expect(parseBuildings("abc")).toBeNull();
    expect(parseBuildings("41")).toBeNull();
  });
});

describe("темы", () => {
  const themes = [
    { theme: "Юпик", coverage: 15 },
    { theme: "Кабан", coverage: 14 },
  ];

  it("подпись — имя и покрытие", () => {
    expect(themeLabel(themes[1])).toBe("Кабан · 14");
  });

  it("случайная или известная тема — список как есть", () => {
    expect(themeChoices(themes, "")).toBe(themes);
    expect(themeChoices(themes, "Кабан")).toBe(themes);
  });

  it("выбранная тема пропала из справочника — остаётся в списке, а не молча подменяется", () => {
    expect(themeChoices(themes, "Адский")).toEqual([...themes, { theme: "Адский", coverage: 0 }]);
  });
});

describe("blueprintPatch", () => {
  it("готовый шаблон без дороги берёт мостовую из рецепта", () => {
    const out = blueprintPatch(body({ roadId: null }), { roadId: "r_stone" }, true);
    expect(out.roadId).toBe("r_stone");
  });

  it("свой шаблон «без дороги» переносится как сохранён", () => {
    const out = blueprintPatch(body({ roadId: null }), { roadId: "r_stone" }, false);
    expect(out.roadId).toBeNull();
  });

  it("живой шаблон приезжает с автоподбором, масштабом и темой", () => {
    const out = blueprintPatch(
      body({ auto: true, buildings: 24, theme: "Кабан" }),
      { roadId: null },
      true,
    );
    expect(out).toMatchObject({ layout: "organic", auto: true, buildings: 24, theme: "Кабан" });
  });

  it("ручной набор владельца не затирается автоподбором", () => {
    const slots = [{ buildingId: "b_hall", count: 1 }];
    const out = blueprintPatch(body({ auto: false, slots }), { roadId: null }, false);
    expect(out.auto).toBe(false);
    expect(out.slots).toEqual(slots);
  });
});

describe("canSaveBlueprint", () => {
  it("при автоподборе сохраняется и с пустым списком", () => {
    expect(canSaveBlueprint({ layout: "organic", auto: true, slots: [] })).toBe(true);
  });

  it("при ручном составе без строк сохранять нечего", () => {
    expect(canSaveBlueprint({ layout: "organic", auto: false, slots: [] })).toBe(false);
    expect(canSaveBlueprint({ layout: "ring", auto: true, slots: [] })).toBe(false);
    const one = [{ buildingId: "b_hall", count: 1 }];
    expect(canSaveBlueprint({ layout: "ring", auto: true, slots: one })).toBe(true);
  });
});

describe("слова ru+en", () => {
  const FORMS = [
    "camp",
    "hamlet",
    "street",
    "round",
    "green",
    "cluster",
    "town",
    "port",
  ] as const satisfies readonly TownForm[];

  it("у каждой формы поселения есть имя на обоих языках", () => {
    for (const f of FORMS) {
      expect(dict[formKey(f)]?.ru, f).toBeTruthy();
      expect(dict[formKey(f)]?.en, f).toBeTruthy();
    }
  });

  it("у каждой планировки есть кнопка и подпись на обоих языках", () => {
    for (const l of SETTLEMENT_LAYOUTS) {
      for (const key of [`zonegen.layout_${l}`, `zonegen.layout_${l}_hint`]) {
        expect(dict[key]?.ru, key).toBeTruthy();
        expect(dict[key]?.en, key).toBeTruthy();
      }
    }
  });
});
