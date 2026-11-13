// Миграция mine-repair-all-01: функция базы «Починить всё» — одной транзакцией,
// локи всех шахт до денег, решение под локом, каждая клетка — raid_mine_repair.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  fileURLToPath(new URL("../../../../migrations/mine-repair-all-01.sql", import.meta.url)),
  "utf8",
);
const body = sql.replace(/--.*$/gm, "");

describe("миграция mine-repair-all-01", () => {
  it("одной транзакцией, чужой лок ждём не дольше 5 с, повтор безвреден", () => {
    expect(sql).toMatch(/^BEGIN;\nSET LOCAL lock_timeout = '5s';$/m);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(body).toContain(
      "CREATE OR REPLACE FUNCTION yuplink.raid_mine_repair_all(p_account text, p_wallet text, p_cells jsonb)",
    );
  });

  it("сначала локи всех шахт по порядку, потом проверки и починка", () => {
    const lock = body.indexOf("PERFORM pg_advisory_xact_lock(");
    const repair = body.indexOf("FROM yuplink.raid_mine_repair(");
    expect(lock).toBeGreaterThan(0);
    expect(repair).toBeGreaterThan(lock);
    expect(body.match(/ORDER BY e->>'map', \(e->>'q'\)::int, \(e->>'r'\)::int/g)).toHaveLength(2);
  });

  it("под локом: повтор ключа, сломанная, чужая, отметка запаса, поломка по now(), остров", () => {
    for (const st of ["again", "broken", "not_owner", "changed", "spent", "repaired"]) {
      expect(body).toContain(`o_status := '${st}'`);
    }
    expect(body).toContain(
      "floor(extract(epoch from st.life_at) * 1000) IS DISTINCT FROM (c->>'seen')::numeric",
    );
    expect(body).toContain(
      "yuplink.raid_mine_break_at(st.mode, st.life_left, st.life_at) <= now() + interval '5 seconds'",
    );
    expect(body).toContain("CASE WHEN v_island THEN 'base' ELSE st.mode END");
  });
});

describe("миграция mine-repair-all-02: порог ползунка на аккаунте", () => {
  const pref = readFileSync(
    fileURLToPath(new URL("../../../../migrations/mine-repair-all-02-pref.sql", import.meta.url)),
    "utf8",
  );
  it("колонка в account_view, доля 0..1, одной транзакцией, повтор безвреден", () => {
    expect(pref).toMatch(/^BEGIN;\nSET LOCAL lock_timeout = '5s';$/m);
    expect(pref.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(pref).toContain("ADD COLUMN IF NOT EXISTS mine_repair_below numeric");
    expect(pref).toContain("mine_repair_below > 0 AND mine_repair_below <= 1");
  });
});
