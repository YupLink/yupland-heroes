// Захват шахты под локом шахты и только пока она на клетке: гонка «захватываю
// / DARAI-шахту забрали в рюкзак» не оставляет владения пустой клеткой.
import { describe, expect, it } from "vitest";
import { captureMineSql } from "./mine-capture-sql";

const flat = (x: string) => x.replace(/\s+/g, " ");

describe("захват шахты", () => {
  const sql = flat(
    captureMineSql({
      mapId: "rmap_1",
      q: 4,
      r: -2,
      account: "acc_1",
      wallet: "w1.tg",
      buildingId: "bld_'x",
    }),
  );

  it("лок шахты — отдельным оператором до захвата", () => {
    expect(sql).toContain("SELECT pg_advisory_xact_lock(hashtext('mine:rmap_1:4:-2')) AS l;");
    expect(sql.indexOf("'mine:rmap_1:4:-2'")).toBeLessThan(sql.indexOf("raid_mine_capture"));
  });

  it("raid_mine_capture — только пока на клетке та же постройка", () => {
    expect(sql).toContain(
      "yuplink.raid_mine_capture('rmap_1', 4, -2, 'acc_1', 'w1.tg') END AS old",
    );
    expect(sql).toContain(
      "FROM yuplink.raid_map_cells c WHERE c.map_id = 'rmap_1' AND c.q = 4 AND c.r = -2 AND c.building_id = 'bld_''x'",
    );
    expect(sql).toContain("SELECT NOT w.locked AS captured, w.locked");
  });

  it("замок шахтёра (§8.123): живой — raid_mine_capture не зовётся, под тем же локом", () => {
    expect(sql).toContain("CASE WHEN NOT w.locked THEN yuplink.raid_mine_capture(");
    expect(sql).toContain(
      "w.map_id = 'rmap_1' AND w.q = 4 AND w.r = -2 AND w.until > now() AND w.account_id = s.owner_account AND w.owner_since = s.captured_at",
    );
    expect(sql.indexOf("'mine:rmap_1:4:-2'")).toBeLessThan(sql.indexOf("raid_mine_ward"));
  });
});
