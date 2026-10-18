// Ручной обмен USDT → DARAI: не больше свободного USDT карты минус запас 5
// (ПРАВИЛА §8.49а). Сеть не ответила — не меняем вслепую.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = { free: 10 as number | null };
vi.mock("./token-free-pool", () => ({ freeTokenPool: async () => ({ free: st.free }) }));

const { assertFreeUsdt } = await import("./ref-swap-free");

beforeEach(() => {
  st.free = 10;
});

describe("обмен только из свободного USDT", () => {
  it("в пределах свободного минус запас — можно", async () => {
    await expect(assertFreeUsdt(5)).resolves.toBeUndefined();
    await expect(assertFreeUsdt(2.5)).resolves.toBeUndefined();
  });

  it("запас не трогает — отказ с суммой", async () => {
    await expect(assertFreeUsdt(5.01)).rejects.toThrow(/с запасом 5: 5 — обмен на 5,01 нельзя/);
  });

  it("перерасход — свободно 0, любой обмен запрещён", async () => {
    st.free = -28.15;
    await expect(assertFreeUsdt(1)).rejects.toThrow(/с запасом 5: 0 — обмен/);
  });

  it("остаток не прочитался — отказ", async () => {
    st.free = null;
    await expect(assertFreeUsdt(1)).rejects.toThrow(/не прочитался/);
  });
});
