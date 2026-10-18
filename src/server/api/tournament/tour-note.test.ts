// Живое очко в горячем пути: нет идущих турниров категории — ни одного
// запроса к базе (кроме «что идёт» раз в 30 с), сбой базы шаг не роняет.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Sched = { metric: null; next_ms: number | null; due: boolean | null };
const db = vi.hoisted(() => ({
  metrics: [] as string[],
  sched: [] as Sched[],
  sql: [] as string[],
  failWrite: false,
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    db.sql.push(sql);
    if (sql.includes("SELECT DISTINCT metric")) {
      return [...db.metrics.map((metric) => ({ metric })), ...db.sched];
    }
    if (db.failWrite) throw new Error("pool is closed");
    return [{ _row: { points: 1 } }];
  },
}));

const { noteTournament, dropTourCache } = await import("./tour-note");
const { noteChop } = await import("./tour-hooks");

vi.mock("../beta-raid/owner", () => ({ raidOwner: async () => "acc_1" }));

beforeEach(() => {
  db.metrics = [];
  db.sched = [];
  db.sql = [];
  db.failWrite = false;
  dropTourCache();
});

describe("живое очко", () => {
  it("нет идущих — один вопрос «что идёт» на 30 с и ни одной записи", async () => {
    for (let i = 0; i < 5; i++) await noteTournament("acc_1", "steps", 1, `step:${i}`);
    expect(db.sql).toHaveLength(1);
    expect(db.sql[0]).toContain("SELECT DISTINCT metric");
  });

  it("идёт категория — запись с ключом события; чужая категория — без записи", async () => {
    db.metrics = ["steps"];
    await noteTournament("acc_1", "steps", 1, "step:acc_1:k1");
    await noteTournament("acc_1", "step_energy", 2, "step:acc_1:k1");
    const writes = db.sql.filter((s) => s.includes("INSERT INTO yuplink.tournament_point"));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("'step:acc_1:k1'");
  });

  it("улов со временем поимок — очко по времени каждой поимки, а не «сейчас»", async () => {
    db.metrics = ["fish_catch"];
    await noteTournament("acc_1", "fish_catch", 2, "fish:acc_1:op:1", [1000, 2000]);
    const [w] = db.sql.filter((s) => s.includes("INSERT INTO yuplink.tournament_point"));
    expect(w).toContain("v.at >= t.started_at AND v.at < t.ends_at AND v.at >= e.joined_at");
    expect(w).not.toContain("t.started_at <= now()");
  });

  it("«идёт» — пока не подведён: и после конца до захвата, и на выплате (поздний улов)", async () => {
    await noteTournament("acc_1", "steps", 1, "s1");
    expect(db.sql[0]).toContain("WHERE status IN ('running', 'paying') AND started_at <= now()");
    expect(db.sql[0]).not.toContain("ends_at > now()");
  });

  it("нулевое количество и пустой аккаунт не пишутся", async () => {
    db.metrics = ["step_energy"];
    await noteTournament("acc_1", "step_energy", 0, "r1");
    await noteTournament("", "step_energy", 1, "r2");
    expect(db.sql.filter((s) => s.includes("INSERT"))).toHaveLength(0);
  });

  it("сбой записи не бросает", async () => {
    db.metrics = ["chop"];
    db.failWrite = true;
    await expect(noteTournament("acc_1", "chop", 1, "chop:x")).resolves.toBeUndefined();
  });

  it("рубка: очко только за топор", async () => {
    db.metrics = ["chop"];
    await noteChop("w1", "Каменная Кирка", "chop:m:1:1:1");
    expect(db.sql.filter((s) => s.includes("INSERT"))).toHaveLength(0);
    await noteChop("w1", "Каменный Топор", "chop:m:1:1:2");
    const w = db.sql.filter((s) => s.includes("INSERT"));
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("t.metric = 'chop'");
    expect(w[0]).toContain("'acc_1' AS account_id");
  });

  it("рубка руками (§8.56) — очко как за топор", async () => {
    db.metrics = ["chop"];
    await noteChop("w1", null, "chop:m:1:1:3", 2, "Бревна", true);
    const w = db.sql.filter((s) => s.includes("INSERT"));
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("t.metric = 'chop'");
  });
});

describe("кэш «что идёт» и старт по расписанию", () => {
  const T0 = Date.parse("2026-10-04T23:59:50Z");
  let now = T0;
  const asks = () => db.sql.filter((q) => q.includes("SELECT DISTINCT metric")).length;
  beforeEach(() => {
    now = T0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });
  afterEach(() => vi.restoreAllMocks());

  it("старт в 00:00 — кэш, спрошенный в 23:59:50, не доживает до 00:00:20", async () => {
    db.sched = [{ metric: null, next_ms: Date.parse("2026-10-05T00:00:00Z"), due: null }];
    await noteTournament("acc_1", "steps", 1, "s1");
    now = T0 + 9_000;
    await noteTournament("acc_1", "steps", 1, "s2");
    expect(asks()).toBe(1);
    // 00:00:01 — сосед уже запустил турнир: спрашиваем заново и пишем очко.
    db.sched = [];
    db.metrics = ["steps"];
    now = T0 + 11_000;
    await noteTournament("acc_1", "steps", 1, "s3");
    expect(asks()).toBe(2);
    expect(db.sql.filter((q) => q.includes("INSERT"))).toHaveLength(1);
  });

  it("начало наступило, а тикер ещё не запустил — переспрос через 2 с, не через 30", async () => {
    db.sched = [{ metric: null, next_ms: null, due: true }];
    await noteTournament("acc_1", "steps", 1, "s1");
    now = T0 + 1_500;
    await noteTournament("acc_1", "steps", 1, "s2");
    expect(asks()).toBe(1);
    now = T0 + 2_500;
    await noteTournament("acc_1", "steps", 1, "s3");
    expect(asks()).toBe(2);
  });

  it("без расписания — прежние 30 с", async () => {
    await noteTournament("acc_1", "steps", 1, "s1");
    now = T0 + 29_000;
    await noteTournament("acc_1", "steps", 1, "s2");
    expect(asks()).toBe(1);
    now = T0 + 31_000;
    await noteTournament("acc_1", "steps", 1, "s3");
    expect(asks()).toBe(2);
  });
});
