// Скупка: какой выбор игрока сервер готов принять. Износ решает позиция, а не
// клиент: изношенные и сломанные берёт только ломбард «Любой … артефакт»
// (владелец, 23.10.2026: «ломбард чинит арты»), копий героя — сколько выбрано.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => [] }));

const { sellInput, sellSpendPick } = await import("./market-sell-input");

const base = { q: 1, r: 2, itemId: "mkt_1" };
const pawnArt = { side: "sell", kind: "art", refId: "art_any_common" } as const;

describe("sellInput", () => {
  it("принимает список копий героя и износ группы; старый одиночный id — тоже", () => {
    const d = sellInput({
      ...base,
      qty: 2,
      pick: { templateId: "hero_A", heroItemIds: ["ugi_1", "ugi_2"], wear: 37.5 },
    });
    expect(d.pick).toEqual({ templateId: "hero_A", heroItemIds: ["ugi_1", "ugi_2"], wear: 37.5 });
    expect(sellInput({ ...base, pick: { templateId: "t", heroItemId: "ugi_1" } }).pick).toEqual({
      templateId: "t",
      heroItemId: "ugi_1",
    });
  });

  it("мусор отсекается: износ вне 0…100, пустой список копий, сверх капа", () => {
    expect(() => sellInput({ ...base, pick: { templateId: "t", wear: 101 } })).toThrow();
    expect(() => sellInput({ ...base, pick: { templateId: "t", wear: -1 } })).toThrow();
    expect(() => sellInput({ ...base, pick: { templateId: "t", heroItemIds: [] } })).toThrow();
    const many = Array.from({ length: 1000 }, (_, i) => `ugi_${i}`);
    expect(() => sellInput({ ...base, pick: { templateId: "t", heroItemIds: many } })).toThrow();
  });

  it("группы артефактов: целые штуки > 0, износ 0…100, не пусто и не сверх капа", () => {
    const art = (o: Record<string, unknown>) =>
      sellInput({
        ...base,
        pick: { templateId: "t", arts: [{ templateId: "t", count: 1, ...o }] },
      });
    expect(art({}).pick?.arts).toEqual([{ templateId: "t", count: 1 }]);
    expect(() => art({ count: 0 })).toThrow();
    expect(() => art({ count: 1.5 })).toThrow();
    expect(() => art({ wear: 101 })).toThrow();
    expect(() => art({ templateId: "" })).toThrow();
    expect(() => sellInput({ ...base, pick: { templateId: "t", arts: [] } })).toThrow();
    const many = Array.from({ length: 1000 }, (_, i) => ({ templateId: `t${i}`, count: 1 }));
    expect(() => sellInput({ ...base, pick: { templateId: "t", arts: many } })).toThrow();
  });
});

describe("sellSpendPick", () => {
  it("ломбард «Любой … артефакт» снимает ровно выбранную группу износа", () => {
    expect(sellSpendPick(pawnArt, { templateId: "tpl_a", wear: 100 })).toEqual({
      artTemplateId: "tpl_a",
      heroItemId: null,
      heroItemIds: null,
      artWear: 100,
      artGroups: null,
    });
    // Без износа (целый или старый клиент) — целые, как было.
    expect(sellSpendPick(pawnArt, { templateId: "tpl_a" }).artWear).toBe(0);
  });

  it("любая другая скупка — только целые, что бы ни прислали", () => {
    const pick = { templateId: "tpl_a", wear: 62.5 };
    expect(sellSpendPick({ ...pawnArt, refId: "tpl_a" }, pick).artWear).toBe(0);
    expect(sellSpendPick({ ...pawnArt, side: "buy" }, pick).artWear).toBe(0);
    expect(
      sellSpendPick({ side: "sell", kind: "hero", refId: "hero_any_rare" }, pick).artWear,
    ).toBe(0);
  });

  it("копии героя едут как выбраны; нет выбора — пусто", () => {
    const hero = { side: "sell", kind: "hero", refId: "hero_any_rare" } as const;
    expect(
      sellSpendPick(hero, { templateId: "hero_A", heroItemIds: ["ugi_1", "ugi_2"] }).heroItemIds,
    ).toEqual(["ugi_1", "ugi_2"]);
    expect(sellSpendPick(hero, undefined)).toEqual({
      artTemplateId: null,
      heroItemId: null,
      heroItemIds: null,
      artWear: 0,
      artGroups: null,
    });
  });

  it("несколько артефактов ломбарда — группы со своим износом; целый без износа — 0", () => {
    const pick = sellInput({
      ...base,
      qty: 3,
      pick: {
        templateId: "tpl_a",
        arts: [
          { templateId: "tpl_a", wear: 100, count: 2 },
          { templateId: "tpl_b", count: 1 },
        ],
      },
    }).pick;
    expect(sellSpendPick(pawnArt, pick).artGroups).toEqual([
      { templateId: "tpl_a", wear: 100, count: 2 },
      { templateId: "tpl_b", wear: 0, count: 1 },
    ]);
  });

  it("перечень артефактов у любой другой позиции отбрасывается", () => {
    const pick = { templateId: "tpl_a", arts: [{ templateId: "tpl_a", wear: 50, count: 2 }] };
    expect(sellSpendPick({ ...pawnArt, refId: "tpl_a" }, pick).artGroups).toBeNull();
    expect(sellSpendPick({ ...pawnArt, side: "buy" }, pick).artGroups).toBeNull();
    const hero = { side: "sell", kind: "hero", refId: "hero_any_rare" } as const;
    expect(sellSpendPick(hero, pick).artGroups).toBeNull();
  });
});
