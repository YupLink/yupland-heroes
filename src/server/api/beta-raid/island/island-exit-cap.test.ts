// SQL потолка выноса: один раз (exit_cut IS NULL), журнал с ключом карта+ресурс, потолки из правила.
import { describe, expect, it, vi } from "vitest";

const calls: string[] = [];
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    calls.push(sql);
    return [{ exit_cut: { wood: 2950, gold: 0 } }];
  },
}));

const { exitCapSql, resBaseSql, applyExitCap } = await import("./island-exit-cap");

describe("потолок выноса — SQL", () => {
  it("срез один раз, журнал island_exit_cap с ключом карты, потолки 50/20/100/2", () => {
    const sql = exitCapSql("acc_A", "isle_X");
    expect(sql).toContain("exit_cut IS NULL");
    expect(sql).toContain("res_base IS NOT NULL");
    expect(sql).toContain("'island_exit_cap'");
    expect(sql).toContain("'islandcap:' || 'isle_X'");
    expect(sql).toContain("('wood', 50), ('stone', 20), ('gold', 100), ('diamonds', 2)");
  });

  it("снимок на старте — четыре ресурса аккаунта", () => {
    expect(resBaseSql("acc_A")).toContain("resource IN ('wood', 'stone', 'gold', 'diamonds')");
  });

  it("ответ — только то, что реально срезано", async () => {
    expect(await applyExitCap("acc_A", "isle_X")).toEqual({ wood: 2950 });
  });
});
