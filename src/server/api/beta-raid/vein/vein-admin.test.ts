// Товар лавки «Жила» (vein-admin, market-*): форма админа принимает вид из двух и
// пачку клеток, имя и картинку ставит сам; покупка кладёт в рюкзак стопку
// vein:<вид> размером «клеток в пачке × пачек», место считает так же.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketItem } from "@/lib/marketItem";
import { VEIN_ART } from "@/lib/gameArt";

const s = vi.hoisted(() => ({
  rows: [] as Array<{ stackKey: string; count: number }>,
  capacity: 1,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => (/FROM yuplink\.raid_hero_backpack/.test(sql) ? s.rows : []),
}));
vi.mock("@/server/api/beta-raid/market-backpack", async (orig) => ({
  ...(await orig<typeof import("@/server/api/beta-raid/market-backpack")>()),
  resolveBackpack: async () => ({ heroId: "h1", capacity: s.capacity, potionCapacity: 1 }),
}));

const { applyVeinGood, assertVeinForSale } = await import("./vein-admin");
const { GOES_TO_BACKPACK, assertBuyRoom } = await import("../market-buy-room");
const { stackKeyFor } = await import("../market-backpack");
const { upsertMarketInput } = await import("../market-admin-input");
const { goodKey } = await import("../admin-economy-keys");

const good = (o: Partial<Parameters<typeof applyVeinGood>[0]> = {}) => ({
  kind: "vein",
  side: "buy",
  refId: "gold" as string | null,
  giveAmount: 10,
  name: "",
  image: null as string | null,
  ...o,
});

beforeEach(() => {
  s.rows = [];
  s.capacity = 1;
});

describe("форма админа: позиция-жила", () => {
  it("вид — золото или алмазы; имя и картинка — от вида, своя картинка остаётся", () => {
    const a = good();
    applyVeinGood(a);
    expect(a.name).toBe("Золотая жила");
    expect(a.image).toBe(VEIN_ART.gold);
    const b = good({ refId: "diamonds", image: "/uploads/x.webp", name: "что угодно" });
    applyVeinGood(b);
    expect(b.name).toBe("Алмазная жила");
    expect(b.image).toBe("/uploads/x.webp");
  });

  it("отказы: скупка, дробная или пустая пачка, чужой вид", () => {
    expect(() => applyVeinGood(good({ side: "sell" }))).toThrow("только в витрину покупки");
    expect(() => applyVeinGood(good({ giveAmount: 2.5 }))).toThrow("Клеток в пачке");
    expect(() => applyVeinGood(good({ giveAmount: 0 }))).toThrow("Клеток в пачке");
    expect(() => applyVeinGood(good({ refId: "stone" }))).toThrow("Выбери вид жилы");
    expect(() => applyVeinGood(good({ refId: null }))).toThrow("Выбери вид жилы");
  });

  it("прочие виды товара не трогает", () => {
    const land = good({ kind: "land", refId: "terrain_x", side: "sell" });
    applyVeinGood(land);
    expect(land.name).toBe("");
  });

  it("сервер принимает вид товара vein; ключ экономики — vein:<вид>", () => {
    const parsed = upsertMarketInput.parse({
      q: 1,
      r: 2,
      kind: "vein",
      refId: "diamonds",
      giveAmount: 5,
      priceResource: "gold",
      priceAmount: 100,
    });
    expect(parsed.kind).toBe("vein");
    expect(goodKey("vein", "diamonds", "Алмазная жила")).toBe("vein:diamonds");
  });

  it("покупка — только с настоящим видом", () => {
    expect(() => assertVeinForSale("gold")).not.toThrow();
    expect(() => assertVeinForSale("stone")).toThrow("market.bad_item");
  });
});

describe("покупка жилы — в рюкзак пачкой", () => {
  const item = {
    id: "mkt_vein1",
    side: "buy",
    kind: "vein",
    refId: "gold",
    name: "Золотая жила",
    giveAmount: 20,
    priceResource: "gold",
    priceToken: null,
    priceAmount: 100,
    price2Resource: null,
    price2Token: null,
    price2Amount: null,
  } as MarketItem;

  it("рюкзак, стопка vein:<вид>", async () => {
    expect(GOES_TO_BACKPACK("vein")).toBe(true);
    expect(await stackKeyFor(item)).toBe("vein:gold");
    expect(await stackKeyFor({ ...item, refId: "diamonds" })).toBe("vein:diamonds");
  });

  it("место — «клеток в пачке × пачек»: одна ячейка держит одну пачку из 20", async () => {
    await expect(assertBuyRoom("w1", item, 1, false)).resolves.toBeUndefined();
    await expect(assertBuyRoom("w1", item, 2, false)).rejects.toThrow("market.backpack_need");
  });

  it("долив в свою неполную ячейку — без новой", async () => {
    s.rows = [{ stackKey: "vein:gold", count: 5 }];
    await expect(assertBuyRoom("w1", { ...item, giveAmount: 25 }, 1, false)).resolves.toBe(
      undefined,
    );
  });
});
