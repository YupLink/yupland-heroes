// Штучные предметы в оплате маркета: «любой герой редкости» ломбарда снимается
// из инвентаря (а не со стека рюкзака) и возвращается только по квитанции;
// именной герой по-прежнему — дело рюкзака (market-money).
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ ev: [] as string[] }));
vi.mock("./market-art-pay", () => ({
  spendArt: async () => {
    st.ev.push("spendArt");
    return { paidArts: [] };
  },
  creditArt: async () => void st.ev.push("creditArt"),
}));
vi.mock("./hero-pawn-take", () => ({
  spendPawnHero: async (
    wallet: string,
    account: string,
    token: string,
    amount: number,
    ref: string,
  ) => {
    st.ev.push(`spendHero:${wallet}:${account}:${token}:${amount}:${ref}`);
    return { paidHeroes: [{ op: ref, itemId: "ugi_1", templateId: "hero_A" }] };
  },
  restorePawnHeroes: async (h: Array<{ op: string }>, n: number) =>
    void st.ev.push(`restore:${h[0]?.op}:${n}`),
}));

const { spendInventory, creditInventory } = await import("./market-inv-pay");

beforeEach(() => {
  st.ev = [];
});

describe("market-inv-pay", () => {
  it("«любой герой» — снятие копии из инвентаря", async () => {
    const r = await spendInventory("hero", "w", "acc", "hero_any_epic", 1, "ref1", {
      heroItemId: "ugi_1",
    });
    expect(st.ev).toEqual(["spendHero:w:acc:hero_any_epic:1:ref1"]);
    expect(r?.paidHeroes?.[0]?.templateId).toBe("hero_A");
  });

  it("именной герой и рюкзачные виды — не сюда (null/false)", async () => {
    expect(await spendInventory("hero", "w", "acc", "hero_tpl", 1, "r")).toBeNull();
    expect(await spendInventory("custom", "w", "acc", "cst_1", 1, "r")).toBeNull();
    expect(await creditInventory("hero", "w", "acc", "hero_tpl", 1, "r")).toBe(false);
    expect(st.ev).toEqual([]);
  });

  it("артефакт — как раньше", async () => {
    await spendInventory("art", "w", "acc", "art_any_rare", 1, "r");
    expect(await creditInventory("art", "w", "acc", "art_any_rare", 1, "r")).toBe(true);
    expect(st.ev).toEqual(["spendArt", "creditArt"]);
  });

  it("возврат «любого героя» — по квитанции; без неё бросок, не стек в рюкзаке", async () => {
    const receipt = { paidHeroes: [{ op: "ref1", itemId: "ugi_1", templateId: "hero_A" }] };
    expect(await creditInventory("hero", "w", "acc", "hero_any_epic", 1, "u", receipt)).toBe(true);
    expect(st.ev).toEqual(["restore:ref1:1"]);
    await expect(creditInventory("hero", "w", "acc", "hero_any_epic", 1, "u")).rejects.toThrow(
      "market.give_failed",
    );
  });
});
