// Миграция dynamite-08 (30.10.2026): подбитый корабль. Колонка blasted_at, частичный
// индекс и raid_dynamite_blast — тело dynamite-07 (на проде) с одной правкой: синий
// штампует blasted_at. Всё прежнее на месте и в том же порядке.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raw = readFileSync("migrations/dynamite-08-blasted-ship.sql", "utf8");
const sql = raw.replace(/\s+/g, " ");

/** Тело функции взрыва из файла миграции — построчно. */
function blastBody(text: string): string[] {
  const from = text.indexOf("CREATE OR REPLACE FUNCTION yuplink.raid_dynamite_blast(");
  const to = text.indexOf("END $fn$;", from);
  return text.slice(from, to).split("\n");
}

describe("миграция dynamite-08", () => {
  it("одна транзакция; колонка и индекс — идемпотентно, до функции", () => {
    expect(sql).toMatch(/^-- .*BEGIN; SET LOCAL lock_timeout = '2s';.*COMMIT; $/);
    expect(sql).toContain(
      "ALTER TABLE yuplink.beta_raid_ship ADD COLUMN IF NOT EXISTS blasted_at timestamptz;",
    );
    expect(sql).toContain(
      "CREATE INDEX IF NOT EXISTS beta_raid_ship_blasted ON yuplink.beta_raid_ship (map_id, q, r) WHERE blasted_at IS NOT NULL;",
    );
    expect(sql.indexOf("ADD COLUMN")).toBeLessThan(sql.indexOf("CREATE OR REPLACE FUNCTION"));
  });

  it("сигнатура та же, что в dynamite-07 (12 аргументов): DROP не нужен", () => {
    expect(sql).not.toContain("DROP FUNCTION");
    const head = (t: string) => blastBody(t)[0];
    expect(head(raw)).toBe(head(readFileSync("migrations/dynamite-07-fish-own-ship.sql", "utf8")));
  });

  it("тело — dynamite-07: каждая прежняя строка на месте и в том же порядке", () => {
    const prev = blastBody(readFileSync("migrations/dynamite-07-fish-own-ship.sql", "utf8"));
    const next = blastBody(raw);
    // Строки, которые правка меняет, — в их новом виде (комментарий ветки 1б).
    const changed = new Map([
      [
        "  --     схода с нулём (hp 0, без экипажа, штамп hp_zero_at): чинят досками, разбирают,",
        "  --     схода с нулём (hp 0, без экипажа, штамп hp_zero_at), и ПОДБИТЫ (штамп blasted_at,",
      ],
      [
        "  --     через 2 дня — уборка (ship-sweep). Экипаж — в итог ('crew') и crew_due ключа:",
        "  --     через час — уборка (ship-sweep). Экипаж — в итог ('crew') и crew_due ключа:",
      ],
    ]);
    let at = 0;
    for (const line of prev) {
      const want = changed.get(line) ?? line;
      const found = next.indexOf(want, at);
      expect(found, want).toBeGreaterThanOrEqual(at);
      at = found + 1;
    }
    // Добавлено ровно две строки комментария и одна строка UPDATE.
    expect(next.length - prev.length).toBe(2);
  });

  it("синий штампует blasted_at тем же UPDATE, что «разрушено»; повтор штамп не сдвигает", () => {
    expect(sql).toContain(
      "UPDATE yuplink.beta_raid_ship su SET hp = 0, hp_zero_at = COALESCE(su.hp_zero_at, now()), blasted_at = COALESCE(su.blasted_at, now()), crew_account = NULL, crew_wallet = NULL, updated_at = now() WHERE su.id = r_s.id;",
    );
    // Штамп ставится только в ветке синего по кораблям (1б), больше нигде.
    expect(sql.match(/blasted_at = /g)).toHaveLength(1);
    const at = (s: string) => sql.indexOf(s);
    expect(at("blasted_at = COALESCE")).toBeGreaterThan(at("-- 1б) Синий"));
    expect(at("blasted_at = COALESCE")).toBeLessThan(at("-- 1) Шахты, у которых"));
  });

  it("свой корабль бросившего синий по-прежнему не трогает", () => {
    expect(sql).toContain(
      "WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r AND (s.owner IS NULL OR s.owner NOT IN (p_account, p_wallet)) ORDER BY s.id FOR UPDATE OF s",
    );
  });
});
