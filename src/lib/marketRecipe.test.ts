// Рецепт лавки (владелец, 04.11.2026; ПРАВИЛА §8.104): доли — ровно 100 %,
// «Ничего» своей строкой, мусор отсеивается, бросок — по отрезкам.
import { describe, expect, it } from "vitest";
import {
  addRecipeOutcome,
  parseRecipe,
  pickRecipe,
  recipeCover,
  recipeHasPrize,
  removeRecipeOutcome,
  setRecipePct,
  type RecipeOutcome,
} from "./marketRecipe";

/** Пример Ярослава: 50 яблоко / 10 алмазное яблоко / 1 10 алмазов / 29 пепел / 10 ничего. */
const YAR: RecipeOutcome[] = [
  {
    id: "o_apple",
    kind: "custom",
    refId: "cst_apple",
    amount: 1,
    name: "Яблоко",
    image: null,
    pct: 50,
  },
  {
    id: "o_dapple",
    kind: "custom",
    refId: "cst_dapple",
    amount: 1,
    name: "Алмазное яблоко",
    image: null,
    pct: 10,
  },
  {
    id: "o_dia",
    kind: "resource",
    refId: "diamonds",
    amount: 10,
    name: "Алмазы",
    image: null,
    pct: 1,
  },
  { id: "o_ash", kind: "custom", refId: "cst_ash", amount: 1, name: "Пепел", image: null, pct: 29 },
  { id: "o_none", kind: "none", refId: null, amount: 1, name: "", image: null, pct: 10 },
];

const sum = (l: RecipeOutcome[]) => Math.round(l.reduce((s, o) => s + o.pct, 0) * 10) / 10;

describe("marketRecipe", () => {
  it("пример Ярослава читается как есть: сумма 100", () => {
    const l = parseRecipe(YAR);
    expect(l.map((o) => o.pct)).toEqual([50, 10, 1, 29, 10]);
    expect(sum(l)).toBe(100);
    expect(recipeHasPrize(l)).toBe(true);
  });

  it("доли не в сумме 100 — сводятся пропорционально", () => {
    const l = parseRecipe([
      { ...YAR[0], pct: 3 },
      { ...YAR[3], pct: 1 },
    ]);
    expect(l.map((o) => o.pct)).toEqual([75, 25]);
  });

  it("мусор отсеивается: битый вид, ресурс не из списка, USDT, дробь у предмета, повтор", () => {
    const l = parseRecipe([
      YAR[0],
      { ...YAR[0] }, // повтор id
      { id: "o_bad", kind: "chip", refId: "x", amount: 1, name: "", image: null, pct: 5 },
      { id: "o_tok", kind: "resource", refId: "token", amount: 1, name: "", image: null, pct: 5 },
      { id: "o_tic", kind: "resource", refId: "tickets", amount: 1, name: "", image: null, pct: 5 },
      { id: "o_half", kind: "custom", refId: "cst_x", amount: 0.5, name: "", image: null, pct: 5 },
      { id: "bad id", kind: "custom", refId: "cst_x", amount: 1, name: "", image: null, pct: 5 },
    ]);
    expect(l.map((o) => o.id)).toEqual(["o_apple"]);
    expect(l[0].pct).toBe(100);
  });

  it("ресурс бывает дробным, предмет — целым вниз", () => {
    const l = parseRecipe([
      { ...YAR[2], amount: 0.5 },
      { ...YAR[0], amount: 2.9 },
    ]);
    expect(l.map((o) => o.amount)).toEqual([0.5, 2]);
  });

  it("одно «Ничего» — продавать нечего", () => {
    expect(recipeHasPrize(parseRecipe([YAR[4]]))).toBe(false);
    expect(parseRecipe("не json")).toEqual([]);
  });

  it("поднял одному — остальные ужались, сумма 100", () => {
    const l = setRecipePct(parseRecipe(YAR), "o_dia", 21);
    expect(l.find((o) => o.id === "o_dia")?.pct).toBe(21);
    expect(sum(l)).toBe(100);
  });

  it("добавил — потеснились все; убрал — доля разошлась", () => {
    const two = addRecipeOutcome(
      addRecipeOutcome([], { kind: "custom", refId: "cst_a", amount: 1, name: "A", image: null }),
      {
        kind: "none",
        refId: null,
        amount: 1,
        name: "",
        image: null,
      },
    );
    expect(two.map((o) => o.pct)).toEqual([50, 50]);
    const one = removeRecipeOutcome(two, two[1].id);
    expect(one.map((o) => o.pct)).toEqual([100]);
  });

  it("бросок по отрезкам: 0–499 яблоко, 500–599 алм. яблоко, 600–609 алмазы, 610–899 пепел, 900–999 ничего", () => {
    const l = parseRecipe(YAR);
    expect(pickRecipe(l, 0)?.id).toBe("o_apple");
    expect(pickRecipe(l, 499)?.id).toBe("o_apple");
    expect(pickRecipe(l, 500)?.id).toBe("o_dapple");
    expect(pickRecipe(l, 609)?.id).toBe("o_dia");
    expect(pickRecipe(l, 610)?.id).toBe("o_ash");
    expect(pickRecipe(l, 999)?.id).toBe("o_none");
  });
});

describe("картинка рецепта без своей (04.11.2026)", () => {
  const o = (id: string, kind: RecipeOutcome["kind"], pct: number, image: string | null, refId: string | null = "x") =>
    ({ id, kind, refId, amount: 1, name: id, image, pct }) as RecipeOutcome;

  it("самый вероятный приз с картинкой; «Ничего» не в счёт", () => {
    expect(recipeCover([o("o_a", "none", 60, null, null), o("o_b", "custom", 30, "b.webp"), o("o_c", "custom", 10, "c.webp")])).toBe("b.webp");
    expect(recipeCover([o("o_b", "custom", 30, null), o("o_c", "custom", 10, "c.webp")])).toBe("c.webp");
  });

  it("ресурс без картинки — иконка ресурса; пусто — null", () => {
    expect(recipeCover([o("o_g", "resource", 50, null, "gold")])).toMatch(/gold|coin/i);
    expect(recipeCover([])).toBeNull();
    expect(recipeCover(null)).toBeNull();
  });
});
