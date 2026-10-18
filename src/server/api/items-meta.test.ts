// Снимок meta со страницы админки не откатывает взаимодействие декора.
import { describe, expect, it, vi } from "vitest";

vi.mock("../db/pg", () => ({ pg: { mysticItemTemplates: { findOne: async () => null } } }));

import { mergeDecorInteract } from "./items-meta";

describe("mergeDecorInteract", () => {
  it("interact берётся из базы, остальное — со страницы", () => {
    const db = { interact: { on: true, toolItemId: "cst_axe", label: { ru: "Срубить" } }, level: 1 };
    const page = { interact: { on: false }, level: 3, battleBgUrl: "x.png" };
    expect(mergeDecorInteract(db, page)).toEqual({
      level: 3,
      battleBgUrl: "x.png",
      interact: { on: true, toolItemId: "cst_axe", label: { ru: "Срубить" } },
    });
  });

  it("в базе взаимодействия нет — устаревший снимок его не возвращает", () => {
    expect(mergeDecorInteract({ level: 1 }, { interact: { on: true }, level: 2 })).toEqual({ level: 2 });
  });

  it("пустая или битая meta в базе — просто meta со страницы без interact", () => {
    expect(mergeDecorInteract(null, { interact: { on: true }, a: 1 })).toEqual({ a: 1 });
    expect(mergeDecorInteract("oops", { a: 1 })).toEqual({ a: 1 });
  });
});
