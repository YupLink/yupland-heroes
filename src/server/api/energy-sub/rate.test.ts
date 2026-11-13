import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/mcpClient", () => ({ mcpExec: vi.fn(async () => []) }));

import { daraiPerUsd, fetchDaraiUsd, resetRateCache } from "./rate";

const ok = (price: string) => ({ ok: true, json: async () => ({ token_contract_id: "darai.tkn.near", price }) });
// Смарт-роутер: 1 USDT → 2 000 000 DARAI (18 знаков).
const route = (out: string) => ({ ok: true, json: async () => ({ result_data: { amount_out: out } }) });
const TWO_M = "2000000000000000000000000";

describe("курс DARAI — живой обмен на Ref (04.11.2026)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    resetRateCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("берёт выход обмена 1 USDT → DARAI у смарт-роутера, застывший индексер не спрашивает", async () => {
    fetchMock.mockResolvedValueOnce(route(TWO_M));
    expect(await fetchDaraiUsd()).toBeCloseTo(0.0000005, 12);
    expect(String(fetchMock.mock.calls[0][0])).toContain("smartrouter.ref.finance");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("indexer.ref.finance"))).toBe(false);
  });

  it("роутер не ответил — цена токена с api.ref.finance", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(ok("0.0000005"));
    expect(await fetchDaraiUsd()).toBe(0.0000005);
    expect(String(fetchMock.mock.calls[1][0])).toContain("api.ref.finance");
  });

  it("оба молчат или цена кривая — null", async () => {
    fetchMock.mockResolvedValueOnce(route("0")).mockResolvedValueOnce(ok("0"));
    expect(await fetchDaraiUsd()).toBeNull();
  });

  it("daraiPerUsd = DARAI за 1 $", async () => {
    fetchMock.mockResolvedValue(route(TWO_M));
    const r = await daraiPerUsd();
    expect(r?.rate).toBeCloseTo(2_000_000, 3);
  });
});
