// Строки «Добычи» со своей выдачей: клад и доля казино — каждый своей функцией.
import { describe, expect, it, vi } from "vitest";

const got = vi.hoisted(() => [] as string[]);
vi.mock("./treasure/treasure-harvest", () => ({
  claimTreasure: async (id: string) => void got.push(`treasure:${id}`),
}));
vi.mock("./casino/casino-share", () => ({
  claimCasinoShare: async (id: string) => void got.push(`casino:${id}`),
}));
const { claimSpecial } = await import("./raid-reward-special");

describe("claimSpecial", () => {
  it("клад и доля казино — по своим функциям; незнакомое — отказ", async () => {
    await claimSpecial("treasure", "trs_1", "w");
    await claimSpecial("casino_share", "2026-11-09:h1", "w");
    expect(got).toEqual(["treasure:trs_1", "casino:2026-11-09:h1"]);
    await expect(claimSpecial("gold", "x", "w")).rejects.toThrow("claimSpecial");
    const helpers = (await import("node:fs")).readFileSync(
      "src/server/api/raid-helpers.ts",
      "utf8",
    );
    // Доля казино без ссылки — тоже к своей выдаче (BAD_REF ждёт), не заявкой в «Выплаты».
    expect(helpers).toContain('kind === "casino_share" || (kind === "treasure" && packId)');
  });
});
