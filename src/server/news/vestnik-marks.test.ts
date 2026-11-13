import { describe, expect, it } from "vitest";
import { dayWindow } from "@/lib/news/vestnikWindow";
import { claimSql, finishSql, MAX_ATTEMPTS } from "./vestnik-marks";

const w = dayWindow(Date.parse("2026-10-30T12:00:00Z"));

describe("отметка выпуска", () => {
  it("захват: новая строка — первая попытка; повтор — только отказ (4 мин) или брошенный (15 мин)", () => {
    const sql = claimSql(w);
    expect(sql).toContain("'vestnik_sent:day_2026-10-30'");
    expect(sql).toContain("'sending|' || extract(epoch from now())::bigint || '|1'");
    expect(sql).toContain(`< ${MAX_ATTEMPTS}`);
    expect(sql).toContain(
      "= 'failed' AND split_part(s.value, '|', 2)::bigint < extract(epoch from now())::bigint - 240",
    );
    expect(sql).toContain(
      "= 'sending' AND split_part(s.value, '|', 2)::bigint < extract(epoch from now())::bigint - 900",
    );
    expect(sql).not.toContain("'sent'");
    expect(sql).toContain("RETURNING 1 AS ok");
  });

  it("итог: состояние, время, номер попытки", () => {
    const sql = finishSql(w, "unknown");
    expect(sql).toContain("SET value = 'unknown|'");
    expect(sql).toContain("WHERE s.key = 'vestnik_sent:day_2026-10-30'");
    expect(sql).toContain("AS attempts");
  });
});
