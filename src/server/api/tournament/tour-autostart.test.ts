// Автостарт по расписанию (владелец, 04.10.2026): черновик, чьё время начала
// (UTC) наступило, стартует сам с ТОЧНО назначенным началом; пула DARAI не
// хватило — остаётся черновиком с причиной в last_error и пробует снова.
// Второй воркер (повтор прохода) второй раз не стартует и не бронирует.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Draft = {
  id: string;
  status: string;
  due: boolean;
  fund: number;
  startAt: string;
  endAt: string | null;
  startedAt: string | null;
  endsAt: string | null;
  lastError: string | null;
};

const db = vi.hoisted(() => ({
  tours: new Map<string, Draft>(),
  pool: new Map<string, number>(),
  cacheDropped: 0,
}));

vi.mock("@/lib/tournament/types", async (orig) => ({
  ...(await orig<typeof import("@/lib/tournament/types")>()),
  TOUR_LIVE: true,
}));
vi.mock("./tour-note", () => ({ dropTourCache: () => void db.cacheDropped++ }));

const DAY = 86_400_000;
const plusDays = (iso: string, d: number) => new Date(Date.parse(iso) + d * DAY).toISOString();

// Фейк исполняет операторы так, как их исполнит база: список наступивших
// черновиков; старт — под замком пула, CAS по черновику с наступившим началом.
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (sql.includes("start_at <= now()") && sql.startsWith("SELECT id FROM")) {
      return [...db.tours.values()]
        .filter((t) => t.status === "draft" && t.due)
        .map((t) => ({ id: t.id }));
    }
    if (sql.includes("pg_advisory_xact_lock")) {
      const id = /WHERE id = '([^']+)'/.exec(sql)?.[1] ?? "";
      const auto = sql.includes("AND start_at IS NOT NULL AND start_at <= now()");
      const t = db.tours.get(id);
      const free = [...db.pool.values()].reduce((a, b) => a + b, 0);
      if (!t || t.status !== "draft" || (auto && !t.due)) {
        return [{ _row: { started: false, free, fund: null } }];
      }
      if (sql.includes("bal.free >= t.fund_darai") && t.fund > free) {
        if (sql.includes("SET last_error = 'tour.err.pool'")) t.lastError = "tour.err.pool";
        return [{ _row: { started: false, free, fund: t.fund } }];
      }
      const ref = /'(map_reserve:tour:[^']+)'/.exec(sql)?.[1] ?? "";
      if (!db.pool.has(ref)) db.pool.set(ref, -t.fund);
      t.status = "running";
      t.lastError = sql.includes("last_error = NULL") ? null : t.lastError;
      // Что поставит оператор: начало — start_at (авто), конец — end_at ?? start_at + дни.
      if (sql.includes("started_at = x.start_at")) t.startedAt = t.startAt;
      if (sql.includes("COALESCE(x.end_at, x.start_at + make_interval(days => x.days))")) {
        t.endsAt = t.endAt ?? plusDays(t.startAt, 7);
      }
      return [{ _row: { started: true, free, fund: t.fund } }];
    }
    throw new Error(`неожиданный SQL: ${sql.slice(0, 80)}`);
  },
}));

const { autoStartDue, startSql } = await import("./tour-start");

const draft = (id: string, o: Partial<Draft> = {}): Draft => ({
  id,
  status: "draft",
  due: true,
  fund: 100,
  startAt: "2026-10-05T00:00:00.000Z",
  endAt: "2026-10-11T23:52:00.000Z",
  startedAt: null,
  endsAt: null,
  lastError: null,
  ...o,
});

beforeEach(() => {
  db.tours = new Map();
  db.pool = new Map([["deposit:1", 1000]]);
  db.cacheDropped = 0;
});

describe("автостарт по расписанию", () => {
  it("время пришло — стартует: начало и конец ровно назначенные, бронь фонда", async () => {
    db.tours.set("k1", draft("k1"));
    await expect(autoStartDue()).resolves.toBe(1);
    const t = db.tours.get("k1");
    expect(t?.status).toBe("running");
    expect(t?.startedAt).toBe("2026-10-05T00:00:00.000Z");
    expect(t?.endsAt).toBe("2026-10-11T23:52:00.000Z");
    expect(db.pool.get("map_reserve:tour:k1")).toBe(-100);
    expect(db.cacheDropped).toBe(1);
  });

  it("конец не задан — через N дней от назначенного начала", async () => {
    db.tours.set("k2", draft("k2", { endAt: null }));
    await autoStartDue();
    expect(db.tours.get("k2")?.endsAt).toBe("2026-10-12T00:00:00.000Z");
  });

  it("время не пришло — не трогаем", async () => {
    db.tours.set("k3", draft("k3", { due: false }));
    await expect(autoStartDue()).resolves.toBe(0);
    expect(db.tours.get("k3")?.status).toBe("draft");
  });

  it("пула нет — всё равно стартует в срок, пул в минус, старая причина снята", async () => {
    db.tours.set("k4", draft("k4", { fund: 5000, lastError: "tour.err.pool" }));
    await expect(autoStartDue()).resolves.toBe(1);
    expect(db.tours.get("k4")).toMatchObject({ status: "running", lastError: null });
    expect(db.pool.get("map_reserve:tour:k4")).toBe(-5000);
  });

  it("пула хватает не всем — стартуют все разом (владелец: «в любом случае»)", async () => {
    db.tours.set("a", draft("a", { fund: 600 }));
    db.tours.set("b", draft("b", { fund: 600 }));
    db.tours.set("c", draft("c", { fund: 300 }));
    await expect(autoStartDue()).resolves.toBe(3);
    for (const id of ["a", "b", "c"]) expect(db.tours.get(id)?.status).toBe("running");
    expect([...db.pool.values()].reduce((s, v) => s + v, 0)).toBe(-500);
  });

  it("повтор прохода (второй воркер) — второй брони и старта нет", async () => {
    db.tours.set("k5", draft("k5"));
    await autoStartDue();
    await expect(autoStartDue()).resolves.toBe(0);
    expect([...db.pool.keys()].filter((k) => k.startsWith("map_reserve:"))).toHaveLength(1);
  });

  it("SQL автостарта: CAS по черновику с наступившим началом, начало = start_at", () => {
    const sql = startSql("t1", { moveId: "dp_1", opId: "dpm_1", live: true, auto: true }).replace(
      /\s+/g,
      " ",
    );
    expect(sql).toContain(
      "status = 'draft' AND start_at IS NOT NULL AND start_at <= now() FOR UPDATE",
    );
    expect(sql).toContain("started_at = x.start_at");
    expect(sql).toContain(
      "ends_at = COALESCE(x.end_at, x.start_at + make_interval(days => x.days))",
    );
    // Подтяжка журналов — с назначенного начала, даже если тикер пришёл позже.
    expect(sql).toContain("synced_at = x.start_at");
    expect(sql).toContain("x.status = 'draft'");
  });
});
