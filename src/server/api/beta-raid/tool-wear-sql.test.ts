// Текст SQL удара, отката и уборки прочности: лок героя отдельным оператором,
// ключ рубки, «инструмент занят», целая штука, остаток удара не переходит,
// откат — undone без удаления ключа. Арифметика формул сверена SELECT-ом на
// живой базе (только чтение); сценарии — tool-wear.test.
import { describe, expect, it } from "vitest";
import { hitSql, movableSql, settleSql, undoSql } from "./tool-wear";

const at = { heroId: "h1", stackKey: "custom:cst_axe", op: "wear:x" };

describe("SQL удара", () => {
  const sql = hitSql({ ...at, step: 30 });

  it("лок героя отдельным оператором, ключ рубки, целая штука", () => {
    expect(sql.startsWith("SELECT pg_advisory_xact_lock(hashtext('bp:h1')) AS l;")).toBe(true);
    expect(sql).toContain(
      "SELECT EXISTS (SELECT 1 FROM yuplink.raid_tool_wear_op WHERE op = 'wear:x' AND NOT undone) AS was",
    );
    // Откаченный ключ — не «удар был»: повтор нажатия после отказа даром не бьёт.
    expect(sql).toContain(
      "EXISTS (SELECT 1 FROM yuplink.raid_tool_wear_op WHERE op = 'wear:x' AND undone) AS dead",
    );
    expect(sql).toContain("b.count >= 1");
  });

  it("соседняя рубка в деле — не бьём: незакрытый чужой ключ моложе 30 с", () => {
    expect(sql).toContain("o.op <> 'wear:x'");
    expect(sql).toContain(
      "NOT o.settled AND NOT o.undone AND o.at > now() - interval '30 seconds'",
    );
    expect(sql).toMatch(/AND NOT \(SELECT was OR dead FROM prior\) AND NOT EXISTS/);
  });

  it("износ: дошло до 100 — штука ушла, следующая со 100 %, остаток не переходит", () => {
    expect(sql).toContain("CASE WHEN s.wear + 30 >= 100 THEN s.count - 1 ELSE s.count END");
    expect(sql).toContain("CASE WHEN s.wear + 30 >= 100 THEN 0 ELSE s.wear + 30 END");
    expect(sql).toContain("LEAST(30, 100 - s.wear) AS taken");
    expect(hitSql({ ...at, step: 500 })).toContain("s.wear + 100 >= 100");
  });
});

describe("SQL отката, уборки и «унести»", () => {
  it("откат: undone вместо удаления ключа, через ноль — штука назад; нет ключа — заглушка", () => {
    const sql = undoSql(at);
    expect(sql).toContain("SET undone = true");
    expect(sql).toContain("NOT cur.undone AND NOT cur.settled");
    expect(sql).not.toMatch(/DELETE FROM yuplink\.raid_tool_wear_op/);
    expect(sql).toContain("CASE WHEN b.wear < f.taken THEN b.count + 1 ELSE b.count END");
    expect(sql).toContain("THEN b.wear - f.taken + 100 ELSE b.wear - f.taken END");
    expect(sql).toMatch(/INSERT INTO yuplink\.raid_tool_wear_op[\s\S]*0, true WHERE NOT EXISTS/);
  });

  it("уборка: ключ закрыт, пустая строка — только старше 10 минут", () => {
    const sql = settleSql(at);
    expect(sql).toContain("SET settled = true WHERE op = 'wear:x'");
    expect(sql).toContain("count <= 0 AND wear = 0 AND updated_at < now() - interval '10 minutes'");
  });

  it("унести можно только целые: изношенная в счёт не идёт", () => {
    expect(movableSql("h1", "custom:cst_axe")).toContain(
      "GREATEST(0, count - CASE WHEN wear > 0 THEN 1 ELSE 0 END) AS count, wear > 0 AS worn",
    );
  });
});
