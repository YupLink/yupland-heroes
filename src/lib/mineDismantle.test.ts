// Возврат за разборку шахты (§8.70): 30 % цены заготовки вида — ресурсы вниз
// до 0,0001 (без хвостов double: 150 × 0,3 = 45, а не 44,9999), товары —
// целыми штуками вниз, нулевых строк нет.
import { describe, expect, it } from "vitest";
import { dismantleRefund, goodShare, MINE_DISMANTLE_ENERGY, resShare } from "@/lib/mineDismantle";
import { DEFAULT_ARCHITECT_CONFIG, parseArchitectConfig } from "@/lib/castleArchitect";

describe("30 % ресурса", () => {
  it("ровно, без хвостов double", () => {
    expect(resShare(150)).toBe(45);
    expect(resShare(300)).toBe(90);
    expect(resShare(30)).toBe(9);
    expect(resShare(1)).toBe(0.3);
    expect(resShare(7)).toBe(2.1);
    expect(resShare(15)).toBe(4.5);
  });

  it("усечение до 0,0001 вниз; ноль и мусор — 0", () => {
    expect(resShare(0.00049)).toBe(0.0001);
    expect(resShare(0.0003)).toBe(0);
    expect(resShare(1.23457)).toBe(0.3703);
    expect(resShare(0)).toBe(0);
    expect(resShare(Number.NaN)).toBe(0);
    expect(resShare(-5)).toBe(0);
  });
});

describe("30 % товара", () => {
  it("целыми штуками вниз", () => {
    expect(goodShare(10)).toBe(3);
    expect(goodShare(7)).toBe(2);
    expect(goodShare(3)).toBe(0);
    expect(goodShare(1)).toBe(0);
  });
});

describe("возврат по цене заготовки", () => {
  it("лесопилка по умолчанию: 90 дерева, 15 камня, 45 золота, алмазов нет", () => {
    expect(dismantleRefund(DEFAULT_ARCHITECT_CONFIG.blueprints.wood)).toEqual({
      res: { wood: 90, stone: 15, gold: 45 },
      goods: [],
    });
  });

  it("цена из настройки (алмазная на проде 22.10: 15 алмазов) и товары", () => {
    const cfg = parseArchitectConfig({
      blueprints: {
        diamonds: {
          wood: 30000,
          stone: 3000,
          gold: 15000,
          diamonds: 15,
          goods: [
            { key: "custom:cst_board", name: "Доска", qty: 7 },
            { key: "custom:cst_nail", name: "Гвоздь", qty: 2 },
          ],
        },
      },
    });
    expect(dismantleRefund(cfg.blueprints.diamonds)).toEqual({
      res: { wood: 9000, stone: 900, gold: 4500, diamonds: 4.5 },
      goods: [{ key: "custom:cst_board", name: "Доска", qty: 2 }],
    });
  });

  it("цена 100 энергии", () => {
    expect(MINE_DISMANTLE_ENERGY).toBe(100);
  });
});
