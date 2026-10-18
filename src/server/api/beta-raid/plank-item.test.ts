// Вид доски — один на разборку, починку и рюкзак. Базы нет: справочник
// подменён заглушкой, чтобы проверить и путь «шаблон найден», и путь
// «справочник не читается» — второй раньше давал refId=null и стек 'custom:'.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  templates: [] as Array<{ id: string; name: string }>,
  fail: false,
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (state.fail) throw new Error("bridge down");
    if (sql.includes("raid_custom_item")) return state.templates;
    return [];
  },
}));

import { invalidateAliases } from "./item-alias";
import {
  PLANK_NAME,
  PLANK_TEMPLATE_FALLBACK,
  plankItem,
  plankRefId,
  plankStackKey,
} from "./plank-item";

beforeEach(() => {
  invalidateAliases();
  state.templates = [];
  state.fail = false;
});

describe("plankRefId", () => {
  it("шаблон из справочника — по основе имени («Доски» тоже подходит)", async () => {
    state.templates = [
      { id: "cst_apple", name: "Яблоко" },
      { id: "cst_boards", name: "Доски" },
    ];
    expect(await plankRefId()).toBe("cst_boards");
    expect(await plankStackKey()).toBe("custom:cst_boards");
  });

  it("справочник пуст — константа, ключ не 'custom:'", async () => {
    expect(await plankRefId()).toBe(PLANK_TEMPLATE_FALLBACK);
    expect(await plankStackKey()).toBe(`custom:${PLANK_TEMPLATE_FALLBACK}`);
  });

  it("мост упал — константа, а не null", async () => {
    state.fail = true;
    expect(await plankRefId()).toBe(PLANK_TEMPLATE_FALLBACK);
    expect(await plankStackKey()).not.toBe("custom:");
  });
});

describe("plankItem", () => {
  it("id и refId — один и тот же шаблон, имя — «Доска»", async () => {
    state.templates = [{ id: "cst_boards", name: "Доска" }];
    const item = await plankItem();
    expect(item.id).toBe("cst_boards");
    expect(item.refId).toBe(item.id);
    expect(item.kind).toBe("custom");
    expect(item.name).toBe(PLANK_NAME);
    expect(item.image).toMatch(/^\/resources\//);
  });
});
