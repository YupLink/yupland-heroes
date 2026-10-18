// Отказ USDT при СОХРАНЕНИИ наград без предела (ПРАВИЛА §8.49а): мистический
// бокс, витрина лавки, шахта и грядка клетки. Разбор старых данных — терпим.
import { describe, expect, it } from "vitest";
import { USDT_BANNED_MSG } from "@/lib/usdtBanned";
import { MYSTIC_TOKENS } from "@/lib/mysticKinds";
import { mysticPoolSaveSchema, parseMysticPool } from "./mystic-pool";
import { assertUpsertSane, upsertMarketInput } from "./beta-raid/market-admin-input";
import { hexCellsInput } from "./raid-hexmap-cell";
import { patchSchema } from "./beta-raid/admin-cell-patch";

const tokenTier = (token: string) => ({
  kind: "token",
  weight: 10,
  amountMin: 1,
  amountMax: 2,
  token,
});

describe("мистический бокс", () => {
  it("в пикере USDT нет", () => {
    expect(MYSTIC_TOKENS as readonly string[]).not.toContain("USDT");
  });

  it("сохранение с USDT — отказ текстом правила", () => {
    const r = mysticPoolSaveSchema.safeParse([tokenTier("Darai"), tokenTier("USDT")]);
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toContain(USDT_BANNED_MSG);
  });

  it("сохранение без USDT проходит", () => {
    expect(mysticPoolSaveSchema.safeParse([tokenTier("Darai"), tokenTier("STARS")]).success).toBe(
      true,
    );
  });

  it("старый пул с USDT разбирается — бокс открывается (выдача его тир пропустит)", () => {
    const pool = parseMysticPool([
      tokenTier("USDT"),
      { kind: "likes", weight: 20, amountMin: 1, amountMax: 3 },
    ]);
    expect(pool).toHaveLength(2);
  });
});

describe("витрина лавки", () => {
  const base = { q: 0, r: 0, kind: "resource", refId: "token", giveAmount: 1, priceAmount: 5 };

  it("покупка: товар USDT — отказ; цена в USDT — можно (деньги приходят)", () => {
    const give = upsertMarketInput.parse({
      ...base,
      side: "buy",
      giveToken: "usdt",
      priceResource: "gold",
    });
    expect(() => assertUpsertSane(give)).toThrow(USDT_BANNED_MSG);
    const pay = upsertMarketInput.parse({
      ...base,
      side: "buy",
      giveToken: "Darai",
      priceResource: "token",
      priceToken: "USDT",
    });
    expect(() => assertUpsertSane(pay)).not.toThrow();
  });

  it("скупка: выплата USDT (первой или второй ценой) — отказ; отдать USDT — можно", () => {
    const sell = { ...base, side: "sell", giveToken: "USDT" };
    const p1 = upsertMarketInput.parse({ ...sell, priceResource: "token", priceToken: "USDT" });
    expect(() => assertUpsertSane(p1)).toThrow(USDT_BANNED_MSG);
    const p2 = upsertMarketInput.parse({
      ...sell,
      priceResource: "gold",
      price2Resource: "token",
      price2Token: "USDT",
      price2Amount: 1,
    });
    expect(() => assertUpsertSane(p2)).toThrow(USDT_BANNED_MSG);
    const ok = upsertMarketInput.parse({ ...sell, priceResource: "gold" });
    expect(() => assertUpsertSane(ok)).not.toThrow();
  });
});

describe("шахта и грядка клетки", () => {
  const cell = (buildingConfig: unknown) => ({
    terrainId: "grass",
    buildingId: "mine",
    buildingConfig,
  });

  it("«Сохранить» редактора карт: USDT — отказ с именем клетки", () => {
    const bad = { "1,2": cell({ resource: "token", token: "USDT", yield: 3 }) };
    expect(() => hexCellsInput.parse(bad)).toThrow(`Клетка 1,2: ${USDT_BANNED_MSG}`);
    expect(hexCellsInput.parse({ "1,2": cell({ resource: "gold", yield: 3 }) })).toBeTruthy();
  });

  it("очередь правок режима бога: грядка с USDT — отказ", () => {
    const field = {
      field: { reward: { kind: "resource", resource: "token", token: "usdt" }, yield: 1 },
    };
    expect(() => patchSchema.parse({ q: 4, r: 5, buildingConfig: field })).toThrow(`Клетка 4,5`);
    expect(patchSchema.parse({ q: 4, r: 5, buildingConfig: { text: "табличка" } })).toBeTruthy();
  });
});
