// Ключи товаров и валют в журнале обязаны совпадать с отчётом продаж
// (admin-economy-keys) — иначе цепочки «купил → продал» не склеятся. Плюс
// сборка строк из объектов сделок: количество в единицах товара, две строки
// у рынка фишек, ключ повтора у платы за ворота — как у леджера.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../db/mcpClient", () => ({ mcpExec: vi.fn() }));
vi.mock("../owner", () => ({ raidOwner: vi.fn() }));

import { mcpExec } from "../../../db/mcpClient";
import { raidOwner } from "../owner";
import {
  marketItemKey,
  noteChipMarketSale,
  noteMarketTrade,
  notePricesPaid,
  priceCurOf,
  priceItemKey,
  stackItemKey,
} from "./trade-hooks";
import type { MarketItem } from "@/lib/marketItem";

const exec = vi.mocked(mcpExec);
const owner = vi.mocked(raidOwner);

const item: MarketItem = {
  id: "mkt_1",
  q: 28,
  r: 45,
  pos: 0,
  side: "buy",
  kind: "resource",
  refId: "gold",
  giveAmount: 100,
  giveToken: null,
  name: "Золото",
  image: null,
  priceResource: "token",
  priceToken: "Darai",
  priceAmount: 50,
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

const lastSql = (): string => String(exec.mock.calls.at(-1)?.[0] ?? "");

afterEach(() => {
  exec.mockReset();
  owner.mockReset();
});

describe("trade-hooks: ключи", () => {
  it("валюта цены: токен символом, энергия — Energy, предмет — kind:шаблон", () => {
    expect(priceCurOf("token", "Darai")).toBe("Darai");
    expect(priceCurOf("energy")).toBe("Energy");
    expect(priceCurOf("gold")).toBe("gold");
    expect(priceCurOf("art", "tmpl_x")).toBe("art:tmpl_x");
  });

  it("стек склада: токен-ресурс из ключа, custom — по имени, как в отчёте продаж", () => {
    expect(stackItemKey("resource:token:usdt", "resource", "USDT", "USDT")).toBe(
      "resource:token:USDT",
    );
    expect(stackItemKey("resource:gold", "resource", "gold", "Золото")).toBe("resource:gold");
    expect(stackItemKey("custom:mkt_9", "custom", "mkt_9", "  Помидор ")).toBe(
      "custom:name:помидор",
    );
  });

  it("витрина: ресурс/пак/custom — тот же goodKey, что у отчёта", () => {
    expect(marketItemKey(item)).toBe("resource:gold");
    expect(marketItemKey({ ...item, kind: "pack", refId: "cp_1" })).toBe("pack:cp_1");
    expect(marketItemKey({ ...item, kind: "custom", refId: null, name: "Молоко" })).toBe(
      "custom:name:молоко",
    );
  });

  it("строка цены ворот: ресурс, токен, товар из рюкзака", () => {
    expect(priceItemKey({ resource: "gold", amount: 5 })).toBe("resource:gold");
    expect(priceItemKey({ resource: "token", token: "Darai", amount: 1 })).toBe(
      "resource:token:DARAI",
    );
    expect(
      priceItemKey({ resource: "item", itemKey: "custom:tmpl_1", itemName: "Кирпич", amount: 2 }),
    ).toBe("custom:name:кирпич");
  });
});

describe("trade-hooks: сборка строк", () => {
  it("маркет: qty в единицах товара (giveAmount × штук), цена за единицу", async () => {
    exec.mockResolvedValueOnce([]);
    await noteMarketTrade({
      item,
      account: "acc_1",
      mapId: "m",
      side: "buy",
      units: 2,
      ref: "mkt:1",
    });
    // 2 позиции × 100 золота = 200 единиц по 0.5 Darai, всего 100.
    expect(lastSql()).toContain(
      "'market', 'buy', 'resource:gold', 'Золото', 200, 0.5, 'Darai', 100, 'mkt:1'",
    );
    expect(lastSql()).toContain("'acc_1', 'shop', 'm', 28, 45");
  });

  it("рынок фишек: две строки, контрагент — другая сторона, свои ключи повтора", async () => {
    exec.mockResolvedValueOnce([]);
    await noteChipMarketSale({
      listingId: "L1",
      chipId: "c1",
      buyer: "acc_b",
      seller: "acc_s",
      price: 10,
      sellerGot: 9.1,
    });
    const sql = lastSql();
    expect(sql).toContain(
      "('acc_b', 'acc_s', NULL, NULL, NULL, 'chip_market', 'buy', 'chip:c1', NULL, 1, 10, 'tickets', 10, 'listing:L1:buy')",
    );
    expect(sql).toContain(
      "('acc_s', 'acc_b', NULL, NULL, NULL, 'chip_market', 'sell', 'chip:c1', NULL, 1, 10, 'tickets', 9.1, 'listing:L1:sell')",
    );
  });

  it("ворота: строка на каждую цену с ключом ref:№:ресурс, энергия — в причины трат", async () => {
    owner.mockResolvedValueOnce("acc_1");
    exec.mockResolvedValue([]);
    await notePricesPaid({
      source: "gate",
      wallet: "w",
      mapId: "m",
      q: 1,
      r: 2,
      prices: [
        { resource: "gold", amount: 5 },
        { resource: "energy", amount: 3 },
      ],
      ref: "gate:m:1,2:n",
    });
    const journal = String(exec.mock.calls[0][0]);
    expect(journal).toContain(
      "'sink', 'm', 1, 2, 'gate', 'pay', 'resource:gold', 'gold', 5, NULL, NULL, NULL, 'gate:m:1,2:n:0:gold'",
    );
    expect(journal).toContain(
      "'resource:energy', 'energy', 3, NULL, NULL, NULL, 'gate:m:1,2:n:1:energy'",
    );
    const energy = String(exec.mock.calls[1][0]);
    expect(energy).toContain("energy_spend_daily");
    expect(energy).toContain("'gate', 3, 1");
  });

  it("кошелёк без аккаунта — ни строки, ни ошибки", async () => {
    owner.mockRejectedValueOnce(new Error("Нет аккаунта"));
    await expect(
      notePricesPaid({
        source: "portal",
        wallet: "w",
        mapId: "m",
        q: 0,
        r: 0,
        prices: [{ resource: "gold", amount: 1 }],
        ref: "p",
      }),
    ).resolves.toBeUndefined();
    expect(exec).not.toHaveBeenCalled();
  });
});
