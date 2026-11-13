// Миграция mushroom-04 (владелец, 22.10.2026: «защита на час») против правил —
// по тексту SQL: отметка созревания у строки гриба; «Забрать» созревающий гриб
// не даёт до энергии и под тем же локом шахты; защита — только своя ручная
// посадка, только в первый час, один раз, энергия тем же вызовом; совместима со
// старым кодом (подпись «Забрать» та же).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../../../migrations/${name}`, import.meta.url)),
    "utf8",
  );
const raw = read("mushroom-04-protect.sql");
const sql = raw.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");
const fnOf = (name: string) => {
  const from = sql.indexOf(`CREATE OR REPLACE FUNCTION yuplink.${name}(`);
  expect(from, name).toBeGreaterThan(0);
  return sql.slice(from, sql.indexOf("$fn$;", from));
};
const prev = read("mushroom-03-kinds-spawn.sql")
  .replace(/--[^\n]*/g, "")
  .replace(/\s+/g, " ");
const prevTake = prev.slice(
  prev.indexOf("CREATE OR REPLACE FUNCTION yuplink.raid_dmine_take("),
  prev.indexOf("$fn$;", prev.indexOf("CREATE OR REPLACE FUNCTION yuplink.raid_dmine_take(")),
);

describe("mushroom-04: созревание и «Забрать»", () => {
  it("одной транзакцией; отметка созревания — столбец, повтор безвреден", () => {
    expect(sql.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(raw.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain(
      "ALTER TABLE yuplink.raid_dmine ADD COLUMN IF NOT EXISTS ripe_at timestamptz;",
    );
  });

  it("«Забрать»: та же подпись и тело mushroom-03 плюс одна проверка", () => {
    const f = fnOf("raid_dmine_take");
    const check =
      "IF v_last.id IS NOT NULL AND v_last.ripe_at > now() THEN RAISE EXCEPTION 'dmine_unripe'; END IF; ";
    expect(f).toContain(check);
    expect(f.replace(check, "")).toBe(prevTake);
  });

  it("созревающий гриб не поднять: после лока шахты, до охраны и энергии", () => {
    const f = fnOf("raid_dmine_take");
    const at = f.indexOf("RAISE EXCEPTION 'dmine_unripe'");
    expect(f.indexOf("hashtext('mine:' || p_map")).toBeLessThan(at);
    expect(at).toBeLessThan(f.indexOf("RAISE EXCEPTION 'dmine_guarded'"));
    expect(at).toBeLessThan(f.indexOf("PERFORM yuplink.touch_energy_atomic(p_wallet, p_cost)"));
  });
});

describe("mushroom-04: «Защита на час»", () => {
  const f = fnOf("raid_mushroom_protect");

  it("только своя ручная посадка по её ключу; лок шахты клетки — как у «Забрать»", () => {
    expect(f).toContain(
      "IF p_place_op NOT LIKE 'dmplace:%' THEN RAISE EXCEPTION 'dmine_protect_gone';",
    );
    expect(f).toContain("WHERE op = p_place_op AND kind = 'place' AND account_id = p_account;");
    expect(f).toContain(
      "pg_advisory_xact_lock(hashtext('mine:' || o.map_id || ':' || o.q || ':' || o.r))",
    );
    expect(f).toContain(
      "IF v_owner IS DISTINCT FROM p_account THEN RAISE EXCEPTION 'dmine_protect_gone';",
    );
  });

  it("повтор нажатия — тот же ответ без списания; поднятый или умерший — отказ", () => {
    expect(f).toContain(
      "IF d.ripe_at IS NOT NULL THEN RETURN jsonb_build_object('was', true, 'ripeAt', d.ripe_at, 'paid', 0,",
    );
    expect(f).toContain(
      "IF d.state <> 'placed' OR d.lifted_at IS NOT NULL THEN RAISE EXCEPTION 'dmine_protect_gone';",
    );
    expect(f).toContain("(v_dies IS NOT NULL AND v_dies <= now())");
  });

  it("час от посадки, только пока он идёт; энергия до отметки, тем же вызовом", () => {
    expect(f).toContain("v_ripe := d.placed_at + interval '1 hour';");
    expect(f).toContain(
      "IF d.placed_at IS NULL OR v_ripe <= now() THEN RAISE EXCEPTION 'dmine_protect_late';",
    );
    const pay = f.indexOf("PERFORM yuplink.touch_energy_atomic(p_wallet, p_cost);");
    expect(pay).toBeGreaterThan(f.indexOf("'dmine_protect_late'"));
    expect(pay).toBeLessThan(
      f.indexOf("UPDATE yuplink.raid_dmine SET ripe_at = v_ripe WHERE id = d.id;"),
    );
  });
});
