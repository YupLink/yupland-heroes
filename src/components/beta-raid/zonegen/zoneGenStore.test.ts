// Рецепт в локалке: свой ключ на карту, срок годности, стойкость к мусору.
import { describe, expect, it } from "vitest";
import { defaultRecipe } from "@/lib/raid/zonegen/recipe";
import { RECIPE_TTL_MS, loadRecipe, recipeKey, saveRecipe, type MiniStorage } from "./zoneGenStore";

/** Локалка на объекте: в тестах окружение node, настоящей нет. */
function fakeStore(): MiniStorage & { box: Record<string, string> } {
  const box: Record<string, string> = {};
  return {
    box,
    getItem: (k) => box[k] ?? null,
    setItem: (k, v) => {
      box[k] = v;
    },
    removeItem: (k) => {
      delete box[k];
    },
  };
}

const RECIPE = { ...defaultRecipe("grass", 42), scale: 33 };

describe("recipeKey", () => {
  it("на карту свой ключ, без карты — общий", () => {
    expect(recipeKey("map-7")).toBe("zonegen:recipe:map-7");
    expect(recipeKey(undefined)).toBe("zonegen:recipe:current");
  });
});

describe("saveRecipe / loadRecipe", () => {
  it("возвращает сохранённый рецепт той же карты", () => {
    const s = fakeStore();
    saveRecipe("map-7", RECIPE, 1000, s);
    expect(loadRecipe("map-7", 2000, s)?.scale).toBe(33);
    // Чужая карта своего рецепта ещё не видела.
    expect(loadRecipe("map-8", 2000, s)).toBeNull();
  });

  it("через неделю рецепт протухает", () => {
    const s = fakeStore();
    saveRecipe("map-7", RECIPE, 0, s);
    expect(loadRecipe("map-7", RECIPE_TTL_MS - 1, s)).not.toBeNull();
    expect(loadRecipe("map-7", RECIPE_TTL_MS + 1, s)).toBeNull();
  });

  it("мусор и битый JSON читаются как «ничего не сохранено»", () => {
    const s = fakeStore();
    s.setItem(recipeKey("map-7"), "{не json");
    expect(loadRecipe("map-7", 1, s)).toBeNull();
    s.setItem(recipeKey("map-7"), JSON.stringify({ at: 1, recipe: { scale: "много" } }));
    expect(loadRecipe("map-7", 1, s)).toBeNull();
  });

  it("запись прошлой версии читается: новые ручки берут значения по умолчанию", () => {
    const s = fakeStore();
    const { warp, settlement, ...old } = RECIPE;
    void warp;
    void settlement;
    s.setItem(recipeKey("map-7"), JSON.stringify({ at: 1, recipe: old }));
    const back = loadRecipe("map-7", 2, s);
    expect(back?.warp).toBe(defaultRecipe("grass").warp);
    expect(back?.settlement.enabled).toBe(false);
  });

  it("старый состав поселения выносит только себя, а не весь рецепт", () => {
    // 22.09.2026: строки состава переехали с «вес + потолок» на «сколько штук».
    // Запись прошлой недели схеме не отвечает — но местность, масштаб и сид
    // админ подбирал ползунками, и терять их из-за блока поселений незачем.
    const s = fakeStore();
    const stale = {
      ...RECIPE,
      settlement: {
        ...RECIPE.settlement,
        slots: [{ buildingId: "b_hall", weight: 40, max: 2 }],
      },
    };
    s.setItem(recipeKey("map-7"), JSON.stringify({ at: 1, recipe: stale }));
    const back = loadRecipe("map-7", 2, s);
    expect(back?.scale).toBe(33);
    expect(back?.settlement.slots).toEqual([]);
    expect(back?.settlement.enabled).toBe(false);
  });

  it("недоступная локалка не роняет ни чтение, ни запись", () => {
    expect(loadRecipe("map-7", 1, null)).toBeNull();
    expect(() => saveRecipe("map-7", RECIPE, 1, null)).not.toThrow();
    const broken: MiniStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    };
    expect(loadRecipe("map-7", 1, broken)).toBeNull();
    expect(() => saveRecipe("map-7", RECIPE, 1, broken)).not.toThrow();
  });
});
