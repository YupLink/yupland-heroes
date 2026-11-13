// rock-01 (§8.79): поставленная игроком гора — не природа для каменной шахты,
// иначе тремя купленными камнями вечную гору админа сносили бы навсегда.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("migrations/rock-01-nature-not-planted.sql", "utf8").replace(/\s+/g, " ");

describe("rock-01: горы вокруг без поставленных игроком", () => {
  it("гора-декор считается, только если её не ставил игрок", () => {
    expect(sql).toContain(
      "(tg.nature = 'mountain' AND c.planted_decor IS DISTINCT FROM c.decoration_id)",
    );
  });
  it("местность «Горы» и деревья — как раньше", () => {
    expect(sql).toContain("OR tt.name ~* '^\\s*(горы|высокогорье)\\s*$'");
    expect(sql).toContain("count(*) FILTER (WHERE tg.nature = 'tree')::int");
  });
  it("в одной транзакции, повтор безвреден", () => {
    expect(sql).toMatch(/^.*BEGIN; .*CREATE OR REPLACE FUNCTION .*COMMIT;\s*$/);
  });
});
