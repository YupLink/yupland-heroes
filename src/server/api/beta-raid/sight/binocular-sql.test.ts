// SQL бинокля: лок рюкзака до WITH, списание под ключом, эффект — продление срока.
import { describe, expect, it } from "vitest";
import { binocularSql } from "./binocular-use";
import { sightRadiusSql } from "./sight-sql";

const sql = binocularSql({
  op: "op_123456",
  mark: "sight#m",
  heroId: "h1",
  account: "acc1",
  qty: 20,
  effectId: "eff_x",
});

describe("binocularSql", () => {
  it("лок рюкзака героя — отдельным оператором до WITH", () => {
    expect(sql.indexOf("pg_advisory_xact_lock(hashtext('bp:h1'))")).toBeLessThan(
      sql.indexOf("WITH"),
    );
  });
  it("тратит только товар с галочкой «бинокль» и не больше, чем есть", () => {
    expect(sql).toContain("ci.is_binocular");
    expect(sql).toContain("h.count >= 20");
    expect(sql).toContain("FOR UPDATE OF h");
  });
  it("20 биноклей — час обзора 40, срок продлевается", () => {
    expect(sql).toContain("interval '60 minutes'");
    expect(sql).toContain("'sight', 40");
    expect(sql).toContain("GREATEST(yuplink.beta_raid_player_effects.expires_at, now())");
  });
  it("эффект и списание — только под своим ключом", () => {
    expect(sql).toContain("WHERE EXISTS (SELECT 1 FROM mark)");
    expect(sql).toContain("ON CONFLICT (op) DO NOTHING");
  });
});

describe("sightRadiusSql", () => {
  it("40 под действующим биноклем, иначе 20", () => {
    const s = sightRadiusSql("'acc1'");
    expect(s).toContain("se.kind = 'sight'");
    expect(s).toContain("se.expires_at > now()");
    expect(s).toContain("THEN 40 ELSE 20");
  });
});
