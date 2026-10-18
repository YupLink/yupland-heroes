// Частота привязки Solana: скрипт упирается в порог, игроки друг другу не мешают.
import { describe, expect, it, vi } from "vitest";

// База молчит — гард считает в памяти процесса (тот же порог).
vi.mock("../../db/mcpClient", () => ({
  mcpExec: vi.fn(async () => {
    throw new Error("db down");
  }),
}));

const { solanaLinkGate, SOLANA_LINK_LIMITS } = await import("./linkGate");

describe("solanaLinkGate", () => {
  it("код для подписи: 5 раз в минуту, шестой — «подожди минуту»", async () => {
    for (let i = 0; i < SOLANA_LINK_LIMITS.nonce.limit; i++) {
      await expect(solanaLinkGate("nonce", "acc_a")).resolves.toBeUndefined();
    }
    await expect(solanaLinkGate("nonce", "acc_a")).rejects.toThrow("подожди минуту");
  });

  it("у другого игрока и у другого шага — свой счёт", async () => {
    await expect(solanaLinkGate("nonce", "acc_b")).resolves.toBeUndefined();
    await expect(solanaLinkGate("attach", "acc_a")).resolves.toBeUndefined();
  });

  it("просмотр кошелька (Helius): 20 раз в минуту, дальше — подожди", async () => {
    for (let i = 0; i < SOLANA_LINK_LIMITS.status.limit; i++) {
      await expect(solanaLinkGate("status", "acc_d")).resolves.toBeUndefined();
    }
    await expect(solanaLinkGate("status", "acc_d")).rejects.toThrow();
  });

  it("привязка терпит повторы подписи: 10 попыток проходят", async () => {
    for (let i = 0; i < SOLANA_LINK_LIMITS.attach.limit; i++) {
      await expect(solanaLinkGate("attach", "acc_c")).resolves.toBeUndefined();
    }
    await expect(solanaLinkGate("attach", "acc_c")).rejects.toThrow();
  });
});
