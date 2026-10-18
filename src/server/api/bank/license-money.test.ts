// Деньги лицензии банка: половина — на откуп золота, половина — как подписка.
import { describe, expect, it } from "vitest";
import { bookSql, splitLicense } from "./license-money";
import { BUCKET_OF, isSwapKind, BATCH_LIMITS, tokenOf } from "../energy-sub/batch-kinds";

describe("деньги лицензии банка", () => {
  it("половины в сумме — ровно цена (DARAI до 8 знаков, USDT до 6)", () => {
    expect(splitLicense("Darai", 4_800_000)).toEqual({ buyback: 2_400_000, sub: 2_400_000 });
    expect(splitLicense("USDT", 13)).toEqual({ buyback: 6.5, sub: 6.5 });
    const u = splitLicense("USDT", 3.03);
    expect(u.buyback + u.sub).toBeCloseTo(3.03, 6);
    expect(Math.round(u.buyback * 1e6)).toBe(u.buyback * 1e6);
  });

  it("DARAI: половина в очередь откупа, другая — как подписка (60 % пул карты, 15 % сжечь, 25 % разработчикам)", () => {
    const sql = bookSql({ id: "blb_x", token: "Darai", price: 4_800_000 });
    expect(sql).toMatch(/INSERT INTO yuplink\.bank_buyback[\s\S]*2400000\.00000000/);
    expect(sql).toMatch(/darai_pool_move[\s\S]*1440000\.00000000[\s\S]*'banklic:blb_x:map'/);
    expect(sql).toMatch(/'sub_burn', 'Darai',\s*360000\.00000000/);
    expect(sql).toMatch(/'sub_dev', 'Darai',\s*600000\.00000000/);
    expect(sql).toMatch(/SET booked = true\s+WHERE id = 'blb_x' AND NOT booked/);
  });

  it("USDT: половина в корзину «$ → откуп золота», другая — как подписка (30 % $ → карта, 70 % корзина $)", () => {
    const sql = bookSql({ id: "blb_y", token: "USDT", price: 13 });
    expect(sql).toMatch(/'bank_usd', 'USDT', 6\.500000/);
    expect(sql).toMatch(/'sub_usd_map', 'USDT',\s*1\.95000000/);
    expect(sql).toMatch(/'sub_usd', 'USDT',\s*4\.55000000/);
    expect(sql).not.toMatch(/bank_buyback/);
  });

  it("корзина «$ → откуп золота» — обмен на Ref, как «$ → карта»", () => {
    expect(BUCKET_OF.bank_usd).toBe("bank_usd");
    expect(isSwapKind("bank_usd")).toBe(true);
    expect(tokenOf("bank_usd")).toBe("USDT");
    expect(BATCH_LIMITS.bank_usd).toEqual(BATCH_LIMITS.usd_map);
  });
});
