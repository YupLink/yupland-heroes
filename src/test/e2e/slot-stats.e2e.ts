// Статистика казино на боевой базе — только чтение (SELECT): строки игроков и итог.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", async () => ({
  mcpExec: (await import("./prodDb")).mcpExecViaPsql,
}));

const d = process.env.E2E_PROD === "1" ? describe : describe.skip;

d("статистика казино (только чтение)", () => {
  it("строки игроков и итог сходятся с журналом золота", async () => {
    const { slotStatsRows, slotTotals } = await import("@/server/api/slot/slot-stats");
    const { num } = await import("./prodDb");
    const rows = await slotStatsRows();
    const t = slotTotals(rows);
    console.log(JSON.stringify(t), rows.slice(0, 3).map((r) => [r.name, r.start, r.spins, r.wagered, r.net]));
    expect(rows.length).toBeGreaterThan(0);
    const ledger = num(
      `SELECT coalesce(sum(delta),0) FROM yuplink.res_ledger WHERE resource='gold' AND kind IN ('slot_spin','slot_risk','slot_bonus') AND account_id NOT LIKE 'zz_e2e%';`,
    );
    const mine = rows.filter((r) => !r.account.startsWith("zz_e2e")).reduce((s, r) => s + r.net, 0);
    expect(Math.round(mine)).toBe(Math.round(ledger));
  });
});
