// Сундук получает сделкой только Торговец: строго — без спеки и «универсальный»
// не проходят. Базы здесь нет — справочник и выбранный герой подменены.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  /** Id своих товаров с галочкой «магический сундук». */
  chests: new Set<string>(["cst_chest"]),
  hero: null as null | { race: string | null; spec: string | null },
  sql: [] as string[],
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    state.sql.push(sql);
    const id = /id = '([^']+)'/.exec(sql)?.[1] ?? "";
    return sql.includes("magic_chest") ? [{ chest: state.chests.has(id) }] : [];
  },
}));
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  canonRef: async (_kind: string, ref: string | null) => ref,
  // Позиция витрины без шаблона сводится к канону по имени — как в item-alias.
  canonStackKey: async (kind: string, ref: string | null, name?: string | null) => {
    const byName = name === "Магический сундук" ? "cst_chest" : null;
    const canon = !ref || ref.startsWith("mkt_") ? (byName ?? ref) : ref;
    return `${kind}:${canon ?? ""}`;
  },
  refFromStackKey: (k: string) => k.slice(k.indexOf(":") + 1) || null,
}));
vi.mock("@/server/api/beta-raid/hero-current", () => ({ selectedHero: async () => state.hero }));

import { isChestBuyerSpec } from "@/server/api/beta-raid/chest/chest-item";
import { assertChestGood } from "@/server/api/beta-raid/market-chest-buyer";

beforeEach(() => {
  state.hero = { race: "Человек", spec: "Торговец" };
  state.sql = [];
});

describe("isChestBuyerSpec", () => {
  it("Торговец / Merchant — да, без регистра и пробелов по краям", () => {
    expect(isChestBuyerSpec("Торговец")).toBe(true);
    expect(isChestBuyerSpec("Merchant")).toBe(true);
    expect(isChestBuyerSpec("  торговец ")).toBe(true);
  });

  it("универсальный, без спеки и прочие — нет", () => {
    expect(isChestBuyerSpec("универсальный")).toBe(false);
    expect(isChestBuyerSpec("universal")).toBe(false);
    expect(isChestBuyerSpec(null)).toBe(false);
    expect(isChestBuyerSpec(undefined)).toBe(false);
    expect(isChestBuyerSpec("")).toBe(false);
    expect(isChestBuyerSpec("Воин")).toBe(false);
    expect(isChestBuyerSpec("Путешественник")).toBe(false);
  });
});

const chest = { kind: "custom", refId: "cst_chest", id: "mkt_1", name: "Сундук" };

describe("assertChestGood", () => {
  it("Торговец покупает сундук", async () => {
    await expect(assertChestGood("w", chest)).resolves.toBeUndefined();
  });

  it("Воин — chest.merchant_only", async () => {
    state.hero = { race: "Человек", spec: "Воин" };
    await expect(assertChestGood("w", chest)).rejects.toThrow("chest.merchant_only");
  });

  it("герой без спеки — тоже нет", async () => {
    state.hero = { race: "Человек", spec: null };
    await expect(assertChestGood("w", chest)).rejects.toThrow("chest.merchant_only");
  });

  it("нет выбранного героя — market.need_hero", async () => {
    state.hero = null;
    await expect(assertChestGood("w", chest)).rejects.toThrow("market.need_hero");
  });

  it("позиция без шаблона узнаётся по имени, как при выдаче", async () => {
    state.hero = { race: "Человек", spec: "Воин" };
    const orphan = { kind: "custom", refId: null, id: "mkt_9", name: "Магический сундук" };
    await expect(assertChestGood("w", orphan)).rejects.toThrow("chest.merchant_only");
  });

  it("обычный товар и не-custom пропускаются любому герою", async () => {
    state.hero = { race: "Человек", spec: "Воин" };
    await expect(
      assertChestGood("w", { kind: "custom", refId: "cst_wheat", name: "Пшеница" }),
    ).resolves.toBeUndefined();
    const before = state.sql.length;
    await expect(assertChestGood("w", { kind: "boss", refId: "rbt_1" })).resolves.toBeUndefined();
    await expect(
      assertChestGood("w", { kind: "resource", refId: "gold" }),
    ).resolves.toBeUndefined();
    expect(state.sql.length).toBe(before);
  });
});
