// «Закопать» пустую ямку (§8.24 п. 6б): кучка — бугорок с меткой, под локом
// клетки, только на ямке без мешочка и сундука; «Выкопать» снимает метку.
import { describe, expect, it } from "vitest";
import { DIG_EMPTY_KEY, DIG_HOLE_MINUTES } from "@/lib/digHole";
import { digSql } from "@/server/api/beta-raid/loot-bag/bag-dig-sql";
import { holeBuryFenceSql, holeBurySql } from "./hole-bury-sql";

const at = { mapId: "map_a", q: 3, r: -2, op: "hbury:acc_1:k1", account: "acc_1" };
const flat = (s: string) => s.replace(/\s+/g, " ");

describe("закопать ямку", () => {
  const sql = flat(holeBurySql({ ...at, nonce: "n1" }));

  it("лок — клетки, тот же у «забора»: двое разом — кучка одна", () => {
    const lock = "pg_advisory_xact_lock(hashtext('hbury:map_a:3:-2'))";
    expect(sql).toContain(lock);
    expect(flat(holeBuryFenceSql(at))).toContain(lock);
  });

  it("только на ямке (час), без живого мешочка и сундука", () => {
    expect(sql).toContain(`h.dug_at > now() - interval '${DIG_HOLE_MINUTES} minutes'`);
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag b");
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM yuplink.raid_plain_chest pc");
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc");
  });

  it("кучка закопана сразу, моя, с одной меткой на 24 ч", () => {
    expect(sql).toContain("now(), now(), 'acc_1' FROM ok");
    expect(sql).toContain(`'${DIG_EMPTY_KEY}', now() + interval '24 hours', 'empty'`);
  });
});

describe("выкопать кучку из пустой ямки", () => {
  const base = { bagId: "lb_x", op: "bagdig:acc_1:k", account: "acc_1", nonce: "n" };

  it("«Выкопать» снимает метку тем же оператором и отвечает empty", () => {
    const sql = flat(digSql({ ...base, bury: false }));
    expect(sql).toContain(
      `x.stack_key = '${DIG_EMPTY_KEY}' AND x.count > 0 AND EXISTS (SELECT 1 FROM upd)`,
    );
    expect(sql).toContain("EXISTS (SELECT 1 FROM empty) AS empty");
  });

  it("«Закопать» метку не трогает", () => {
    expect(flat(digSql({ ...base, bury: true }))).toContain("AND x.count > 0 AND false");
  });
});
