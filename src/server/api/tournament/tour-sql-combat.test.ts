// «Урон» и «Убийства»: босс с удалённым шаблоном засчитывается, сундуки — нет.
import { describe, expect, it } from "vitest";
import { BOSS_RUN_SQL, combatSrcSql } from "@/server/api/tournament/tour-sql-combat";
import { syncSql } from "@/server/api/tournament/tour-sql";

const flat = (s: string) => s.replace(/\s+/g, " ");

describe("кто босс в журнале ударов", () => {
  it("живой шаблон — как раньше, по raid_boss_template (и с префиксом клетки)", () => {
    const sql = flat(BOSS_RUN_SQL);
    expect(sql).toContain(
      "EXISTS (SELECT 1 FROM yuplink.raid_boss_template bt WHERE bt.id = regexp_replace(o.object_id, '^boss:', ''))",
    );
  });

  it("удалённый шаблон — по префиксу справочника боссов, если это не предмет", () => {
    const sql = flat(BOSS_RUN_SQL);
    expect(sql).toContain("OR (regexp_replace(o.object_id, '^boss:', '') ~ '^rbt_'");
    expect(sql).toContain(
      "AND NOT EXISTS (SELECT 1 FROM yuplink.mystic_item_template m WHERE m.id = regexp_replace(o.object_id, '^boss:', ''))",
    );
  });

  it("строки шаблона больше не требуется: JOIN заменён условием", () => {
    const sql = flat(syncSql("tour_1", "damage") ?? "");
    expect(sql).not.toContain("JOIN yuplink.raid_boss_template");
    expect(sql).toContain(flat(BOSS_RUN_SQL));
  });
});

describe("источник очков", () => {
  it("урон — сколько снято, только боевые удары", () => {
    const sql = flat(combatSrcSql(false));
    expect(sql).toContain("o.damage::numeric AS qty");
    expect(sql).toContain("WHERE o.rounds > 0 AND o.damage > 0 AND (EXISTS");
    expect(sql).toContain("'run:' || o.id AS ref");
  });

  it("убийства — последний удар, по 1, с тем же ключом удара", () => {
    const sql = flat(combatSrcSql(true));
    expect(sql).toContain("1::numeric AS qty");
    expect(sql).toContain("WHERE o.rounds > 0 AND o.killed AND (EXISTS");
    expect(sql).toContain("o.created_at >= w.since AND o.created_at < w.till");
  });
});
