// Таблица турнира: игроку до финиша — все оплатившие запись (с очками — места
// по счёту, строки по RANK_ORDER, без очков — после, без места); после финиша —
// записанные места; админке — только набравшие очки, как было. Равные по счёту
// стоят на одном месте (PLACE_RANK) — как на финише.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RANK_ORDER } from "./tour-sql";
import { PLACE_RANK } from "@/server/api/tournament/tour-finish-sql";

type Row = Record<string, unknown>;
const db = { page: [] as Row[], total: 0, mine: [] as Row[], sql: [] as string[] };

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    db.sql.push(sql);
    if (sql.includes("OFFSET")) return db.page;
    if (sql.includes("::int AS n")) return [{ n: db.total }];
    if (sql.includes("me.score")) return db.mine;
    return []; // имена: нет — короткий acc-id
  },
}));

const { loadBoard, loadLeaderPage, mineSql, pageSql, totalSql } = await import("./tour-board");

const flat = (s: string) => s.replace(/\s+/g, " ").trim();

beforeEach(() => {
  db.page = [];
  db.total = 0;
  db.mine = [];
  db.sql = [];
});

describe("SQL таблицы", () => {
  it("игроку до финиша — все оплатившие запись; без очков — после мест, место null", () => {
    for (const st of ["draft", "running", "paying"] as const) {
      const sql = flat(pageSql("t1", st, 40, true));
      expect(sql).toContain("FROM yuplink.tournament_entry e");
      expect(sql).toContain("WHERE e.tournament_id = 't1' AND e.paid");
      expect(sql).toContain(
        "LEFT JOIN yuplink.tournament_score s ON s.tournament_id = e.tournament_id AND s.account_id = e.account_id AND s.score > 0",
      );
      expect(sql).toContain("COALESCE(s.score, 0) AS score");
      // Без очков — счёт 0 и время записи: RANK_ORDER ставит их после всех набравших.
      expect(sql).toContain("COALESCE(s.last_at, e.joined_at) AS last_at");
      expect(sql).toContain("COALESCE(s.first_at, e.joined_at) AS first_at");
      expect(sql).toContain(`row_number() OVER (ORDER BY ${RANK_ORDER}) AS ord`);
      // Место — по счёту: равные на одном месте; без очков места нет.
      expect(sql).toContain(`${PLACE_RANK} AS rnk`);
      expect(sql).toContain("CASE WHEN score > 0 THEN rnk END AS place");
      expect(sql).toMatch(/ORDER BY ord OFFSET 40 LIMIT 20;$/);
      expect(flat(totalSql("t1", st, true))).toBe(
        "SELECT count(*)::int AS n FROM yuplink.tournament_entry WHERE tournament_id = 't1' AND paid;",
      );
    }
    expect(RANK_ORDER.startsWith("score DESC, last_at ASC, first_at ASC")).toBe(true);
    expect(PLACE_RANK).toBe("rank() OVER (ORDER BY score DESC)");
  });

  it("после финиша — записанные места, и игроку тоже", () => {
    const sql = flat(pageSql("t1", "done", 0, true));
    expect(sql).toContain("FROM yuplink.tournament_place");
    expect(sql).not.toContain("tournament_entry");
    // Равные — на одном месте; страницы режем по месту и аккаунту.
    expect(sql).toContain("row_number() OVER (ORDER BY place, account_id) AS ord");
    expect(sql).toMatch(/ORDER BY place, account_id OFFSET 0 LIMIT 20;$/);
    expect(flat(totalSql("t1", "done", true))).toContain("FROM yuplink.tournament_place");
  });

  it("админке — как было: только набравшие очки", () => {
    const sql = flat(pageSql("t1", "running", 0));
    expect(sql).toContain("FROM yuplink.tournament_score WHERE tournament_id = 't1' AND score > 0");
    expect(sql).toContain(`${PLACE_RANK} AS place`);
    expect(sql).not.toContain("tournament_entry");
    expect(flat(totalSql("t1", "running"))).toContain("FROM yuplink.tournament_score");
  });

  it("моя строка: с очками — место, записан без очков — без места, иначе строки нет", () => {
    const sql = flat(mineSql("t1", "running", "acc"));
    expect(sql).toContain("COALESCE(me.score, 0)::float8 AS score");
    expect(sql).toContain("CASE WHEN me.score > 0 THEN 1 + (SELECT count(*)");
    // Равные по счёту — на одном месте: выше меня только те, у кого больше.
    expect(sql).toContain("WHERE o.tournament_id = 't1' AND o.score > me.score)");
    expect(sql).not.toContain("last_at");
    expect(sql).toContain(
      "me.account_id IS NOT NULL OR EXISTS (SELECT 1 FROM yuplink.tournament_entry e",
    );
    expect(sql).toContain("e.account_id = 'acc' AND e.paid");
    expect(flat(mineSql("t1", "done", "acc"))).toContain("FROM yuplink.tournament_place");
  });
});

describe("страница игрока", () => {
  const line = (account_id: string, score: number, ord: number, place: number | null) => ({
    account_id,
    score,
    ord,
    place,
  });

  it("с очками → без очков, в порядке сервера, даже если обёртка перемешала строки", async () => {
    db.page = [
      line("acc_zzz_000001", 0, 4, null),
      line("acc_aaa_000001", 30, 1, 1),
      line("acc_yyy_000001", 0, 3, null),
      line("acc_bbb_000001", 12.5, 2, 2),
    ];
    db.total = 4;
    db.mine = [{ account_id: "acc_me_0000001", score: 0, place: null }];
    const p = await loadLeaderPage("t1", "running", 0, "acc_me_0000001");
    expect(p.rows.map((r) => r.place)).toEqual([1, 2, null, null]);
    expect(p.rows.map((r) => r.score)).toEqual([30, 12.5, 0, 0]);
    expect(p.rows.map((r) => r.name)).toEqual([
      "acc_aaa…0001",
      "acc_bbb…0001",
      "acc_yyy…0001",
      "acc_zzz…0001",
    ]);
    expect(p.total).toBe(4);
    // Я записан без очков и не на странице — моя строка без места.
    expect(p.mine).toEqual({ place: null, name: "acc_me_…0001", score: 0, mine: true });
    expect(db.sql.some((s) => s.includes("tournament_entry e") && s.includes("OFFSET 0"))).toBe(
      true,
    );
  });

  it("равные по счёту — одно место, строки по порядку сервера", async () => {
    db.page = [
      line("acc_ccc_000001", 30, 3, 1),
      line("acc_aaa_000001", 30, 1, 1),
      line("acc_ddd_000001", 12, 4, 4),
      line("acc_bbb_000001", 30, 2, 1),
    ];
    db.total = 4;
    const p = await loadLeaderPage("t1", "running", 0, null);
    expect(p.rows.map((r) => [r.place, r.name])).toEqual([
      [1, "acc_aaa…0001"],
      [1, "acc_bbb…0001"],
      [1, "acc_ccc…0001"],
      [4, "acc_ddd…0001"],
    ]);
  });

  it("я на странице — выделен в строках, отдельно не закреплён", async () => {
    db.page = [line("acc_aaa_000001", 30, 1, 1), line("acc_me_0000001", 0, 2, null)];
    db.total = 2;
    db.mine = [{ account_id: "acc_me_0000001", score: 0, place: null }];
    const p = await loadLeaderPage("t1", "draft", 0, "acc_me_0000001");
    expect(p.rows.map((r) => [r.place, r.mine])).toEqual([
      [1, false],
      [null, true],
    ]);
    expect(p.mine).toBeNull();
  });

  it("админка — по местам, без записавшихся", async () => {
    db.page = [
      { account_id: "acc_bbb_000001", score: 5, place: 2 },
      { account_id: "acc_aaa_000001", score: 9, place: 1 },
    ];
    db.total = 2;
    const b = await loadBoard("t1", "running", 0);
    expect(b.lines.map((l) => [l.place, l.accountId])).toEqual([
      [1, "acc_aaa_000001"],
      [2, "acc_bbb_000001"],
    ]);
    expect(db.sql.some((s) => s.includes("tournament_entry"))).toBe(false);
  });
});
