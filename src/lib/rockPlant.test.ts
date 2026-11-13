// Камни и горы для установки (владелец, 25.10.2026; lib/treePlant): стопка
// rock:<шаблон>, тот же путь, что у дерева, и свои слова в окне и отказах.
import { describe, expect, it } from "vitest";
import {
  isRockStackKey,
  isTreeStackKey,
  plantOfStack,
  plantStackKey,
  plantTextKey,
  treeIdOfStack,
} from "./treePlant";
import { isPlantKind } from "./marketItem";

describe("стопка камня", () => {
  it("rock:<шаблон> туда и обратно, ставится тем же путём, что дерево", () => {
    const key = plantStackKey("rock", "decoration_nVZxWlASdo");
    expect(key).toBe("rock:decoration_nVZxWlASdo");
    expect(plantOfStack(key)).toEqual({ kind: "rock", decorId: "decoration_nVZxWlASdo" });
    expect(treeIdOfStack(key)).toBe("decoration_nVZxWlASdo");
    expect(isTreeStackKey(key)).toBe(true);
    expect(isRockStackKey(key)).toBe(true);
    expect(isRockStackKey("tree:decoration_oak")).toBe(false);
  });

  it("мусор и чужие ключи — не камень", () => {
    for (const bad of ["rock:", "rock:cst_x", "rock:decoration_a'b", "custom:cst_x", null]) {
      expect(plantOfStack(bad), String(bad)).toBeNull();
      expect(isRockStackKey(bad), String(bad)).toBe(false);
    }
  });

  it("вид товара лавки", () => {
    expect(isPlantKind("rock")).toBe(true);
    expect(isPlantKind("tree")).toBe(true);
    expect(isPlantKind("custom")).toBe(false);
  });
});

describe("слова окна и отказов", () => {
  const rock = "rock:decoration_nVZxWlASdo";
  it("у камня свои: заголовок, цена, успех, дорога, вода, рюкзак, шаблон, остров", () => {
    expect(plantTextKey("tree.plant_title", rock)).toBe("rock.plant_title");
    expect(plantTextKey("tree.road", rock)).toBe("rock.road");
    expect(plantTextKey("tree.gone_kind", rock)).toBe("rock.gone_kind");
  });
  it("общие (занято, игрок, мешочек) и у дерева — как есть", () => {
    expect(plantTextKey("tree.busy", rock)).toBe("tree.busy");
    expect(plantTextKey('mineplace.no_energy|{"need":15}', rock)).toBe(
      'mineplace.no_energy|{"need":15}',
    );
    expect(plantTextKey("tree.road", "tree:decoration_oak")).toBe("tree.road");
  });
});
