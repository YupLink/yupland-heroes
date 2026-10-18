// Надпись действия (29.09) доезжает до игрока в том же списке, что цена и
// инструмент (getInteractiveDecor → плашка маршрута и окно рубки). Отдельного
// запроса у неё нет: пропади она из списка — игрок молча увидит «Уничтожить».
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (!sql.includes("meta->'interact' AS interact")) return [];
    const base = { on: true, cost: 3, itemId: "cst_wood", amount: "2" };
    const row = (id: string, interact: object) => ({
      id,
      name: id,
      interact,
      item_name: "Дерево",
      item_image: null,
      tools: null,
    });
    return [
      row("decoration_pine", { ...base, label: { ru: "  Срубить ", en: "Chop" } }),
      row("decoration_old", base),
    ];
  },
}));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "w1" }));
vi.mock("../../rateGate", () => ({ actionGate: async () => {} }));
vi.mock("./encounter-where", () => ({
  myMapId: async () => "map1",
  playerCell: async () => ({ q: 0, r: 0 }),
  requireAdjacent: () => {},
}));
vi.mock("./voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));

const mod = await import("./decor-interact");

describe("список декора для игрока — надпись действия", () => {
  it("надпись шаблона едет в ответе очищенной; настройка без неё — без поля", async () => {
    mod.dropInteractiveDecorCache();
    const list = await mod.loadInteractiveDecor();
    expect(list.decoration_pine.label).toEqual({ ru: "Срубить", en: "Chop" });
    expect(list.decoration_old).not.toHaveProperty("label");
  });
});
