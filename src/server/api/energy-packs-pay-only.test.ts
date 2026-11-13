// Энергопак — только золото, DARAI и звёзды (владелец, 20.10.2026, §8.61):
// со счёта USDT/magicdust/RF/HOPE и по цене в $ — USDT сервер отклоняет до
// чтения пака; покупка за токен переводом закрыта целиком.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ reads: 0 }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
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
vi.mock("../auth", () => ({ requirePayoutsAdmin: vi.fn() }));
vi.mock("../maintenance", () => ({ assertNotMaintenance: () => {} }));
vi.mock("../rateGate", () => ({ moneyGate: async () => {} }));
vi.mock("./account-rollout", () => ({ requireAccountUser: async () => "w1" }));
vi.mock("./currency/move", () => ({ accAccountId: vi.fn(), accBalance: vi.fn() }));

type Fn = (a: { data: Record<string, unknown> }) => Promise<unknown>;
const { buyEnergyPackFromAccount } = await import("./energy-packs-account-pay");
const { buyEnergyPackForUsd } = await import("./energy-packs-usd-pay");
const { buyEnergyPackViaToken } = await import("./energy-packs-buy-token");

beforeEach(() => void (st.reads = 0));

describe("способы оплаты энергопака", () => {
  it("со счёта токеном (USDT, magicdust, RF, HOPE) — отказ ключом energy.pay_only", async () => {
    for (const symbol of ["USDT", "magicdust", "RF", "HOPE"]) {
      await expect(
        (buyEnergyPackFromAccount as unknown as Fn)({
          data: { packId: "p1", symbol, payKind: "token", opId: "op_12345678" },
        }),
      ).rejects.toThrow("energy.pay_only");
    }
    expect(st.reads).toBe(0);
  });

  it("со счёта DARAI — пропускает к паку", async () => {
    await expect(
      (buyEnergyPackFromAccount as unknown as Fn)({
        data: { packId: "p1", symbol: "Darai", payKind: "darai", opId: "op_12345678" },
      }),
    ).rejects.toThrow("Пак не найден");
    expect(st.reads).toBe(1);
  });

  it("по цене в $: USDT — отказ, звёзды — к паку", async () => {
    const usd = buyEnergyPackForUsd as unknown as Fn;
    await expect(
      usd({ data: { packId: "p1", token: "USDT", opId: "op_12345678" } }),
    ).rejects.toThrow("energy.pay_only");
    await expect(
      usd({ data: { packId: "p1", token: "STARS", opId: "op_12345678" } }),
    ).rejects.toThrow("Пак не найден");
  });

  it("переводом токена — закрыто", async () => {
    await expect(
      (buyEnergyPackViaToken as unknown as Fn)({ data: { packId: "p1", txHash: "x".repeat(44) } }),
    ).rejects.toThrow("energy.pay_only");
  });
});
