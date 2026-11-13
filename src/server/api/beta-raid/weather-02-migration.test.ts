// Миграция weather-02 (погода в добыче шахт v2 и урожае полей): все пути выплаты и
// показа считают одним счётом — Σ(коэф − 1) по часам (шахты) и по секундам слотов
// (поля); при коэффициенте 1 прибавка — целый 0, и каждое число прежнее. Прогон на
// PGlite (прод-тела против новых, флаг нет / 'off' / 'on') — scratchpad batch25.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  fileURLToPath(new URL("../../../../migrations/weather-02-effects.sql", import.meta.url)),
  "utf8",
);
const flat = (x: string) => x.replace(/\s+/g, " ");
/** Тело функции: от CREATE до её «$fn$;». */
const body = (name: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION yuplink.${name}(`);
  expect(at, name).toBeGreaterThan(0);
  return flat(sql.slice(at, sql.indexOf("$fn$;", at)));
};

describe("weather-02-effects.sql", () => {
  it("одна транзакция; помощники — до функций, что их зовут", () => {
    expect(sql.trimStart().startsWith("--")).toBe(true);
    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    const first = sql.indexOf("FUNCTION yuplink.raid_mine_v2_settle(");
    for (const h of [
      "raid_mine_weather_delta(",
      "raid_mine_weather_slots(",
      "raid_field_weather_dsec(",
    ]) {
      expect(sql.indexOf(`FUNCTION yuplink.${h}`)).toBeGreaterThan(0);
      expect(sql.indexOf(`FUNCTION yuplink.${h}`)).toBeLessThan(first);
    }
  });

  it("при коэффициенте 1 прибавка — целый 0, слотов нет (NULL)", () => {
    expect(body("raid_mine_weather_delta")).toContain(
      "COALESCE(sum(c.k - 1) FILTER (WHERE c.k <> 1), 0)",
    );
    expect(body("raid_mine_weather_delta")).toContain("'mine')");
    expect(body("raid_field_weather_dsec")).toContain("FILTER (WHERE x.k <> 1), 0)");
    expect(body("raid_field_weather_dsec")).toContain("'farm')");
    expect(body("raid_mine_weather_slots")).toContain("CASE WHEN bool_or(x.k <> 1)");
    // Слот — тот же, что у ядра (raid_weather_slot), коэффициент — raid_weather_coef.
    expect(body("raid_mine_weather_slots")).toContain("yuplink.raid_weather_slot(p_from)");
  });

  it("целые часы — (часы + Σ(коэф − 1)) × ставка во всех путях", () => {
    expect(body("raid_mine_v2_settle")).toContain(
      "amount := round((due + yuplink.raid_mine_weather_delta(p_st.map_id, v_from, COALESCE(p_st.claimed_hours, 0), due)) * v_std * yuplink.raid_mine_mode_mult(p_st.mode), 4);",
    );
    expect(body("raid_mine_lose")).toContain(
      "amt := round((due + yuplink.raid_mine_weather_delta(p_map, v_from, COALESCE(st.claimed_hours, 0), due)) * v_yield, 4);",
    );
    expect(body("raid_mine_pending")).toContain(
      "RETURN round((v_due + yuplink.raid_mine_weather_delta(p_map, st.accrue_from, COALESCE(st.claimed_hours, 0), v_due)) * v_std * yuplink.raid_mine_mode_mult(st.mode), 4);",
    );
    expect(body("raid_dynamite_blue_mine")).toContain(
      "v_amt := round((v_due + yuplink.raid_mine_weather_delta(p_map, st.accrue_from, COALESCE(st.claimed_hours, 0), v_due)) * v_yield, 4);",
    );
  });

  it("неполный час — × коэффициент слота, где он начался (смена режима, поломка, синий)", () => {
    const tailAt =
      "secs => ((COALESCE(p_st.claimed_hours, 0) + s.due) * 3600)::double precision), 'mine')";
    expect(body("raid_mine_v2_close")).toContain(tailAt);
    expect(body("raid_mine_lose")).toContain(
      "secs => ((COALESCE(st.claimed_hours, 0) + due) * 3600)::double precision), 'mine')",
    );
    expect(body("raid_dynamite_blue_mine")).toContain(
      "secs => ((COALESCE(st.claimed_hours, 0) + v_due) * 3600)::double precision), 'mine')",
    );
  });

  it("ключи начисления и собранные часы — прежние (повтор не задваивает)", () => {
    expect(body("raid_mine_v2_settle")).toContain(
      "||':'||COALESCE(p_tag, '')||(COALESCE(p_st.claimed_hours, 0) + due)::text;",
    );
    expect(body("raid_mine_v2_settle")).toContain(
      "SET claimed_hours = COALESCE(claimed_hours, 0) + due",
    );
    expect(body("raid_mine_v2_close")).toContain("||':tail');");
  });

  it("поля: отрезок since…now — секунды × коэффициент своего слота (сбор и показ)", () => {
    expect(body("raid_field_settle")).toContain(
      "+ GREATEST(extract(epoch FROM (now()-since)) + yuplink.raid_field_weather_dsec(p_map, since, now()), 0)/3600.0 * (v_yield / n),",
    );
    expect(body("raid_field_pending")).toContain(
      "+ yuplink.raid_field_weather_dsec(p_map, w.since, now()), 0)/3600.0 * (v_yield / n);",
    );
  });

  it("грибы, старые шахты, начисление — не тронуты", () => {
    for (const f of [
      "raid_dmine_take",
      "raid_mine_claim",
      "raid_mine_credit",
      "raid_mine_v2_std",
      "raid_field_take",
    ]) {
      expect(sql).not.toContain(`FUNCTION yuplink.${f}(`);
    }
    // Ветка старых шахт и грибов в raid_mine_lose — прежняя (без погоды).
    expect(body("raid_mine_lose")).toContain(
      "due := floor(hrs - COALESCE(st.claimed_hours, 0)); IF due > 0 THEN amt := round(due * v_yield, 4); ELSE due := 0; END IF;",
    );
  });
});
