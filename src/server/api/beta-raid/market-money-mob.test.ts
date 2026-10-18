// Откат оплаты товаром не превращает добычу с мобов в покупку: spend отдаёт
// снимок списания в квитанции, credit возвращает его mobTaken.
import { beforeEach, describe, expect, it, vi } from "vitest";

const takeStack = vi.fn();
const returnStack = vi.fn();
vi.mock("@/server/db/pg", () => ({ sb: {} }));
vi.mock("@/server/api/heroes-shared", () => ({}));
vi.mock("@/server/api/tickets-ledger", () => ({}));
vi.mock("@/server/api/currency/spend", () => ({}));
vi.mock("@/server/api/currency/pay-darai-map", () => ({ DARAI_TOKEN: "darai" }));
vi.mock("@/server/api/raid-helpers", () => ({}));
vi.mock("@/server/api/energy-credit", () => ({}));
vi.mock("@/server/api/currency/move", () => ({}));
vi.mock("@/server/api/beta-raid/market-art-pay", () => ({}));
vi.mock("@/server/api/beta-raid/econ/energy-note", () => ({}));
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  canonStackKey: async (kind: string, ref: string) => `${kind}:${ref}`,
  canonCustomMeta: async (ref: string) => ({ name: `имя ${ref}`, image: `/img/${ref}.webp` }),
}));
/** Выбранный герой: тест меняет его между оплатой и откатом. */
const selected = vi.hoisted(() => ({ heroId: "h1" }));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: selected.heroId }),
  takeFromBackpackStack: (...a: unknown[]) => takeStack(...a),
  returnToBackpackStack: (...a: unknown[]) => returnStack(...a),
}));

import { credit, spend } from "@/server/api/beta-raid/market-money";

describe("оплата товаром из рюкзака", () => {
  beforeEach(() => {
    takeStack.mockReset();
    returnStack.mockReset();
    selected.heroId = "h1";
  });

  it("откат возвращает штуки «с мобов» по квитанции", async () => {
    takeStack.mockResolvedValueOnce({
      kind: "custom",
      refId: "cst_a",
      name: "Банан",
      image: null,
      mobTaken: 5,
    });
    const receipt = await spend("w1", "acc1", "custom", "cst_a", 5, "pay:1");
    expect(receipt.backpack?.mobTaken).toBe(5);
    await credit("w1", "acc1", "custom", "cst_a", 5, "pay:1:undo", receipt);
    expect(returnStack).toHaveBeenCalledWith(
      "h1",
      "custom:cst_a",
      5,
      expect.objectContaining({ mobTaken: 5 }),
      "acc1",
    );
  });

  it("откат возвращает и метки шахт и грядок (ПРАВИЛА §8.18)", async () => {
    takeStack.mockResolvedValueOnce({
      kind: "custom",
      refId: "cst_a",
      name: "Банан",
      image: null,
      mobTaken: 1,
      mineTaken: 2,
      fieldTaken: 3,
    });
    const receipt = await spend("w1", "acc1", "custom", "cst_a", 6, "pay:2");
    await credit("w1", "acc1", "custom", "cst_a", 6, "pay:2:undo", receipt);
    expect(returnStack.mock.calls[0]?.[3]).toMatchObject({
      mobTaken: 1,
      mineTaken: 2,
      fieldTaken: 3,
    });
  });

  it("стопку продали целиком, сделка сорвалась — назад с именем и картинкой, а не «cst_…»", async () => {
    takeStack.mockResolvedValueOnce({
      kind: "custom",
      refId: "cst_r0",
      name: "5кг гречи",
      image: "/uploads/grecha.webp",
      mobTaken: 0,
    });
    const receipt = await spend("w1", "acc1", "custom", "cst_r0", 39, "sell:1");
    await credit("w1", "acc1", "custom", "cst_r0", 39, "sell:1:undo", receipt);
    expect(returnStack.mock.calls[0]?.[3]).toMatchObject({
      name: "5кг гречи",
      image: "/uploads/grecha.webp",
    });
    await credit("w1", "acc1", "custom", "cst_r0", 1, "give:2");
    expect(returnStack.mock.calls[1]?.[3]).toMatchObject({
      name: "имя cst_r0",
      image: "/img/cst_r0.webp",
    });
  });

  it("выдача товара без квитанции — не с мобов", async () => {
    await credit("w1", "acc1", "custom", "cst_a", 3, "give:1");
    expect(returnStack.mock.calls[0]?.[3]?.mobTaken).toBeUndefined();
  });

  it("сменил основного между оплатой и откатом — штуки вернутся тому, с кого списали", async () => {
    // Иначе зелья из цены падали бы в сумку другого героя мимо её ёмкости
    // (возврат места не проверяет — он лишь возвращает снятое).
    takeStack.mockResolvedValueOnce({
      kind: "custom",
      refId: "cst_p",
      name: "Зелье",
      image: null,
      mobTaken: 0,
    });
    const receipt = await spend("w1", "acc1", "custom", "cst_p", 20, "pay:3");
    selected.heroId = "h2";
    await credit("w1", "acc1", "custom", "cst_p", 20, "pay:3:undo", receipt);
    expect(returnStack.mock.calls[0]?.[0]).toBe("h1");
  });
});
