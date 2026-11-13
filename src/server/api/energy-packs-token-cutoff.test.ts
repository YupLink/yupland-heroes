// Энергопак за токен (USDT, magicdust, RF…) не продаётся (§8.61) — и в догонах:
// «восстановить по хешу» берёт только DARAI; зачёт перевода по memo — DARAI
// всегда, токен — только если блок раньше среза (lib/energyPayAllowed).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ENERGY_TOKEN_PAY_CUTOFF_MS, isEnergyTransferAccepted } from "@/lib/energyPayAllowed";

const st = vi.hoisted(() => ({ reads: 0, sql: 0 }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("../auth", () => ({ getCurrentWallet: () => "w1", isAdminWallet: () => false }));
vi.mock("../db/pg", () => ({
  pg: {
    energyPacks: {
      findOne: async () => {
        st.reads++;
        return null;
      },
    },
  },
  sb: { rpc: vi.fn() },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async () => {
    st.sql++;
    return [];
  },
}));
vi.mock("../rateGate", () => ({ moneyGate: async () => {} }));
vi.mock("./user-shared", () => ({
  accountOf: async () => "acc_1",
  getSisterWallets: async () => ["w1"],
}));

type Fn = (a: { data: Record<string, unknown> }) => Promise<unknown>;
const { recoverMyEnergyPurchase } = await import("./energy-packs-recover");
const { settleEnergyTransfer } = await import("./lost-payments-energy-settle");

beforeEach(() => {
  st.reads = 0;
  st.sql = 0;
});

const pack = {
  id: "p1",
  amount: 10,
  price_steps: null,
  price_token_symbol: "USDT",
  price_token_amount: 1,
  price_darai: 100,
};
const settle = (symbol: string, blockMs: number) =>
  settleEnergyTransfer({
    tx: "tx_" + "x".repeat(40),
    symbol,
    paid: 5,
    packs: new Map([["p1", pack]]),
    memo: "buy energy pack p1",
    signer: "w1",
    blockMs,
  });

describe("восстановление по хешу", () => {
  it("токеном (USDT, magicdust, RF) — отказ energy.pay_only до чтения пака", async () => {
    const recover = recoverMyEnergyPurchase as unknown as Fn;
    for (const tokenSymbol of ["USDT", "magicdust", "RF"]) {
      await expect(
        recover({ data: { packId: "p1", txHash: "x".repeat(44), tokenSymbol } }),
      ).rejects.toThrow("energy.pay_only");
    }
    expect(st.reads).toBe(0);
  });

  it("DARAI или без символа — к паку", async () => {
    const recover = recoverMyEnergyPurchase as unknown as Fn;
    await expect(recover({ data: { packId: "p1", txHash: "x".repeat(44) } })).rejects.toThrow(
      "Пак не найден",
    );
    await expect(
      recover({ data: { packId: "p1", txHash: "x".repeat(44), tokenSymbol: "$DARAI" } }),
    ).rejects.toThrow("Пак не найден");
    expect(st.reads).toBe(2);
  });
});

describe("зачёт перевода по memo", () => {
  const after = ENERGY_TOKEN_PAY_CUTOFF_MS + 60_000;
  const before = ENERGY_TOKEN_PAY_CUTOFF_MS - 60_000;

  it("токен после среза — не зачитывается, в базу не ходит", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await settle("USDT", after)).toEqual({ ok: false, reason: "not_allowed" });
    expect(await settle("magicdust", NaN)).toEqual({ ok: false, reason: "not_allowed" });
    expect(st.sql).toBe(0);
  });

  it("токен до среза и DARAI в любое время — проходят к проверке суммы", async () => {
    await settle("USDT", before);
    await settle("Darai", after);
    expect(st.sql).toBe(2);
  });

  it("isEnergyTransferAccepted", () => {
    expect(isEnergyTransferAccepted("DARAI", NaN)).toBe(true);
    expect(isEnergyTransferAccepted("$DARAI", after)).toBe(true);
    expect(isEnergyTransferAccepted("USDT", before)).toBe(true);
    expect(isEnergyTransferAccepted("USDT", after)).toBe(false);
    expect(isEnergyTransferAccepted("RF", NaN)).toBe(false);
  });
});
