// Перенос сундука (режим бога): строка сундука едет как есть (хозяин,
// закопанность), содержимое — по id или по хозяину — едет само, охрана
// магического — с ним, входы «Открыть» гаснут. Цель — CELL_HELD. Отказ — до
// записи, повтор — «уже там». Базы нет — читаем текст.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import {
  chestWriteNames,
  moveChestSql,
  parseChestRow,
  type ChestAt,
} from "@/server/api/beta-raid/god-move/move-chest-sql";
import {
  DST,
  SRC,
  WRITE_RE,
  cteOf,
  flat,
  writtenTables,
} from "@/server/api/beta-raid/god-move/move-sql.fixture";

const base = { mapId: "rmap_x", from: { q: 4, r: -2 }, to: { q: 7, r: 1 } };
const magic: ChestAt = { ...base, magic: true, ref: "acc_owner" };
const plain: ChestAt = { ...base, magic: false, ref: "pc_abc" };
const mSql = flat(moveChestSql(magic));
const pSql = flat(moveChestSql(plain));

describe("перенос магического сундука", () => {
  const cte = (n: string) => cteOf(mSql, n);

  it("локи: карта, сеть хозяина, клетки сундука по порядку; охрана, сундук и клетки — FOR UPDATE", () => {
    expect(
      mSql.startsWith(
        "SELECT pg_advisory_xact_lock(hashtext('godmove:rmap_x')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('chest:acc_owner')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('chestcell:rmap_x:4:-2')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('chestcell:rmap_x:7:1')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('decor-respawn')) AS l; " +
          `SELECT 1 FROM yuplink.raid_mine_guard g WHERE ${SRC("g")} FOR UPDATE; ` +
          `SELECT 1 FROM yuplink.raid_magic_chest x WHERE ${SRC("x")} FOR UPDATE; ` +
          "SELECT 1 FROM yuplink.raid_map_cells c",
      ),
    ).toBe(true);
  });

  it("тот самый сундук (хозяин), охрана на клетке здания — отказ, цель — CELL_HELD", () => {
    const chk = cte("chk");
    expect(chk).toContain(
      "WHEN NOT (EXISTS (SELECT 1 FROM mc_a) OR EXISTS (SELECT 1 FROM pc_a)) THEN CASE WHEN EXISTS",
    );
    expect(chk).toContain(
      `${DST("x")} AND x.owner_account = 'acc_owner') THEN 'already' ELSE 'gone' END`,
    );
    expect(chk).toContain(
      "WHEN NOT EXISTS (SELECT 1 FROM mc_a WHERE mc_a.owner_account = 'acc_owner') THEN 'changed'",
    );
    expect(chk).toContain("THEN 'chest_guard'");
    for (const r of ["water", "dome", "building", "obj", "chest", "guard"])
      expect(chk).toContain(`WHEN (SELECT f.${r} FROM f)`);
    // Любой декор на цели — отказ: под ним бугорок не виден и не выкапывается.
    expect(chk).toContain("WHEN (SELECT dst.decor FROM dst) THEN 'target_decor'");
    expect(chk).toContain(
      "WHEN NOT EXISTS (SELECT 1 FROM dst WHERE dst.ground) THEN 'target_missing'",
    );
    expect(cte("dst")).toContain("c.decoration_id IS NOT NULL AS decor");
    expect(chk).not.toContain("ex.decor");
    // Любая строка охраны на цели — ключ клетки занят (и мёртвая).
    expect(chk).toContain(
      `EXISTS (SELECT 1 FROM yuplink.raid_mine_guard x WHERE ${SRC("x")}) AND EXISTS (SELECT 1 FROM yuplink.raid_mine_guard x WHERE ${DST("x")}) THEN 'target_guard'`,
    );
  });

  it("едут сундук и его охрана; входы в обе клетки гаснут", () => {
    expect(cte("chest")).toContain(
      `UPDATE yuplink.raid_magic_chest x SET q = 7, r = 1 FROM go WHERE ${SRC("x")} AND x.owner_account = 'acc_owner'`,
    );
    expect(cte("guard")).toContain(
      `UPDATE yuplink.raid_mine_guard g SET q = 7, r = 1 FROM go WHERE ${SRC("g")}`,
    );
    expect(cte("pass")).toContain(
      "SET until = now() FROM go WHERE p.target IN ('mc:rmap_x:4:-2', 'mc:rmap_x:7:1') AND p.until > now()",
    );
    expect([...writtenTables(mSql)].sort()).toEqual([
      "raid_magic_chest",
      "raid_mine_guard",
      "raid_open_pass",
    ]);
    expect([...mSql.matchAll(WRITE_RE)].length).toBe(chestWriteNames(magic).length);
  });
});

describe("перенос обычного сундука", () => {
  const cte = (n: string) => cteOf(pSql, n);

  it("локи: сундук по id, клетки; строка сундука FOR UPDATE", () => {
    expect(pSql).toContain("hashtext('pchest:pc_abc')");
    expect(pSql).toContain(
      "SELECT 1 FROM yuplink.raid_plain_chest x WHERE x.id = 'pc_abc' FOR UPDATE;",
    );
    expect(pSql).not.toContain("hashtext('chest:");
  });

  it("тот самый по id; уже на цели — already, другой сундук — changed", () => {
    expect(cte("chk")).toContain(
      `WHEN NOT EXISTS (SELECT 1 FROM pc_a WHERE pc_a.id = 'pc_abc') THEN CASE WHEN EXISTS (SELECT 1 FROM yuplink.raid_plain_chest x WHERE x.id = 'pc_abc' AND ${DST("x")}) THEN 'already' WHEN (EXISTS (SELECT 1 FROM mc_a) OR EXISTS (SELECT 1 FROM pc_a)) THEN 'changed' ELSE 'gone' END`,
    );
  });

  it("едет только сундук (ячейки — по id сам), вход в него гаснет; охрана не трогается", () => {
    expect(cte("chest")).toContain(
      `UPDATE yuplink.raid_plain_chest x SET q = 7, r = 1 FROM go WHERE x.id = 'pc_abc' AND ${SRC("x")}`,
    );
    expect(cte("pass")).toContain("WHERE p.target = 'pc:pc_abc' AND p.until > now()");
    expect([...writtenTables(pSql)].sort()).toEqual(["raid_open_pass", "raid_plain_chest"]);
    expect(chestWriteNames(plain)).toEqual(["chest", "pass"]);
  });

  it("ответ: ok, повтор, отказ", () => {
    expect(parseChestRow({ reason: "ok" })).toEqual({
      ok: true,
      already: false,
      moved: { cells: [], object: null },
    });
    expect(parseChestRow({ reason: "already" })).toMatchObject({ ok: true, already: true });
    expect(parseChestRow({ reason: "target_chest" })).toEqual({
      ok: false,
      reason: "target_chest",
      leftovers: [],
    });
    expect(parseChestRow(undefined)).toBeUndefined();
  });
});
