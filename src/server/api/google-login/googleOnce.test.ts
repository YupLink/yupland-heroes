// Токен Google одноразовый: метка — хэш токена, вставка «если нет»; повтор — false.
import { describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  sql: [] as Array<{ sql: string; opts: unknown }>,
  marks: new Set<string>(),
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string, opts: unknown) => {
    st.sql.push({ sql, opts });
    const mark = /VALUES \('([^']+)'/.exec(sql)?.[1] ?? "";
    if (st.marks.has(mark)) return [];
    st.marks.add(mark);
    return [{ nonce: mark }];
  },
}));

const { consumeGoogleToken } = await import("./googleOnce");

describe("одноразовый токен Google", () => {
  it("первый раз — true, повтор — false; сам токен в базу не пишется", async () => {
    expect(await consumeGoogleToken("token-A.payload.sig", 1_900_000_000)).toBe(true);
    expect(await consumeGoogleToken("token-A.payload.sig", 1_900_000_000)).toBe(false);
    expect(await consumeGoogleToken("token-B.payload.sig", 1_900_000_000)).toBe(true);
    const q = st.sql[0];
    expect(q.opts).toEqual({ wrapJsonCte: true });
    expect(q.sql).toContain("ON CONFLICT (nonce) DO NOTHING");
    expect(q.sql).toContain("to_timestamp(1900000060), true, 'google'");
    expect(q.sql).not.toContain("token-A");
    expect(q.sql).toMatch(/VALUES \('g:[A-Za-z0-9_-]{43}'/);
  });
});
