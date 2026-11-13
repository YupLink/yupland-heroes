// Миграция achv-fix-02 (владелец 22.10.2026: «по ачивке — сделай пересчёт,
// каждые 1к дараи = 1 очко») против правил — по тексту SQL: одна транзакция,
// копия до правки, повтор ничего не меняет, DARAI из журнала сборов (без
// отдачи при захвате), окна времени, то же деление, что у кода, и те же пороги
// и прибавки в таблице «было → стало».
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DARAI_PER_MINELORD_POINT } from "@/lib/achievements/minelord";
import { ACH_TRACKS, RARITY_BONUS } from "@/lib/achievements/tracks";

const raw = readFileSync(
  fileURLToPath(new URL("../../../../migrations/achv-fix-02-darai-recount.sql", import.meta.url)),
  "utf8",
);
const sql = raw
  .replace(/--[^\n]*/g, "")
  .replace(/\s+/g, " ")
  .trim();
const BAK = "yuplink.achv02_minelord_bak_20261022";

describe("achv-fix-02: пересчёт DARAI в «Хозяине шахт»", () => {
  it("одной транзакцией, с копией до правки", () => {
    expect(sql.startsWith("BEGIN;")).toBe(true);
    expect(sql.endsWith("COMMIT;")).toBe(true);
    expect(sql.match(/COMMIT;/g)).toHaveLength(1);
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${BAK} (`);
    expect(sql).toMatch(/count_before bigint NOT NULL/);
  });

  it("повтор безвреден: план пуст, если копия уже есть; запись — только по плану", () => {
    expect(sql).toContain(`AND NOT EXISTS (SELECT 1 FROM ${BAK})`);
    expect(sql).toContain("ON CONFLICT (account_id) DO NOTHING");
    expect(sql).toContain(`FROM ${BAK} b JOIN achv02_plan p USING (account_id)`);
    // Разница поверх счёта под замком, а не перезапись числом из плана.
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("count = yuplink.account_achievement.count + EXCLUDED.count");
  });

  it("DARAI — сборы с шахт из журнала, без отдачи при захвате, в окнах выкатов", () => {
    expect(sql).toContain("l.kind = 'mine' AND l.token = 'Darai'");
    expect(sql).toContain("l.ref !~ ':cap[0-9.]*$'");
    expect(sql).toContain("l.created_at >= '2026-10-16 22:15:00+00'");
    expect(sql).toContain("FILTER (WHERE l.created_at < '2026-10-22 18:17:35+00')");
    expect(sql).toContain("FILTER (WHERE l.created_at >= '2026-10-22 18:17:35+00')");
  });

  it("новый счёт: убрать 1 к 1, добавить очко за 1 000 — то же деление, что у кода", () => {
    expect(DARAI_PER_MINELORD_POINT).toBe(1000);
    expect(sql).toContain(
      "GREATEST(0, COALESCE(a.count, 0) - floor(p.d1)::bigint) " +
        `+ floor(p.d1 / ${DARAI_PER_MINELORD_POINT})::bigint ` +
        `+ floor(p.d2 / ${DARAI_PER_MINELORD_POINT})::bigint`,
    );
  });

  it("таблица «было → стало» — пороги и прибавки ачивки из кода, до COMMIT", () => {
    expect(sql).toContain(`unnest(ARRAY[${ACH_TRACKS.minelord.targets.join(",")}])`);
    expect(sql).toContain(`ARRAY[0,${RARITY_BONUS.join(",")}]`);
    expect(sql.indexOf("AS rarity_now")).toBeLessThan(sql.indexOf("COMMIT;"));
  });
});
