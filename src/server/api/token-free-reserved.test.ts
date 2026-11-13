// «Свободно USDT» считает неполученные реферальные доллары обязательством —
// иначе обмен и раскладка раздали бы деньги пригласивших (ref-01).
import { describe, expect, it, vi } from "vitest";

vi.mock("./raid-shared", () => ({ sqlStr: (v: string) => `'${String(v).replace(/'/g, "''")}'` }));
vi.mock("./energy-sub/batch-left-sql", () => ({ batchTokenLeftSql: () => "0" }));

const { reservedSql } = await import("./token-free-reserved");

describe("резерв «Свободно USDT»", () => {
  it("неполученные 10 % с подписок друзей — в обязательствах", () => {
    const sql = reservedSql("USDT").replace(/\s+/g, " ");
    expect(sql).toContain(
      "(SELECT COALESCE(sum(amount), 0) FROM yuplink.ref_reward WHERE status = 'pending' AND kind = 'usdt' AND lower(token) = lower('USDT'))",
    );
  });
});
