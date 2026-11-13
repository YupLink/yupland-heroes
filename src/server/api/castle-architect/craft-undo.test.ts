// Откат упавшей выдачи заготовки: ключ выдачи и возврат — один оператор, ответ
// читается строго (не разобрался — бросок, а не «успех» и не «вернули»).
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  answer: [] as unknown[],
  calls: [] as unknown[][],
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (...args: unknown[]) => {
    s.calls.push(args);
    return s.answer;
  },
}));

const { undoDeposit, undoSql } = await import("./craft-undo");

beforeEach(() => {
  s.answer = [];
  s.calls.length = 0;
});

describe("undoSql", () => {
  it("возврат зависит от строки запертого ключа, INSERT — верхний уровень", () => {
    const q = undoSql("bp:archbp_a_op1", "bp:a:op1");
    expect(
      q.trimStart().startsWith("WITH blk AS (\n       INSERT INTO yuplink.raid_backpack_op"),
    ).toBe(true);
    expect(q).toContain("ON CONFLICT (op) DO NOTHING");
    expect(q).toContain(
      "FROM blk\n        CROSS JOIN LATERAL yuplink.castle_architect_refund(blk.pay_op)",
    );
    // Был ли возврат раньше — по ключу оплаты, не по ключу рюкзака.
    expect(q).toContain("o.op_id = 'bp:a:op1' AND o.refunded_at IS NOT NULL");
  });

  it("кавычки в ключах экранируются", () => {
    expect(undoSql("bp:x'y", "p'q")).toContain("VALUES ('bp:x''y')");
  });
});

describe("undoDeposit", () => {
  const run = () => undoDeposit("bp:archbp_a_op1", "bp:a:op1");

  it("ключ заперли мы — refunded; без wrapJson", async () => {
    s.answer = [{ _row: { blocked: true, refunded: true, was_back: false } }];
    await expect(run()).resolves.toBe("refunded");
    expect(s.calls[0]).toHaveLength(1);
  });

  it("ключ стоял — landed; стоял и оплату вернули — gone (мост: _row строкой)", async () => {
    s.answer = [{ _row: JSON.stringify({ blocked: false, refunded: null, was_back: false }) }];
    await expect(run()).resolves.toBe("landed");
    s.answer = [{ _row: JSON.stringify({ blocked: false, refunded: null, was_back: true }) }];
    await expect(run()).resolves.toBe("gone");
  });

  it("ответ не разобрался — бросок", async () => {
    s.answer = [];
    await expect(run()).rejects.toThrow("не прочитан");
    s.answer = [{ _row: { blocked: false } }];
    await expect(run()).rejects.toThrow("не прочитан");
  });
});
