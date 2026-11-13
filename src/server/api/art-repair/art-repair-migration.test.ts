// Миграция art-repair-01 (ПРАВИЛА §8.72) сходится с правилами в коде: одна
// транзакция, повторный накат безвреден, замки в порядке «res: → строки
// артефактов → res_move», проверки владельца и износа до любых записей, сток
// res_ledger 'art_repair', ключ нажатия.
// Сам SQL прогнан на встроенном Postgres (PGlite) с заглушками таблиц прода и
// настоящей res_move: накат дважды; чужой, залоговый ('_hero_market'),
// неизношенный, герой, несуществующий — bad_item без записей; пустой выбор;
// сумма разошлась; нехватка золота и алмазов (числа «нужно/есть»); починка
// выбранных с дублем id (25 золота, износ 0); повтор ключа — тот же итог, без
// второго списания; «все» (эпик 50 + незнакомая редкость как обычный 5 + 1 алмаз);
// повтор «всех» — пусто; кривой ключ — исключение.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  fileURLToPath(new URL("../../../../migrations/art-repair-01.sql", import.meta.url)),
  "utf8",
);
const at = (s: string): number => {
  const i = sql.indexOf(s);
  if (i < 0) throw new Error(`нет в миграции: ${s}`);
  return i;
};

describe("миграция art-repair-01", () => {
  it("одной транзакцией, чужой лок ждём не дольше 5 с, не длиннее 250 строк", () => {
    expect(sql).toContain("BEGIN;\nSET LOCAL lock_timeout = '5s';");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql.split("\n").length).toBeLessThanOrEqual(250);
  });

  it("идемпотентна: только IF NOT EXISTS / OR REPLACE, данных не трогает", () => {
    expect(sql).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    expect(sql).not.toMatch(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/);
    expect(sql).not.toMatch(/CREATE FUNCTION/);
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|ALTER)\b/);
    // Единственная правка строк — износ в ноль внутри функции.
    expect(sql.match(/\bUPDATE yuplink\./g)).toHaveLength(1);
    expect(sql).toContain("UPDATE yuplink.user_game_item SET wear = 0 WHERE id = ANY (v_ids);");
  });

  it("замки: res: аккаунта → строки артефактов FOR UPDATE → res_move", () => {
    const lock = at("pg_advisory_xact_lock(hashtext('res:' || p_account))");
    expect(lock).toBeLessThan(at("FROM yuplink.art_repair_op o WHERE o.op_ref = v_ref"));
    expect(lock).toBeLessThan(at("ORDER BY u.id FOR UPDATE)"));
    expect(lock).toBeLessThan(at("ORDER BY u.id FOR UPDATE;"));
    expect(at("ORDER BY u.id FOR UPDATE;")).toBeLessThan(at("yuplink.res_move("));
  });

  it("каждый id: свой аккаунт, артефакт, изношен — иначе отказ до записей", () => {
    const check = at("WHEN u.account_id IS DISTINCT FROM p_account THEN 'foreign'");
    expect(sql).toContain("WHEN u.kind <> 'artifact' THEN 'not_artifact'");
    expect(sql).toContain("OR u.kind <> 'artifact' OR u.wear <= 0");
    expect(sql).toContain("'error', 'bad_item', 'id', v_bad.id, 'why', v_bad.why");
    expect(check).toBeLessThan(at("yuplink.res_move("));
    // «Все» — только свои и изношенные.
    expect(sql).toContain("WHERE u.account_id = p_account AND u.kind = 'artifact' AND u.wear > 0");
  });

  it("сумма — в базе по редкости шаблона, сверка с показанным и нехватка — до списания", () => {
    expect(sql).toContain("JOIN yuplink.mystic_item_template t ON t.id = u.template_id");
    expect(sql).toContain("ELSE 'common' END AS rk");
    const moved = at("'error', 'price_moved'");
    const short = at("'error', 'short'");
    expect(sql).toContain("'needGold', v_gold, 'haveGold', v_have_gold");
    expect(sql).toContain("'needDiamonds', v_dia, 'haveDiamonds', v_have_dia");
    expect(moved).toBeLessThan(at("yuplink.res_move("));
    expect(short).toBeLessThan(at("yuplink.res_move("));
  });

  it("списание — сток art_repair, свой ключ на золото и алмазы", () => {
    expect(sql).toContain(
      "yuplink.res_move(p_account, 'gold', -v_gold, 'art_repair', v_ref || ':gold')",
    );
    expect(sql).toContain(
      "yuplink.res_move(p_account, 'diamonds', -v_dia, 'art_repair', v_ref || ':diamonds')",
    );
    expect(sql).toContain("IF NOT v_ok THEN RAISE EXCEPTION 'art_repair_desync:%', v_ref;");
  });

  it("ключ нажатия: в пределах аккаунта, повтор — тот же итог без движений", () => {
    expect(sql).toContain("v_ref := 'artfix:' || p_account || ':' || p_op;");
    expect(sql).toContain(
      "IF FOUND THEN RETURN v_prev || jsonb_build_object('fresh', false); END IF;",
    );
    expect(sql).toContain("op_ref     text        PRIMARY KEY");
    // Тот же формат ключа, что у ручки (art-repair.ts, OP_RE).
    expect(sql).toContain("p_op !~ '^[A-Za-z0-9_-]{8,64}$'");
    expect(at("INSERT INTO yuplink.art_repair_op")).toBeGreaterThan(
      at("UPDATE yuplink.user_game_item"),
    );
  });
});
