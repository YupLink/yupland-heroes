// Миграция minev2-70 (уровни шахт, §8.74): числа уровней в SQL — те же, что в
// lib/mineLevels; остров в стандарте не тронут; расчёт золотых шахт по старой
// ставке стоит ДО замены стандарта; улучшение — под локом шахты, повтор ключа
// до проверок, уровень сверяется, цена — res_move с проверкой applied.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MINE_LEVEL_YIELD } from "@/lib/mineLevels";

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../migrations/${name}`, import.meta.url)), "utf8");
const sql = read("minev2-70-levels.sql");
/** minev2-71 — золото 1/5/10/20; последнее слово по числам уровней — minev2-82 (5/10/25/50). */
const sql71 = read("minev2-71-gold-levels.sql");
const sql82 = read("minev2-82-gold-5-50.sql");
const sql80 = read("minev2-80-surroundings.sql");

describe("minev2-70-levels.sql", () => {
  it("добыча по уровням (последняя миграция) — как lib/mineLevels", () => {
    for (const [res, ys] of Object.entries(MINE_LEVEL_YIELD)) {
      expect(sql82).toContain(`WHEN '${res}' THEN ARRAY[${ys.join(", ")}]::numeric[]`);
    }
  });

  it("minev2-71: золото рассчитано по ставке 10 до смены чисел, стандарт пересоздан тем же телом", () => {
    const settle = sql71.indexOf("raid_mine_v2_close(st, cfg);");
    const yields = sql71.indexOf("CREATE OR REPLACE FUNCTION yuplink.raid_mine_level_yields");
    expect(settle).toBeGreaterThan(0);
    expect(yields).toBeGreaterThan(settle);
    const std = (src: string) =>
      src.slice(
        src.indexOf("CREATE OR REPLACE FUNCTION yuplink.raid_mine_v2_std"),
        src.indexOf("$fn$;", src.indexOf("FUNCTION yuplink.raid_mine_v2_std")),
      );
    expect(std(sql71)).toBe(std(sql));
  });

  it("minev2-82: золото рассчитано по прежней ставке до смены чисел, стандарт — тело с окружением", () => {
    const settle = sql82.indexOf("raid_mine_v2_close(st, cfg);");
    const yields = sql82.indexOf("CREATE OR REPLACE FUNCTION yuplink.raid_mine_level_yields");
    expect(settle).toBeGreaterThan(0);
    expect(yields).toBeGreaterThan(settle);
    const body = (src: string) => {
      const at = src.indexOf("FUNCTION yuplink.raid_mine_v2_std");
      return src.slice(src.indexOf("SELECT CASE", at), src.indexOf("END::numeric", at));
    };
    expect(body(sql82)).toBe(body(sql80));
  });

  it("остров — прежние числа: 1 в час, алмаз 1/24", () => {
    expect(sql).toContain("WHEN 'wood' THEN 1 WHEN 'stone' THEN 1 WHEN 'gold' THEN 1");
    expect(sql).toContain("WHEN 'diamonds' THEN 1::numeric / 24");
  });

  it("золото рассчитано по старой ставке до замены стандарта", () => {
    const settle = sql.indexOf("raid_mine_v2_close(st, cfg);\n    UPDATE");
    const std = sql.indexOf("CREATE OR REPLACE FUNCTION yuplink.raid_mine_v2_std");
    expect(settle).toBeGreaterThan(0);
    expect(std).toBeGreaterThan(settle);
  });

  it("улучшение: лок, повтор ключа первым, сверка уровня, applied у списания", () => {
    const body = sql.slice(sql.indexOf("FUNCTION yuplink.raid_mine_upgrade"));
    const lock = body.indexOf("pg_advisory_xact_lock(hashtext('mine:'");
    const replay = body.indexOf("FROM yuplink.raid_mine_op o WHERE o.op = p_op");
    const level = body.indexOf("'mine_level_changed'");
    expect(lock).toBeGreaterThan(0);
    expect(replay).toBeGreaterThan(lock);
    expect(level).toBeGreaterThan(replay);
    expect(body).toContain("'mine_upgrade'");
    expect(body).toContain("IF NOT COALESCE(mv.applied, false)");
    expect(body).toContain("'mine_island_level'");
    // Уровень — из колонки, edit_seq +1: черновик редактора его не затрёт.
    expect(body).toContain("jsonb_set(COALESCE(c.building_config, '{}'::jsonb), '{mineLevel}'");
    expect(body).toContain("UPDATE yuplink.raid_maps SET edit_seq = COALESCE(edit_seq, 0) + 1");
  });
});
