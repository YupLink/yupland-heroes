import { beforeEach, describe, expect, it, vi } from "vitest";

const free = vi.hoisted(() => ({ value: 0 as number | null }));
const exec = vi.hoisted(() => vi.fn());

vi.mock("../db/mcpClient", () => ({ mcpExec: exec }));
vi.mock("./token-free-pool", () => ({
  freeTokenPool: async () => ({ free: free.value }),
}));

import { assertSpendableUsdt, lockUsdtSwap, USDT_RESERVE } from "./usdt-guard";

describe("usdt-guard", () => {
  beforeEach(() => exec.mockReset());

  it("пускает в пределах свободного минус запас", async () => {
    free.value = USDT_RESERVE + 10;
    await expect(assertSpendableUsdt(10, "обмен")).resolves.toBeUndefined();
  });

  it("запас не трогает: свободно 10 — обмен 6 нельзя", async () => {
    free.value = 10;
    await expect(assertSpendableUsdt(6, "обмен")).rejects.toThrow(/нельзя/);
  });

  it("минус — отказ на любую сумму", async () => {
    free.value = -1.35;
    await expect(assertSpendableUsdt(0.01, "обмен")).rejects.toThrow(/нельзя/);
  });

  it("сеть молчит — отказ, не «ноль»", async () => {
    free.value = null;
    await expect(assertSpendableUsdt(1, "обмен")).rejects.toThrow(/не прочитался/);
  });

  it("аренда: занято другим процессом — false", async () => {
    exec.mockResolvedValueOnce([]);
    await expect(lockUsdtSwap()).resolves.toBe(false);
    exec.mockResolvedValueOnce([{ ok: 1 }]);
    await expect(lockUsdtSwap()).resolves.toBe(true);
  });
});
