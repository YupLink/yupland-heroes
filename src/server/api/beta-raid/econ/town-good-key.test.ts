// Ключ товара ратуши в журнале = ключ того же товара в маркете и на складе.
// Иначе турнир «Золото» не сводит покупку с продажей и считает прибылью всю
// выручку (дыра 06.10.2026: огурцы из маркета по 30 сдавали ратуше по ~33).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { mcpExec } from "@/server/db/mcpClient";
import { invalidateAliases } from "@/server/api/beta-raid/item-alias";
import { keyFromTownGood } from "@/server/api/beta-raid/admin-economy-keys";
import { marketItemKey, noteTownTrade, stackItemKey } from "./trade-hooks";
import { townGoodKeyWith, townGoodName, townGoodNames } from "./town-good-key";
import type { TownGood } from "@/lib/townConfig";
import type { MarketItem } from "@/lib/marketItem";

const exec = vi.mocked(mcpExec);

/** Справочник своих товаров и связки — как их отдаёт база. */
const TPL: Record<string, string> = {
  cst_cuc: "Зимние Огурцы",
  cst_new: "Морковка",
  cst_fish: "Рыба",
};
const ALIASES = [{ kind: "custom", fromRef: "cst_old", toRef: "cst_new" }];
let metaDown = false;

function route(sql: string): unknown[] {
  if (sql.includes("FROM yuplink.item_alias")) return ALIASES;
  if (sql.includes("FROM yuplink.raid_custom_item ORDER BY")) {
    return Object.entries(TPL).map(([id, name]) => ({ id, name }));
  }
  if (sql.includes("'custom' AS g")) {
    if (metaDown) throw new Error("db down");
    const ids = [...sql.matchAll(/'(cst_[a-z0-9_]+)'/g)].map((m) => m[1]);
    return ids
      .filter((id) => TPL[id])
      .map((id) => ({ g: "custom", id, name: TPL[id], image: null }));
  }
  return [];
}

const good = (o: Partial<TownGood>): TownGood => ({
  id: "tg_xxvv4a2m31",
  kind: "custom",
  refId: "cst_cuc",
  token: null,
  operation: "both",
  marketPrice: 30,
  consumePerResident: 0,
  producePerDay: 0,
  ...o,
});

const listing: MarketItem = {
  id: "mkt_cuc",
  q: 10,
  r: 10,
  pos: 0,
  side: "buy",
  kind: "custom",
  refId: "cst_cuc",
  giveAmount: 1,
  giveToken: null,
  name: "Зимние Огурцы",
  image: null,
  priceResource: "gold",
  priceToken: null,
  priceAmount: 30,
  price2Resource: null,
  price2Token: null,
  price2Amount: null,
  stock: null,
  sold: 0,
  perAccountLimit: null,
  buyerMode: "all",
  buyerRaces: [],
  buyerSpecs: [],
};

const trade = (g: TownGood, name?: string) =>
  noteTownTrade({
    good: g,
    account: "acc_a",
    mapId: "m",
    q: 55,
    r: 21,
    side: "sell",
    qty: 10,
    unit: 33,
    total: 330,
    ref: "mkt-sell:town:55,21:tg_x:sell:acc_a:n",
    name,
  });

const journalSql = (): string =>
  exec.mock.calls
    .map((c) => String(c[0]))
    .find((s) => s.includes("INSERT INTO yuplink.trade_journal")) ?? "";

beforeEach(() => {
  invalidateAliases();
  metaDown = false;
  exec.mockImplementation(async (sql: string) => route(sql));
});
afterEach(() => exec.mockReset());

describe("town-good-key: ключ товара ратуши", () => {
  it("товар с шаблоном — ключ маркета и склада, а не id города", async () => {
    const names = await townGoodNames([good({})]);
    const key = townGoodKeyWith(good({}), names);
    expect(key).toBe("custom:name:зимние огурцы");
    expect(key).toBe(marketItemKey(listing));
    expect(key).toBe(stackItemKey("custom:cst_cuc", "custom", "cst_cuc", "Зимние Огурцы"));
    expect(townGoodName(good({}), names)).toBe("Зимние Огурцы");
  });

  it("один шаблон в разных городах — один ключ (купил в ратуше А, продал в Б)", async () => {
    const a = good({ id: "tg_aaaaaaaaaa", refId: "cst_fish" });
    const b = good({ id: "tg_bbbbbbbbbb", refId: "cst_fish" });
    const names = await townGoodNames([a, b, good({})]);
    expect(townGoodKeyWith(a, names)).toBe("custom:name:рыба");
    expect(townGoodKeyWith(a, names)).toBe(townGoodKeyWith(b, names));
    // Справочник — не больше одного захода на всю пачку (минутный кэш сверху).
    expect(exec.mock.calls.filter((c) => String(c[0]).includes("'custom' AS g"))).toHaveLength(1);
  });

  it("шаблон, сведённый связкой, — имя канона, как у стека в рюкзаке", async () => {
    const names = await townGoodNames([good({ refId: "cst_old" })]);
    expect(townGoodKeyWith(good({ refId: "cst_old" }), names)).toBe("custom:name:морковка");
  });

  it("старый товар без шаблона («Помидор», имя = id) — ключ прежний", async () => {
    const old = good({ id: "Помидор", refId: null });
    const names = await townGoodNames([old]);
    expect(townGoodKeyWith(old, names)).toBe(keyFromTownGood(old));
    expect(townGoodKeyWith(old, names)).toBe("custom:name:помидор");
    const res = good({ id: "tg_s", kind: "resource", refId: "stone" });
    expect(townGoodKeyWith(res, names)).toBe("resource:stone");
  });
});

describe("noteTownTrade: строка журнала", () => {
  it("custom с шаблоном пишется ключом маркета и именем шаблона", async () => {
    await trade(good({}));
    const sql = journalSql();
    expect(sql).toContain(
      "'town', 'sell', 'custom:name:зимние огурцы', 'Зимние Огурцы', 10, 33, 'gold', 330",
    );
    expect(sql).not.toContain("tg_xxvv4a2m31'");
  });

  it("без шаблона — как раньше: ключ и подпись по id", async () => {
    await trade(good({ id: "Помидор", refId: null }));
    expect(journalSql()).toContain("'town', 'sell', 'custom:name:помидор', 'Помидор', 10");
  });

  it("справочник не ответил — запасное имя позиции лавки; сделка не падает", async () => {
    metaDown = true;
    await expect(trade(good({ refId: "cst_down" }), "Зимние Огурцы")).resolves.toBeUndefined();
    expect(journalSql()).toContain("'custom:name:зимние огурцы', 'Зимние Огурцы'");
  });

  it("сбой записи — тихо: void-хук не роняет сделку", async () => {
    exec.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO yuplink.trade_journal")) throw new Error("db down");
      return route(sql);
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(trade(good({}))).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
