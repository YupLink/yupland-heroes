// Снос острова: накопленное шахтами — хозяевам до сноса карты, но строкой
// «Отбитых шахт» к «Забрать», не на счёт (владелец, 23.10.2026; minecap-01).
// Сбой одной шахты не мешает остальным; ачивка — при «Забрать», не здесь;
// уборка острова сносит только забранные строки журнала. Базы нет.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  mines: [] as Array<{ q: number; r: number; owner_account: string }>,
  fail: new Set<string>(),
  bumps: [] as Array<[string, string, number]>,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("FROM yuplink.raid_mine_state")) return s.mines;
    const m = /raid_mine_island_release\('[^']+', (-?\d+), (-?\d+)\)/.exec(sql);
    if (m) {
      if (s.fail.has(`${m[1]},${m[2]}`)) throw new Error("boom");
      return [{ id: `mcl_${m[1]}_${m[2]}` }];
    }
    return [];
  },
}));
vi.mock("@/server/api/achievements/bump", () => ({
  bumpAchievement: (acc: string, track: string, n: number) => s.bumps.push([acc, track, n]),
}));

const { claimIslandMines, islandMinesSql, mineReleaseSql } = await import("./island-mine-claim");

beforeEach(() => {
  s.sql = [];
  s.mines = [];
  s.fail = new Set();
  s.bumps = [];
});

describe("шахты острова перед сносом", () => {
  it("SQL: только карта острова, только шахты с хозяином; закрытие — raid_mine_island_release", () => {
    expect(() => islandMinesSql("rmap_UthOURxc")).toThrow("island.not_island");
    const list = islandMinesSql("isle_abc");
    expect(list).toContain("FROM yuplink.raid_mine_state");
    expect(list).toContain("WHERE map_id = 'isle_abc' AND owner_account IS NOT NULL");
    expect(mineReleaseSql("isle_abc", 3, -4)).toBe(
      "SELECT yuplink.raid_mine_island_release('isle_abc', 3, -4) AS id;",
    );
    expect(mineReleaseSql("isle_a'b", 1, 2)).toContain("'isle_a''b'");
  });

  it("каждая шахта — строкой к «Забрать», сбой одной не мешает, на счёт и в ачивку — ничего", async () => {
    s.mines = [
      { q: 1, r: 1, owner_account: "acc_1" },
      { q: 2, r: 2, owner_account: "acc_1" },
      { q: 3, r: 3, owner_account: "acc_1" },
    ];
    s.fail.add("2,2");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await claimIslandMines("isle_abc")).toBe(2);
    warn.mockRestore();
    expect(s.sql.filter((q) => q.includes("raid_mine_island_release"))).toHaveLength(3);
    expect(s.sql.some((q) => q.includes("raid_mine_claim") || q.includes("raid_mine_credit"))).toBe(
      false,
    );
    expect(s.bumps).toEqual([]);
  });

  it("шахт нет — ни закрытий, ни ачивок", async () => {
    expect(await claimIslandMines("isle_abc")).toBe(0);
    expect(s.sql).toHaveLength(1);
    expect(s.bumps).toEqual([]);
  });

  it("снос: сначала шахты, потом карта и уборка; журнал потерь — только забранное", async () => {
    s.mines = [{ q: 5, r: 6, owner_account: "acc_2" }];
    const { dropIsland } = await import("./island-create");
    await dropIsland("isle_abc");
    const relAt = s.sql.findIndex((q) => q.includes("raid_mine_island_release('isle_abc', 5, 6)"));
    const mapAt = s.sql.findIndex((q) => q.includes("DELETE FROM yuplink.raid_maps"));
    expect(relAt).toBeGreaterThan(-1);
    expect(relAt).toBeLessThan(mapAt);
    expect(s.sql).toContain("DELETE FROM yuplink.raid_mine_op WHERE map_id = 'isle_abc';");
    expect(s.sql).toContain(
      "DELETE FROM yuplink.raid_mine_capture_log WHERE map_id = 'isle_abc' AND claimed_at IS NOT NULL;",
    );
    expect(s.sql).not.toContain(
      "DELETE FROM yuplink.raid_mine_capture_log WHERE map_id = 'isle_abc';",
    );
  });
});
