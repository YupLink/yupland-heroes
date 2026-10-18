// Старт турнира: бронь DARAI-фонда из пула под замком пула. Пула не хватает —
// всё равно стартует, пул уходит в минус (владелец, 12.10.2026); повтор не
// бронирует дважды.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  status: "draft" as string,
  fund: 1000,
  pool: new Map<string, number>(),
  sql: [] as string[],
}));

// Бронь пула — поведение БОЕВОГО запуска; проверку (TOUR_LIVE = false)
// проверяем отдельно по тексту SQL ниже.
vi.mock("@/lib/tournament/types", async (orig) => ({
  ...(await orig<typeof import("@/lib/tournament/types")>()),
  TOUR_LIVE: true,
}));

// Фейк исполняет оператор старта так, как его исполнит база: под замком —
// остаток пула, проверка, бронь по UNIQUE ref, CAS по черновику.
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    db.sql.push(sql);
    if (sql.includes("pg_advisory_xact_lock")) {
      const ref = /'(map_reserve:tour:[^']+)'/.exec(sql)?.[1] ?? "";
      const free = [...db.pool.values()].reduce((s, v) => s + v, 0);
      if (db.status !== "draft") return [{ _row: { started: false, free, fund: null } }];
      const check = sql.includes("bal.free >= t.fund_darai");
      if (check && db.fund > 0 && free < db.fund)
        return [{ _row: { started: false, free, fund: db.fund } }];
      if (db.fund > 0 && !db.pool.has(ref)) db.pool.set(ref, -db.fund);
      db.status = "running";
      return [{ _row: { started: true, free, fund: db.fund } }];
    }
    if (sql.includes("SELECT status FROM yuplink.tournament")) return [{ status: db.status }];
    throw new Error("неожиданный SQL");
  },
}));

const { startTournament, startSql, tourReserveRef } = await import("./tour-start");

beforeEach(() => {
  db.status = "draft";
  db.fund = 1000;
  db.pool = new Map([["collection_deposit:1", 1500]]);
  db.sql = [];
});

describe("старт турнира", () => {
  it("хватает пула — бронь фонда и «идёт»", async () => {
    await expect(startTournament("t1")).resolves.toEqual({ ok: true });
    expect(db.status).toBe("running");
    expect(db.pool.get(tourReserveRef("t1"))).toBe(-1000);
  });

  it("пула не хватает — всё равно стартует, пул уходит в минус", async () => {
    db.fund = 2000;
    await expect(startTournament("t1")).resolves.toEqual({ ok: true });
    expect(db.status).toBe("running");
    expect(db.pool.get(tourReserveRef("t1"))).toBe(-2000);
    expect([...db.pool.values()].reduce((s, v) => s + v, 0)).toBe(-500);
  });

  it("второй турнир на тот же остаток тоже стартует — бронь в минус", async () => {
    await startTournament("t1");
    db.status = "draft"; // второй черновик
    await expect(startTournament("t2")).resolves.toEqual({ ok: true });
    expect(db.pool.get(tourReserveRef("t2"))).toBe(-1000);
  });

  it("в SQL старта нет проверки остатка пула", () => {
    const sql = startSql("t1", { moveId: "m", opId: "o", live: true });
    expect(sql).not.toContain("bal.free >= t.fund_darai");
    expect(sql).not.toContain("SET last_error = 'tour.err.pool'");
  });

  it("повтор старта не бронирует дважды и отвечает «ок»", async () => {
    await startTournament("t1");
    await expect(startTournament("t1")).resolves.toEqual({ ok: true });
    expect([...db.pool.keys()].filter((k) => k.startsWith("map_reserve:"))).toHaveLength(1);
  });

  it("без DARAI-призов стартует без брони", async () => {
    db.fund = 0;
    await startTournament("t1");
    expect(db.status).toBe("running");
    expect(db.pool.size).toBe(1);
  });

  it("не черновик и не идёт — tour.err.state", async () => {
    db.status = "done";
    await expect(startTournament("t1")).rejects.toThrow("tour.err.state");
  });

  it("SQL: сначала замок пула отдельным оператором, затем бронь без проверки остатка", () => {
    const sql = startSql("t1", { moveId: "dp_1", opId: "dpm_1", live: true }).replace(/\s+/g, " ");
    const lock = sql.indexOf("SELECT pg_advisory_xact_lock(hashtext('darai-pool:map')) AS l;");
    expect(lock).toBe(0);
    expect(sql.indexOf("WITH t AS")).toBeGreaterThan(lock);
    expect(sql).toContain("status = 'draft' FOR UPDATE");
    expect(sql).toContain("ok AS (SELECT t.* FROM t)");
    expect(sql).toContain("'map_reserve', -ok.fund_darai, 'map_reserve:tour:t1'");
    expect(sql).toContain("ON CONFLICT (ref) DO NOTHING");
    // Ручной старт: начало — сейчас; конец — назначенный, если он ещё впереди.
    expect(sql).toContain("started_at = now()");
    expect(sql).toContain(
      "ends_at = CASE WHEN x.end_at > now() THEN x.end_at ELSE now() + make_interval(days => x.days) END",
    );
    expect(sql).toContain("last_error = NULL");
    // Пул не держит старт (владелец, 12.10.2026): ни проверки, ни причины отказа.
    expect(sql).not.toContain("SET last_error = 'tour.err.pool'");
    expect(sql).toContain("x.status = 'draft'");
    expect(sql).toContain("dry = false");
  });

  it("проверка: пул не читается в условии, брони нет, турнир помечен dry", () => {
    const sql = startSql("t1", { moveId: "dp_1", opId: "dpm_1" }).replace(/\s+/g, " ");
    expect(sql).toContain("ok AS (SELECT t.* FROM t)");
    expect(sql).toContain("WHERE ok.fund_darai > 0 AND false");
    expect(sql).toContain("dry = true");
  });
});
