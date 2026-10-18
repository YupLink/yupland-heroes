import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  cells: [] as Array<Record<string, unknown>>,
  tpl: [] as Array<{ id: string }>,
}));
const growth = vi.hoisted(() => vi.fn());
const sums = vi.hoisted(() => vi.fn());

vi.mock("../db/mcpClient", () => ({
  mcpExec: async (sql: string) => (sql.includes("raid_boss_template") ? db.tpl : db.cells),
}));
vi.mock("./usdt-objects", () => ({
  usdtOfObjects: sums,
  assertUsdtGrowth: growth,
}));

import { assertUsdtPatches } from "./usdt-cells";
import { usdtInFillers } from "./usdt-templates";

const usdt = (amount: number) => ({ rewardConfig: { fillers: [{ kind: "token", token: "USDT", amount }] } });

describe("assertUsdtPatches", () => {
  beforeEach(() => {
    db.cells = [];
    db.tpl = [];
    growth.mockReset();
    sums.mockReset().mockImplementation(async (objs: unknown[]) => objs.length);
  });

  it("пустые клетки без USDT — база не трогается, сверки нет", async () => {
    await assertUsdtPatches("m", [{ q: 1, r: 1, objectId: "chest:plain" }], "кисть");
    expect(growth).not.toHaveBeenCalled();
  });

  it("новый объект со своей наградой в USDT — сверка «до 0, после 1»", async () => {
    await assertUsdtPatches("m", [{ q: 1, r: 1, objectId: "boss:x", objectConfig: usdt(2) }], "кисть");
    expect(growth).toHaveBeenCalledWith(0, 1, "кисть");
  });

  it("шаблон с USDT: оживление павшего — рост", async () => {
    db.tpl = [{ id: "chest_u" }];
    db.cells = [{ q: 2, r: 2, object_id: "chest:chest_u", object_config: null, dead: true }];
    await assertUsdtPatches("m", [{ q: 2, r: 2, alive: true }], "оживление");
    expect(growth).toHaveBeenCalledWith(0, 1, "оживление");
  });

  it("смена объекта сбрасывает свою награду: был USDT, стал пустой — без роста", async () => {
    db.cells = [{ q: 3, r: 3, object_id: "boss:x", object_config: usdt(5), dead: false }];
    await assertUsdtPatches("m", [{ q: 3, r: 3, objectId: "boss:y" }], "кисть");
    expect(growth).toHaveBeenCalledWith(1, 0, "кисть");
  });
});

describe("usdtInFillers", () => {
  it("считает USDT в любом регистре, строку-число и пропускает прочее", () => {
    expect(
      usdtInFillers([
        { kind: "token", token: "usdt", amount: "1.5" },
        { kind: "token", token: "USDT", amount: 2 },
        { kind: "token", token: "Darai", amount: 100 },
        { kind: "resource", resource: "gold", amount: 9 },
      ]),
    ).toBe(3.5);
    expect(usdtInFillers(null)).toBe(0);
  });
});
