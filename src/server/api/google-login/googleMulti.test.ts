// Мультиаккаунты в админке: журналы Google и кошелька вместе, разные аккаунты на одной метке.
import { describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ rows: [] as unknown[], sql: "" }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    st.sql = sql;
    return st.rows;
  },
}));

const { multiGroups, MULTI_SQL } = await import("./googleMulti");

describe("возможные мультиаккаунты", () => {
  it("обе таблицы входа, 90 дней, разные аккаунты (tg_id)", () => {
    expect(MULTI_SQL).toContain("yuplink.google_login_log");
    expect(MULTI_SQL).toContain("yuplink.wallet_login_log");
    expect(MULTI_SQL).toContain("interval '90 days'");
    expect(MULTI_SQL.match(/count\(DISTINCT tg_id\) > 1/g)).toHaveLength(3);
  });

  it("строки → группы; мусор отброшен, неизвестный признак — адрес", async () => {
    st.rows = [
      { by: "device", who: ["a@gmail.com", "b@gmail.com"] },
      { by: "fp", who: ["a@gmail.com", "old.near", 5] },
      { by: "что-то", who: null },
    ];
    expect(await multiGroups()).toEqual([
      { by: "device", who: ["a@gmail.com", "b@gmail.com"] },
      { by: "fp", who: ["a@gmail.com", "old.near"] },
      { by: "ip", who: [] },
    ]);
    expect(st.sql).toBe(MULTI_SQL);
  });
});
