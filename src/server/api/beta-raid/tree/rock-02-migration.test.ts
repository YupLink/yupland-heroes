// rock-02 (§8.79 п. 4, владелец 26.10.2026): поставленная игроком гора — «гора
// рядом» и для постановки каменной шахты; исключение rock-01 снято.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("migrations/rock-02-nature-planted-counts.sql", "utf8").replace(
  /\s+/g,
  " ",
);

describe("rock-02: поставленные горы считаются окружением", () => {
  it("гора-декор считается без проверки метки посадки", () => {
    expect(sql).toContain("count(*) FILTER (WHERE tg.nature = 'mountain' OR tt.name");
    expect(sql).not.toContain("planted_decor");
  });
  it("в одной транзакции, повтор безвреден", () => {
    expect(sql).toMatch(
      /^.*BEGIN; .*CREATE OR REPLACE FUNCTION yuplink\.raid_nature_around.*COMMIT;\s*$/,
    );
  });
});
