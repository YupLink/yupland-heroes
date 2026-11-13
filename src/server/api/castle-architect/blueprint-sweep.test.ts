// Добор оплаченных заготовок: ищет оплаты без возврата и без ключа выдачи
// (тот же ключ, что пишет craft.ts), возвращает их тем же атомарным откатом;
// одна сбойная строка не мешает остальным.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  due: [] as unknown[],
  /** Ответы отката по ключу оплаты: итог оператора или сбой. */
  undo: {} as Record<string, { blocked: boolean; was_back: boolean } | Error>,
  sql: [] as string[],
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string, opts?: { wrapJson?: boolean }) => {
    s.sql.push(sql);
    if (opts?.wrapJson) return s.due;
    const pay = /RETURNING '([^']*)'::text AS pay_op/.exec(sql)?.[1] ?? "";
    const a = s.undo[pay];
    if (a instanceof Error) throw a;
    return a ? [{ _row: a }] : [];
  },
}));

const { dueBlueprintsSql, sweepBlueprints } = await import("./blueprint-sweep");
const { depositNonceOf, depositOpOf, payOpOf } = await import("./craft-keys");

beforeEach(() => {
  s.due = [];
  s.undo = {};
  s.sql.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("ключи нажатия", () => {
  it("оплата и выдача — те же строки, что писал craft.ts", () => {
    expect(payOpOf("acc_me", "op-abcdefgh")).toBe("bp:acc_me:op-abcdefgh");
    expect(depositNonceOf("acc_me", "op-abcdefgh")).toBe("archbp_acc_me_op-abcdefgh");
    expect(depositOpOf("acc_me", "op-abcdefgh")).toBe("bp:archbp_acc_me_op-abcdefgh");
  });
});

describe("dueBlueprintsSql", () => {
  const q = dueBlueprintsSql(50);

  it("только оплаты заготовок без возврата, старше 10 мин и моложе 3 суток", () => {
    expect(q).toContain("o.kind = 'blueprint' AND o.refunded_at IS NULL");
    expect(q).toContain("o.created_at < now() - interval '10 minutes'");
    expect(q).toContain("o.created_at > now() - interval '3 days'");
    expect(q).toContain("ORDER BY o.created_at\n LIMIT 50;");
  });

  it("ключ выдачи выводится из ключа оплаты и ищется в журнале рюкзака", () => {
    const bp = "'bp:archbp_' || o.account_id || '_' || substr(o.op_id, length(o.account_id) + 5)";
    expect(q).toContain(`SELECT o.op_id AS pay_op, ${bp} AS bp_op`);
    expect(q).toContain(`NOT EXISTS (SELECT 1 FROM yuplink.raid_backpack_op b WHERE b.op = ${bp})`);
    expect(q).toContain("left(o.op_id, length(o.account_id) + 4) = 'bp:' || o.account_id || ':'");
  });

  it("предел — целое не меньше 1", () => {
    expect(dueBlueprintsSql(0)).toContain("LIMIT 1;");
    expect(dueBlueprintsSql(7.9)).toContain("LIMIT 7;");
  });
});

describe("sweepBlueprints", () => {
  it("возвращает зависшие, считает только свои возвраты", async () => {
    s.due = [
      { pay_op: "bp:a:op1", bp_op: "bp:archbp_a_op1" },
      { pay_op: "bp:b:op2", bp_op: "bp:archbp_b_op2" },
      { pay_op: "bp:c:op3", bp_op: "bp:archbp_c_op3" },
    ];
    s.undo = {
      "bp:a:op1": { blocked: true, was_back: false },
      // Выдача успела лечь между поиском и откатом — ничего не возвращаем.
      "bp:b:op2": { blocked: false, was_back: false },
      // Вернул другой процесс.
      "bp:c:op3": { blocked: false, was_back: true },
    };
    await expect(sweepBlueprints()).resolves.toBe(1);
    const undo = s.sql.filter((x) => /castle_architect_refund/.test(x));
    expect(undo).toHaveLength(3);
    expect(undo[0]).toContain("VALUES ('bp:archbp_a_op1')");
    expect(undo[0]).toContain("RETURNING 'bp:a:op1'::text AS pay_op");
  });

  it("сбой одной строки не мешает остальным; кривые строки пропускаются", async () => {
    s.due = [
      { pay_op: "bp:a:op1", bp_op: "bp:archbp_a_op1" },
      { pay_op: null, bp_op: "x" },
      { pay_op: "bp:b:op2", bp_op: "bp:archbp_b_op2" },
    ];
    s.undo = {
      "bp:a:op1": new Error("db down"),
      "bp:b:op2": { blocked: true, was_back: false },
    };
    await expect(sweepBlueprints()).resolves.toBe(1);
    expect(s.sql.filter((x) => /castle_architect_refund/.test(x))).toHaveLength(2);
  });

  it("нечего добирать — только поиск", async () => {
    await expect(sweepBlueprints()).resolves.toBe(0);
    expect(s.sql).toHaveLength(1);
  });
});
