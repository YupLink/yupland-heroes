// Ключ своего товара у маркета — по имени канона, как у стека в рюкзаке. Иначе
// «Бананы» с витрины и «Банан» на скупке — два товара в журнале, и «Золото»
// считает прибылью всю выручку скупки (06.10.2026: ~36 700 очков сверх ратуши).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { mcpExec } from "@/server/db/mcpClient";
import { invalidateAliases } from "@/server/api/beta-raid/item-alias";
import { marketKeysCanon, marketTradeKey } from "./canon-key";
import { noteMarketTrade, stackItemKey } from "./trade-hooks";
import { townGoodKeyWith, townGoodNames } from "./town-good-key";
import type { MarketItem } from "@/lib/marketItem";
import type { TownGood } from "@/lib/townConfig";

const exec = vi.mocked(mcpExec);

/** Справочник своих товаров и связки — как их отдаёт база. */
const TPL: Record<string, string> = {
  cst_ban: "Банан",
  cst_cuc: "Зимние Огурцы",
  cst_new: "Морковка",
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

const pos = (o: Partial<MarketItem>): MarketItem =>
  ({
    id: "mkt_ban",
    q: 1,
    r: 2,
    side: "buy",
    kind: "custom",
    refId: null,
    giveAmount: 1,
    giveToken: null,
    name: "Бананы",
    priceResource: "gold",
    priceToken: null,
    priceAmount: 30,
    ...o,
  }) as MarketItem;

const metaCalls = (): number =>
  exec.mock.calls.filter((c) => String(c[0]).includes("'custom' AS g")).length;

// Кэш имён шаблонов (market-payout-meta) живёт минуту и сброса не имеет:
// каждый тест — на две минуты позже, чтобы не видеть чужих попаданий.
let clock = Date.UTC(2026, 9, 6);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime((clock += 120_000));
  invalidateAliases();
  metaDown = false;
  exec.mockImplementation(async (sql: string) => route(sql));
});
afterEach(() => {
  exec.mockReset();
  vi.useRealTimers();
});

describe("canon-key: ключ позиции витрины", () => {
  it("«Бананы» без шаблона — ключ стека «Банан», а не имени позиции", async () => {
    const key = await marketTradeKey(pos({}));
    expect(key).toBe("custom:name:банан");
    expect(key).toBe(stackItemKey("custom:cst_ban", "custom", "cst_ban", "Банан"));
  });

  it("позиция с шаблоном и своим названием — имя шаблона (как у ратуши)", async () => {
    const key = await marketTradeKey(pos({ refId: "cst_cuc", name: "Огурцы" }));
    expect(key).toBe("custom:name:зимние огурцы");
    const good = { id: "tg_x", kind: "custom", refId: "cst_cuc", token: null } as TownGood;
    expect(townGoodKeyWith(good, await townGoodNames([good]))).toBe(key);
  });

  it("скупка под своим названием на шаблон со связкой — имя канона", async () => {
    const key = await marketTradeKey(pos({ side: "sell", refId: "cst_old", name: "Морковь!" }));
    expect(key).toBe("custom:name:морковка");
  });

  it("не свой товар и товар без шаблона — прежний ключ", async () => {
    const gold = pos({ kind: "resource", refId: "gold", name: "Золото" });
    expect(await marketTradeKey(gold)).toBe("resource:gold");
    expect(await marketTradeKey(pos({ kind: "pack", refId: "cp_1" }))).toBe("pack:cp_1");
    expect(await marketTradeKey(pos({ name: "Ананас" }))).toBe("custom:name:ананас");
  });

  it("пачка — один заход за именами шаблонов", async () => {
    const keys = await marketKeysCanon([
      pos({}),
      pos({ id: "mkt_c", refId: "cst_cuc", name: "Огурцы" }),
      pos({ id: "mkt_g", kind: "resource", refId: "gold" }),
    ]);
    expect(keys).toEqual(["custom:name:банан", "custom:name:зимние огурцы", "resource:gold"]);
    expect(metaCalls()).toBe(1);
  });

  it("справочник не ответил — имя позиции, без броска", async () => {
    metaDown = true;
    await expect(marketTradeKey(pos({ refId: "cst_cuc", name: "Огурцы" }))).resolves.toBe(
      "custom:name:огурцы",
    );
  });
});

describe("noteMarketTrade: строка журнала", () => {
  const journalSql = (): string =>
    exec.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes("INSERT INTO yuplink.trade_journal")) ?? "";

  it("покупка «Бананов» — ключ канона, подпись позиции", async () => {
    await noteMarketTrade({
      item: pos({}),
      account: "acc_a",
      mapId: "m",
      side: "buy",
      units: 3,
      ref: "mkt:x",
    });
    expect(journalSql()).toContain(
      "'market', 'buy', 'custom:name:банан', 'Бананы', 3, 30, 'gold', 90",
    );
  });

  it("сбой записи — тихо: void-хук не роняет сделку", async () => {
    exec.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO yuplink.trade_journal")) throw new Error("db down");
      return route(sql);
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const note = noteMarketTrade({
      item: pos({}),
      account: "a",
      mapId: "m",
      side: "sell",
      units: 1,
      ref: "r",
    });
    await expect(note).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
