// Правила посадки деревьев (lib/treePlant): ключ стопки, что считается
// срубаемым деревом, имя на языке игрока и вердикт клетки — кучке можно, всему
// прочему, что стоит на клетке, нельзя.
import { describe, expect, it } from "vitest";
import {
  TREE_PLANT_ENERGY,
  isChoppableInteract,
  isTreeStackKey,
  treeCellVerdict,
  treeIdOfStack,
  treeNameOr,
  treeStackKey,
} from "./treePlant";

const chop = (label: unknown, extra: Record<string, unknown> = {}) => ({
  on: true,
  cost: 1,
  itemId: "cst_wood",
  amount: "1-2",
  toolItemIds: ["cst_axe"],
  respawnMin: 15,
  label,
  ...extra,
});

describe("ключ стопки дерева", () => {
  it("tree:<шаблон> туда и обратно; чужие и мусорные ключи — не дерево", () => {
    expect(treeStackKey("decoration_wnfmRe6dly")).toBe("tree:decoration_wnfmRe6dly");
    expect(treeIdOfStack("tree:decoration__3pmVmcZ3H")).toBe("decoration__3pmVmcZ3H");
    expect(treeIdOfStack("tree:decoration_DmliXWfza-")).toBe("decoration_DmliXWfza-");
    for (const bad of [
      "custom:cst_x",
      "tree:",
      "tree:cst_x",
      "tree:decoration_a'b",
      null,
      undefined,
    ]) {
      expect(treeIdOfStack(bad), String(bad)).toBeNull();
      expect(isTreeStackKey(bad), String(bad)).toBe(false);
    }
  });

  it("посадка стоит 15 энергии (слово владельца)", () => {
    expect(TREE_PLANT_ENERGY).toBe(15);
  });
});

describe("срубаемое дерево", () => {
  it("взаимодействие включено и надпись «Срубить» или «Chop»", () => {
    expect(isChoppableInteract(chop({ ru: "Срубить", en: "Chop" }))).toBe(true);
    expect(isChoppableInteract(chop({ ru: "Срубить" }))).toBe(true);
    expect(isChoppableInteract(chop({ en: "chop" }))).toBe(true);
  });

  it("горы, камни, «Выжать», без надписи, выключенное и недонастроенное — не дерево", () => {
    expect(isChoppableInteract(chop({ ru: "Добыть", en: "Mine" }))).toBe(false);
    expect(isChoppableInteract(chop({ ru: "Выжать", en: "Squeeze out" }))).toBe(false);
    expect(isChoppableInteract(chop(null))).toBe(false);
    expect(isChoppableInteract(chop({ ru: "Срубить" }, { on: false }))).toBe(false);
    expect(isChoppableInteract(chop({ ru: "Срубить" }, { itemId: "" }))).toBe(false);
    expect(isChoppableInteract(null)).toBe(false);
  });
});

describe("имя стопки", () => {
  it("дерево — переводом имени шаблона, прочее — как есть", () => {
    expect(treeNameOr("tree:decoration_wnfmRe6dly", "Дуб", "en")).toBe("Oak");
    expect(treeNameOr("tree:decoration_wnfmRe6dly", "Дуб", "ru")).toBe("Дуб");
    expect(treeNameOr("tree:decoration_ULRQzgZR0G", "Яблоня", "en")).toBe("Apple Tree");
    expect(treeNameOr("custom:cst_x", "Дуб", "en")).toBe("Дуб");
  });
});

describe("клетка под дерево", () => {
  const empty = {
    building: false,
    obj: false,
    water: false,
    dome: false,
    guard: false,
    decor: false,
    ship: false,
    road: false,
    taken: false,
    player: false,
    stand_chest: false,
    ground_bag: false,
  };

  it("пустая клетка — можно", () => {
    expect(treeCellVerdict(empty)).toBeNull();
  });

  it("кучка (закопанный сундук или мешочек) — можно: её признаки не держат", () => {
    // chest/bag из базы — любые, вместе с бугорками; дерево смотрит только на стоящие.
    expect(treeCellVerdict({ ...empty, chest: true, bag: true } as typeof empty)).toBeNull();
  });

  it("здание, постройка, объект, декор, блок, купол, охрана, судно, стоящий сундук — занято", () => {
    for (const k of [
      "building",
      "obj",
      "dome",
      "guard",
      "decor",
      "ship",
      "taken",
      "stand_chest",
    ] as const) {
      expect(treeCellVerdict({ ...empty, [k]: true }), k).toBe("tree.busy");
    }
  });

  it("дорога, вода, игрок, мешочек на земле — свои отказы; клетки нет — занято", () => {
    expect(treeCellVerdict({ ...empty, road: true })).toBe("tree.road");
    expect(treeCellVerdict({ ...empty, water: true })).toBe("tree.water");
    expect(treeCellVerdict({ ...empty, player: true })).toBe("tree.player");
    expect(treeCellVerdict({ ...empty, ground_bag: true })).toBe("tree.bag");
    expect(treeCellVerdict(null)).toBe("tree.busy");
  });
});
