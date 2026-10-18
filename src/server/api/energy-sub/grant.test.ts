// Выдача дней подписки: процесс помнит, когда наступит следующий день, и до
// того в базу не ходит; покупка (force) идёт мимо памяти. База подменена.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = { calls: 0, nextMs: null as number | null };

vi.mock("../../db/mcpClient", () => ({
  mcpExec: vi.fn(async () => {
    st.calls++;
    return [{ _row: { days: 1, missed: 0, gifts: 2, next_ms: st.nextMs } }];
  }),
}));
vi.mock("../raid-shared", () => ({ sqlStr: (v: string) => `'${String(v).replace(/'/g, "''")}'` }));

const { grantDueForAccount, grantSql } = await import("./grant");

beforeEach(() => {
  st.calls = 0;
});

describe("выдача дней подписки", () => {
  it("до начала следующего дня повторный опрос в базу не ходит", async () => {
    st.nextMs = Date.now() + 3_600_000;
    await grantDueForAccount("acc_A");
    const r = await grantDueForAccount("acc_A");
    expect(st.calls).toBe(1);
    expect(r).toEqual({ days: 0, missed: 0, gifts: 0 });
  });

  it("покупка выдаёт день 1 мимо памяти", async () => {
    st.nextMs = Date.now() + 3_600_000;
    await grantDueForAccount("acc_B");
    await grantDueForAccount("acc_B", { force: true });
    expect(st.calls).toBe(2);
  });

  it("день наступил — снова в базу", async () => {
    st.nextMs = Date.now() - 1;
    await grantDueForAccount("acc_C");
    await grantDueForAccount("acc_C");
    expect(st.calls).toBe(2);
  });

  it("подписок нет — перепроверка не чаще раза в 5 минут", async () => {
    st.nextMs = null;
    await grantDueForAccount("acc_D");
    await grantDueForAccount("acc_D");
    expect(st.calls).toBe(1);
  });

  it("запрос: срок подарка от начала дня, повтор упирается в ключи", () => {
    const sql = grantSql("acc_'x").replace(/\s+/g, " ");
    expect(sql).toContain("s.account_id = 'acc_''x'");
    // подарок дня ждёт сутки от начала дня (забрать день в день)
    expect(sql).toContain("d.day_at + interval '24 hours'");
    expect(sql).toContain("ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING");
    expect(sql).toContain("AS next_ms");
  });
});
