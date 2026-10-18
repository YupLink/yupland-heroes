// Исполнитель батч-рассылки: выполненной считается только подтверждённая
// сетью часть; авторассылка пишет строку «approved» от «авто».
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = {
  enough: true,
  res: { txHashes: ["H1"], paid: ["a.tg", "b.tg"], failed: [] as Array<{ receivers: string[]; txHash: string; error: string }> },
  updates: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<Record<string, unknown>>,
};

vi.mock("./db/pg", () => ({
  pg: {
    adminBatchPayoutsPending: {
      update: async (_w: unknown, v: Record<string, unknown>) => void st.updates.push(v),
      insert: async (v: Record<string, unknown>) => void st.inserts.push(v),
    },
  },
}));
vi.mock("./near", () => ({
  getOperatingBalanceRaw: async () => "0",
  hasEnough: () => st.enough,
  ftTransferBatched: async () => st.res,
}));

const { runAutoBatchPayout, runBatchTransfers } = await import("./adminBatchPayoutRun");

const row = {
  id: "apb_1",
  ft_contract: "darai.tkn.near",
  decimals: 18,
  reward_symbol: "DARAI",
  items: [
    { recipient: "a.tg", amount_human: 10 },
    { recipient: "b.tg", amount_human: 5 },
  ],
  total_human: 15,
};

beforeEach(() => {
  st.enough = true;
  st.res = { txHashes: ["H1"], paid: ["a.tg", "b.tg"], failed: [] };
  st.updates = [];
  st.inserts = [];
});

describe("исполнитель батч-рассылки", () => {
  it("всё дошло — done с хэшами", async () => {
    const r = await runBatchTransfers(row);
    expect(r.allPaid).toBe(true);
    expect(st.updates).toEqual([{ status: "done", tx_hashes: ["H1"] }]);
  });

  it("кусок не дошёл — failed и список недоплаченных", async () => {
    st.res = { txHashes: [], paid: ["a.tg"], failed: [{ receivers: ["b.tg"], txHash: "", error: "timeout" }] };
    const r = await runBatchTransfers(row);
    expect(r.allPaid).toBe(false);
    expect(r.unpaid).toEqual([{ recipient: "b.tg", amount_human: 5 }]);
    expect(String(st.updates[0].status)).toBe("failed");
  });

  it("не хватает на кошельке — никому не ушло", async () => {
    st.enough = false;
    const r = await runBatchTransfers(row);
    expect(r.unpaid).toHaveLength(2);
    expect(r.txError).toMatch(/Недостаточно/);
  });

  it("авторассылка: строка сразу approved от «авто», мелочь < 0.01 отброшена", async () => {
    await runAutoBatchPayout({
      ftContract: "darai.tkn.near",
      symbol: "DARAI",
      decimals: 18,
      reason: "тест",
      items: [
        { recipient: "a.tg", amountHuman: 10, tag: "x" },
        { recipient: "b.tg", amountHuman: 5, tag: "y" },
        { recipient: "c.tg", amountHuman: 0.001, tag: "z" },
      ],
    });
    expect(st.inserts[0]).toMatchObject({ status: "approved", decided_by: "авто", requested_by: "auto", total_human: 15 });
    expect((st.inserts[0].items as unknown[]).length).toBe(2);
  });
});
