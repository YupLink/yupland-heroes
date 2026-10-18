// Канон вида товара без базы: справочник и связки подменены заглушкой.
//
// Жалоба 20.09: «Доска» лежала в рюкзаках тремя стеками. Корень — пустой ref
// у доски с разборки/склада: canonRef выходил, не заглянув в справочник, и
// ключ получался 'custom:'. Здесь проверяем, что пустой ref сводится по имени,
// а ключ без хвоста больше не рождается.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  aliases: [] as Array<{ kind: string; fromRef: string; toRef: string }>,
  templates: [] as Array<{ id: string; name: string }>,
  fail: false,
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (state.fail) throw new Error("bridge down");
    if (sql.includes("item_alias")) return state.aliases;
    if (sql.includes("raid_custom_item")) return state.templates;
    return [];
  },
}));

import {
  canonRef,
  canonStackKey,
  invalidateAliases,
  nameStem,
  refFromStackKey,
  stackKeyFor,
} from "./item-alias";

const PLANK = "cst_plank";

beforeEach(() => {
  // Кэш справочника живёт минуту — между тестами его надо сбрасывать, иначе
  // кейс «мост упал» получит карту имён от предыдущего теста.
  invalidateAliases();
  state.aliases = [];
  state.templates = [{ id: PLANK, name: "Доска" }];
  state.fail = false;
});

describe("nameStem", () => {
  it("«Доска» и «Доски» — одна основа", () => {
    expect(nameStem("Доска")).toBe(nameStem("Доски"));
    expect(nameStem("ДОСКА ")).toBe(nameStem("доски"));
  });
});

describe("canonRef: пустой ref", () => {
  it("сводится по имени к шаблону справочника", async () => {
    expect(await canonRef("custom", null, "Доска")).toBe(PLANK);
    expect(await canonRef("custom", "", "Доски")).toBe(PLANK);
  });

  it("без имени и без ref — как есть (null)", async () => {
    expect(await canonRef("custom", null)).toBeNull();
  });

  it("не свой товар по имени не ищем", async () => {
    expect(await canonRef("boss", null, "Доска")).toBeNull();
  });

  it("ключ стека с пустым ref больше не 'custom:'", async () => {
    expect(await canonStackKey("custom", "", "Доска")).toBe(`custom:${PLANK}`);
  });
});

describe("canonRef: прежнее поведение", () => {
  it("сирота витрины (mkt_*) сводится по имени", async () => {
    expect(await canonRef("custom", "mkt_x", "Доски")).toBe(PLANK);
  });

  it("явная связка сильнее имени", async () => {
    state.aliases = [{ kind: "custom", fromRef: "cst_old", toRef: "cst_new" }];
    expect(await canonRef("custom", "cst_old", "Доска")).toBe("cst_new");
  });

  it("найденный по имени шаблон доводится связкой до нового", async () => {
    state.aliases = [{ kind: "custom", fromRef: PLANK, toRef: "cst_plank2" }];
    expect(await canonRef("custom", null, "Доска")).toBe("cst_plank2");
  });

  it("шаблон справочника без связки — как есть", async () => {
    expect(await canonRef("custom", "cst_other", "Доска")).toBe("cst_other");
  });
});

describe("refFromStackKey", () => {
  it("хвост ключа — ref вида", () => {
    expect(refFromStackKey("custom:mkt_x")).toBe("mkt_x");
    expect(refFromStackKey("resource:token:USDT")).toBe("token:USDT");
  });

  it("пустой хвост — null", () => {
    expect(refFromStackKey("custom:")).toBeNull();
    expect(refFromStackKey("custom")).toBeNull();
  });
});

describe("stackKeyFor", () => {
  it("товар с ref — канон", async () => {
    expect(await stackKeyFor({ kind: "custom", refId: PLANK, name: "Доска" })).toBe(
      `custom:${PLANK}`,
    );
  });

  it("доска без ref (разборка/склад) — тот же ключ, что у маркета", async () => {
    expect(await stackKeyFor({ kind: "custom", refId: null, name: "Доска" })).toBe(
      `custom:${PLANK}`,
    );
  });

  it("сирота витрины без шаблона возвращается своим ключом (полка склада)", async () => {
    // Полка 'custom:mkt_pc7…' («Вековое дерево», шаблона нет) должна вернуться
    // в рюкзак тем же ключом, а не 'custom:' — и не отказом.
    expect(
      await stackKeyFor({ id: "mkt_pc7", kind: "custom", refId: null, name: "Вековое дерево" }),
    ).toBe("custom:mkt_pc7");
  });

  it("товар без вида — отказ, а не стек 'custom:'", async () => {
    await expect(stackKeyFor({ kind: "custom", refId: null, name: "Нечто" })).rejects.toThrow(
      "market.bad_item",
    );
    await expect(stackKeyFor({ kind: "custom", refId: "", name: "" })).rejects.toThrow(
      "market.bad_item",
    );
  });
});
