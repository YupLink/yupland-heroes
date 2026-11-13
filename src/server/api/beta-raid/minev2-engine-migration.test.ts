// Миграции движка шахт v2 (minev2-01..03, §8.59 п. 10): неполный час при
// закрытии отрезка (смена режима, починка своей, поломка) платится сразу и
// дробно, по ставке прежнего режима; при переводе — по старому выходу клетки;
// новое начало отрезка не раньше прежнего и не берёт эпоху чужого хвоста; у
// шахт одной карты после перевода эпохи разные. Суммы и ключи на живой
// базе проверяет прогон PGlite (scratchpad сессии c0139bc0, pgtest/run.mjs).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (f: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../migrations/${f}`, import.meta.url)), "utf8");
const m01 = read("minev2-01-engine.sql");
const m02 = read("minev2-02-engine-break.sql");
const m03 = read("minev2-03-engine-repair.sql");

/** Тело функции yuplink.<name> — от CREATE до первого «END $fn$;». */
function fn(sql: string, name: string): string {
  const at = sql.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION yuplink\\.${name}\\(`));
  if (at < 0) throw new Error(`нет функции ${name}`);
  return sql.slice(at, sql.indexOf("END $fn$;", at));
}

describe("миграции движка шахт v2", () => {
  it("каждая — одной транзакцией, с ограничением ожидания лока, не длиннее 250 строк", () => {
    for (const sql of [m01, m02, m03]) {
      expect(sql.trimStart().startsWith("--")).toBe(true);
      expect(sql).toContain("BEGIN;\nSET LOCAL lock_timeout = '5s';");
      expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
      expect(sql.split("\n").length).toBeLessThanOrEqual(250);
    }
  });

  it("закрытие отрезка: целые часы, затем остаток часа дробно по ставке прежнего режима", () => {
    const close = fn(m01, "raid_mine_v2_close");
    expect(close).toContain("yuplink.raid_mine_v2_settle(p_st, p_cfg, '')");
    expect(close).toMatch(/tail := trunc\(GREATEST\(0, extract\(epoch FROM \(LEAST\(now\(\),/);
    expect(close).not.toMatch(/tail := round\(/);
    expect(close).toContain("yuplink.raid_mine_break_at(p_st.mode, p_st.life_left, p_st.life_at)");
    expect(close).toContain("(COALESCE(p_st.claimed_hours, 0) + s.due)");
    expect(close).toContain("* v_std * yuplink.raid_mine_mode_mult(p_st.mode), 4)");
    expect(close).toContain("extract(epoch FROM p_st.accrue_from)::bigint||':tail'");
    expect(close).toContain("amount := s.amount + tail;");
    expect(close).not.toMatch(/floor\(/);
  });

  it("новое начало отрезка: +1 с, пока на клетке есть хвост с той же эпохой", () => {
    const start = fn(m01, "raid_mine_v2_start");
    expect(start).toContain("FROM yuplink.res_ledger l");
    expect(start).toContain("l.kind = 'mine'");
    expect(start).toContain("extract(epoch FROM v)::bigint||':tail'");
    expect(start).toContain("v := v + interval '1 second';");
  });

  it("поломка, смена режима и починка своей закрывают отрезок целиком", () => {
    const brk = fn(m02, "raid_mine_break");
    expect(brk).toContain("yuplink.raid_mine_v2_close(st, cfg)");
    expect(brk).toContain("amount := cl.amount;");
    expect(brk).not.toMatch(/floor\(/);
    for (const name of ["raid_mine_set_mode", "raid_mine_repair"]) {
      const body = fn(m03, name);
      expect(body, name).toContain("yuplink.raid_mine_v2_close(st, cfg)");
      expect(body, name).toContain(
        "accrue_from = yuplink.raid_mine_v2_start(p_map, p_q, p_r, GREATEST(now(), st.accrue_from))",
      );
      expect(body, name).toMatch(/claimed_hours = 0/);
    }
    expect(fn(m03, "raid_mine_set_mode")).toContain("credited := cl.amount;");
  });

  it("перенос остатка по выработке удалён; отрезок v2 не начинается раньше прежнего", () => {
    expect(m03).toContain(
      "DROP FUNCTION IF EXISTS yuplink.raid_mine_carry_from(timestamptz, numeric, text, text);",
    );
    expect(`${m01}${m02}${m03}`).not.toMatch(/raid_mine_carry_from\(x\./);
    expect(fn(m02, "raid_mine_capture_v2")).toContain(
      "accrue_from = yuplink.raid_mine_v2_start(p_map, p_q, p_r, GREATEST(now(), st.accrue_from))",
    );
    for (const sql of [m02, m03]) expect(sql).not.toMatch(/accrue_from\s*=\s*now\(\)/);
    // С голого now() — только новая строка починки (прежнего отрезка нет).
    const bare = "raid_mine_v2_start(p_map, p_q, p_r, now())";
    expect(fn(m02, "raid_mine_capture_v2")).not.toContain(bare);
    expect(fn(m03, "raid_mine_set_mode")).not.toContain(bare);
    expect(fn(m03, "raid_mine_repair").split(bare)).toHaveLength(2);
  });

  it("перевод: остаток часа по старому выходу до начала отрезка; эпохи карты разные у любых хозяев", () => {
    const tr = m03.slice(m03.indexOf("DO $$"));
    expect(tr).toContain("extract(epoch FROM st.captured_at)::bigint||':'");
    expect(tr).toContain(
      "round(due * v_yield, 4), v_ref||(COALESCE(st.claimed_hours, 0) + due)::text",
    );
    expect(tr).toMatch(/v_tail := CASE WHEN v_capped OR v_yield <= 0 THEN 0/);
    expect(tr).toContain("extract(epoch FROM (v_from - st.captured_at)) / 3600.0");
    expect(tr).toContain("v_tail, v_ref||'tail'");
    expect(tr).toContain("yuplink.raid_mine_v2_start(st.map_id, st.q, st.r, v_from)");
    expect(tr).toContain("WHERE x.map_id = st.map_id AND (x.q, x.r) <> (st.q, st.r)");
    expect(tr).not.toContain("owner_account = st.owner_account");
    expect(tr).toContain("accrue_from = v_from, claimed_hours = 0");
  });
});
