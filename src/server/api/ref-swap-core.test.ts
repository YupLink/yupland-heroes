// Обмен на Ref: пометка «отправляется» получает хэш и байты ДО отправки;
// без подтверждения — ошибка с хэшем (разберёт сверка), приход — по логам.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ev: string[] = [];
const st = { result: { txHash: "HS", status: "confirmed", outcome: {} } as Record<string, unknown> };
vi.mock("../near", () => ({
  ensureStorageDeposit: async () => {},
  invalidateBalanceCache: () => {},
  getOperatingBalanceRaw: async () => "1000000000000000000000000000000",
}));
vi.mock("./ref-swap-quote", async (orig) => ({
  ...(await orig<typeof import("./ref-swap-quote")>()),
  quoteUsdtToDarai: async () => ({ usdtRaw: "2100000", actions: [] }),
}));
vi.mock("../nearSafe", () => ({
  functionCallAction: (o: { methodName: string }) => o,
  signAndSendSafe: async (o: { onSigned: (h: string, m: { nonce: string; signedTx: string }) => Promise<void> }) => {
    await o.onSigned("HS", { nonce: "9", signedTx: "B" });
    ev.push("broadcast");
    return st.result;
  },
}));

const { swapUsdtToDaraiCore } = await import("./ref-swap-core");

beforeEach(() => {
  ev.length = 0;
  process.env.NEAR_SIGNER_ACCOUNT_ID = "darai_gdrop.near";
});

describe("обмен USDT → DARAI", () => {
  it("пометка до отправки, с хэшем и байтами; приход из логов", async () => {
    st.result = {
      txHash: "HS",
      status: "confirmed",
      outcome: {
        receipts_outcome: [
          { outcome: { executor_id: "darai.tkn.near", logs: ["Transfer 5000000000000000000 from v2.ref-finance.near to darai_gdrop.near"] } },
        ],
      },
    };
    const r = await swapUsdtToDaraiCore(2.1, async (h, m) => void ev.push(`mark:${h}:${m.nonce}:${m.signedTx}`));
    expect(ev).toEqual(["mark:HS:9:B", "broadcast"]);
    expect(r).toEqual({ hash: "HS", received: 5 });
  });

  it("не подтвердился — ошибка с хэшем, приход не засчитан", async () => {
    st.result = { txHash: "HS", status: "unknown", errorMsg: "timeout" };
    await expect(swapUsdtToDaraiCore(2.1)).rejects.toThrow("Обмен не подтвердился (tx HS): timeout");
  });
});

describe("Ref откатил обмен", () => {
  it("«успех» со значением 0 — не обмен: ошибка, приход не засчитан", async () => {
    st.result = {
      txHash: "HS",
      status: "confirmed",
      outcome: { status: { SuccessValue: Buffer.from('"0"').toString("base64") }, receipts_outcome: [] },
    };
    await expect(swapUsdtToDaraiCore(2.1)).rejects.toThrow("Обмен не состоялся: Ref вернул USDT (tx HS)");
  });
});
