// Разбор вставшего шага пачки: перевод отмечается «прошёл/не прошёл», обмен —
// по хэшу, приход DARAI берётся из логов транзакции. База и сеть подменены;
// логи — настоящего обмена 28.09.2026.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ev: string[] = [];
const st = { hashUsed: false, outcome: null as unknown };

vi.mock("../../db/mcpClient", () => ({
  mcpExec: vi.fn(async (sql: string) => {
    const flat = sql.replace(/\s+/g, " ").trim();
    const step = /steps \|\| '(.+)'::jsonb/.exec(flat);
    if (step) {
      const s = JSON.parse(step[1].replace(/''/g, "'"))[0];
      ev.push(`step:${s.name}:${s.state}${s.received ? `:${s.received}` : ""}`);
      return null;
    }
    if (flat.includes("SELECT 1 AS used")) return st.hashUsed ? [{ used: 1 }] : [];
    return null;
  }),
}));
vi.mock("../raid-shared", () => ({ sqlStr: (v: string) => `'${String(v).replace(/'/g, "''")}'` }));
vi.mock("../../near", () => ({}));
vi.mock("../../rpc", () => ({ nearRpc: async () => ({ result: st.outcome }) }));
const heal = { v: { kind: "wait" } as unknown };
vi.mock("./batch-heal", () => ({ judgeStep: async () => heal.v }));

const { resolveStuckStep, usdtSentInLogs } = await import("./batch-resolve");
const { receivedFromLogs } = await import("../ref-swap-core");

// Логи реального обмена 28.09.2026 (6 USDT → DARAI), без лишних полей.
const SWAP_TX = {
  receipts_outcome: [
    {
      outcome: {
        executor_id: "usdt.tether-token.near",
        logs: [
          'EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"darai_gdrop.near","new_owner_id":"v2.ref-finance.near","amount":"6000000"}]}',
        ],
      },
    },
    {
      outcome: {
        executor_id: "v2.ref-finance.near",
        logs: ["Swapped 6000000 usdt.tether-token.near for 1198213582177408406439488 wrap.near, total fee 1"],
      },
    },
    {
      outcome: {
        executor_id: "darai.tkn.near",
        logs: ["Transfer 15806701654303957572061652 from v2.ref-finance.near to darai_gdrop.near"],
      },
    },
  ],
};

beforeEach(() => {
  ev.length = 0;
  process.env.NEAR_SIGNER_ACCOUNT_ID = "darai_gdrop.near";
  st.hashUsed = false;
  st.outcome = null;
});

describe("разбор вставшего шага", () => {
  it("логи обмена: пришло DARAI и ушло USDT — ровно как в транзакции", () => {
    expect(receivedFromLogs(SWAP_TX, "darai_gdrop.near")).toBeCloseTo(15_806_701.654303957, 6);
    expect(receivedFromLogs(SWAP_TX, "other.near")).toBe(0);
    expect(usdtSentInLogs(SWAP_TX, "darai_gdrop.near")).toBe(6);
  });

  it("обмен прошёл — по хэшу берётся приход из логов", async () => {
    st.outcome = SWAP_TX;
    const steps = [{ name: "swap" as const, state: "sending" as const, amount: 6, at: "" }];
    await resolveStuckStep("mb_6", steps, { name: "swap", sent: true, hash: "FdgG3kzAbcdoccxwAtacF21eQG6bMJ4fyetjdNDPi4S6" });
    expect(ev).toEqual(["step:swap:done:15806701.654303957"]);
  });

  it("хэш другого обмена или уже засчитанный — отказ", async () => {
    st.outcome = SWAP_TX;
    const steps = [{ name: "swap" as const, state: "sending" as const, amount: 50, at: "" }];
    const hash = "FdgG3kzAbcdoccxwAtacF21eQG6bMJ4fyetjdNDPi4S6";
    await expect(resolveStuckStep("mb_7", steps, { name: "swap", sent: true, hash })).rejects.toThrow(/другой обмен/);
    st.hashUsed = true;
    await expect(resolveStuckStep("mb_7", steps, { name: "swap", sent: true, hash })).rejects.toThrow(/уже засчитан/);
    expect(ev).toEqual([]);
  });

  it("перевод: прошёл — done, не прошёл — retry; шаг не «sending» — нечего разбирать", async () => {
    const steps = [{ name: "burn" as const, state: "sending" as const, amount: 10, at: "" }];
    await resolveStuckStep("mb_8", steps, { name: "burn", sent: true });
    await resolveStuckStep("mb_8", steps, { name: "burn", sent: false });
    expect(ev).toEqual(["step:burn:done", "step:burn:retry"]);
    await expect(
      resolveStuckStep("mb_8", [{ name: "dev", state: "done", at: "" }], { name: "dev", sent: true }),
    ).rejects.toThrow(/не ждёт разбора/);
  });
});

describe("шаг с подписанными байтами — решает сеть, а не слово", () => {
  const sending = [{ name: "dev" as const, state: "sending" as const, amount: 71, hash: "H", nonce: "1", tx: "T", at: "" }];

  it("«не прошёл», а сеть ещё не ответила — повторять нельзя", async () => {
    heal.v = { kind: "wait" };
    await expect(resolveStuckStep("mb_1", sending, { name: "dev", sent: false })).rejects.toThrow(/повторять нельзя/);
    expect(ev).toEqual([]);
  });

  it("«не прошёл», а перевод в сети есть — done, второй не уйдёт", async () => {
    heal.v = { kind: "done", hash: "H" };
    await resolveStuckStep("mb_1", sending, { name: "dev", sent: false });
    expect(ev).toEqual(["step:dev:done"]);
  });

  it("сеть подтвердила, что не ушла, — retry", async () => {
    heal.v = { kind: "retry", why: "x" };
    await resolveStuckStep("mb_1", sending, { name: "dev", sent: true });
    expect(ev).toEqual(["step:dev:retry"]);
  });

  it("сеть не решает (старше 12 ч) — слово владельца", async () => {
    heal.v = { kind: "owner", why: "старше 12 часов" };
    await resolveStuckStep("mb_1", sending, { name: "dev", sent: false });
    expect(ev).toEqual(["step:dev:retry"]);
  });
});
