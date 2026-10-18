// ИИ отвечает «как получится»: JSON в ```-заборе, фраза сверху, выдуманные
// местности. Парсер обязан вытащить рецепт из любого такого ответа и
// отказать только когда красить нечем.
import { describe, expect, it } from "vitest";
import { parseAiRecipe } from "./ai-recipe-parse";

const KNOWN = ["t_forest", "t_water", "t_sand"];

describe("parseAiRecipe", () => {
  it("JSON в ```json-заборе разбирается, дефолты подставляются", () => {
    const out = parseAiRecipe(
      '```json\n{"layers":[{"terrainId":"t_forest","weight":70},{"terrainId":"t_water","weight":30}],"note":"Лес у воды"}\n```',
      KNOWN,
    );
    expect(out.recipe.layers).toEqual([
      { terrainId: "t_forest", weight: 70 },
      { terrainId: "t_water", weight: 30 },
    ]);
    expect(out.recipe).toMatchObject({
      scale: 12,
      decorRate: 1,
      decorStrict: true,
      smallSingle: 12,
    });
    expect(out.note).toBe("Лес у воды");
    expect("seed" in out.recipe).toBe(false);
  });

  it("лишний текст вокруг объекта не мешает", () => {
    const out = parseAiRecipe(
      'Вот рецепт:\n{"layers":[{"terrainId":"t_sand","weight":100}],"scale":30,"decorRate":0.5,"decorStrict":false,"smallSingle":20}\nУдачи!',
      KNOWN,
    );
    expect(out.recipe.layers).toEqual([{ terrainId: "t_sand", weight: 100 }]);
    expect(out.recipe).toMatchObject({
      scale: 30,
      decorRate: 0.5,
      decorStrict: false,
      smallSingle: 20,
    });
    expect(out.note).toBe("");
  });

  it("слой с неизвестным terrainId выбрасывается, остальные остаются", () => {
    const out = parseAiRecipe(
      '{"layers":[{"terrainId":"t_lava","weight":50},{"terrainId":"t_forest","weight":50}]}',
      KNOWN,
    );
    expect(out.recipe.layers).toEqual([{ terrainId: "t_forest", weight: 50 }]);
  });

  it("вес за пределами 0..100 и строкой — зажимается, а не роняет рецепт", () => {
    const out = parseAiRecipe(
      '{"layers":[{"terrainId":"t_forest","weight":"140"},{"terrainId":"t_water","weight":-5}],"scale":500,"smallSingle":7.6}',
      KNOWN,
    );
    expect(out.recipe.layers).toEqual([
      { terrainId: "t_forest", weight: 100 },
      { terrainId: "t_water", weight: 0 },
    ]);
    expect(out.recipe.scale).toBe(80);
    expect(out.recipe.smallSingle).toBe(8);
  });

  it("ни одной известной местности → ошибка", () => {
    expect(() => parseAiRecipe('{"layers":[{"terrainId":"t_lava","weight":100}]}', KNOWN)).toThrow(
      /ни одной местности/,
    );
    expect(() => parseAiRecipe('{"layers":[]}', KNOWN)).toThrow(/ни одной местности/);
  });

  it("совсем не JSON → ошибка, а не падение парсера", () => {
    expect(() => parseAiRecipe("Не могу помочь.", KNOWN)).toThrow(/не JSON/);
    expect(() => parseAiRecipe("{oops", KNOWN)).toThrow(/JSON/);
  });

  it("note длиннее 300 символов режется, а не отклоняется", () => {
    const out = parseAiRecipe(
      `{"layers":[{"terrainId":"t_forest","weight":100}],"note":"${"я".repeat(400)}"}`,
      KNOWN,
    );
    expect(out.note).toHaveLength(300);
  });
});
