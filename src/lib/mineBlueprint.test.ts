// Заготовки шахт: вид ↔ товар однозначны, ключ стопки рюкзака узнаётся.
import { describe, expect, it } from "vitest";
import {
  BLUEPRINT_RESOURCES,
  MINE_BLUEPRINT_ITEM,
  blueprintLabel,
  mineBlueprintOf,
} from "./mineBlueprint";

describe("mineBlueprint", () => {
  it("по товару и по ключу стопки — тот же вид", () => {
    for (const kind of BLUEPRINT_RESOURCES) {
      const id = MINE_BLUEPRINT_ITEM[kind];
      expect(id).toMatch(/^cst_mine_bp_/);
      expect(mineBlueprintOf(id)).toBe(kind);
      expect(mineBlueprintOf(`custom:${id}`)).toBe(kind);
    }
  });

  it("у каждого вида свой товар", () => {
    expect(new Set(Object.values(MINE_BLUEPRINT_ITEM)).size).toBe(BLUEPRINT_RESOURCES.length);
  });

  it("не заготовка — null", () => {
    expect(mineBlueprintOf(null)).toBeNull();
    expect(mineBlueprintOf("")).toBeNull();
    expect(mineBlueprintOf("custom:cst_q6xybslab2cd")).toBeNull();
    expect(mineBlueprintOf("boss:cst_mine_bp_wood")).toBeNull();
    expect(mineBlueprintOf("cst_mine_bp_iron")).toBeNull();
  });

  it("подписи ru и en", () => {
    expect(blueprintLabel("wood", true)).toBe("Лесопилка");
    expect(blueprintLabel("diamonds", false)).toBe("Diamond mine");
  });
});
