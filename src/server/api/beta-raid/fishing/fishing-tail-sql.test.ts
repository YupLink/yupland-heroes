// SQL досчёта «Улова» и поздней выдачи (ревью 14.10): досчёт кладёт по забросу
// только остаток сверх легшего, поздняя выдача ложится, пока мест нет и досчёт
// этот заброс не взял, — и всё под одним замком категории с местами.
import { describe, expect, it } from "vitest";
import { hitOffsets, type FishingConfig } from "@/lib/raid/fishing";
import { noteTimedSql, timedSource } from "@/server/api/tournament/tour-sql";
import { fishSeed } from "@/server/api/beta-raid/fishing/fishing-seed";
import type { FishRow } from "@/server/api/beta-raid/fishing/fishing-sql";
import {
  castHits,
  castSource,
  tailPointsSql,
  tailRowsSql,
} from "@/server/api/beta-raid/fishing/fishing-tail";

const flat = (s: string) => s.replace(/\s+/g, " ");
const LOCK = "SELECT pg_advisory_xact_lock(hashtext('tour-late:fish_catch')) AS l;";

describe("SQL досчёта", () => {
  const sql = flat(tailPointsSql("t1", [{ account: "acc1", op: "op1", at: 1_700_000_000_000 }]));

  it("под замком категории; только «Улов» на выплате, конец наступил, мест нет", () => {
    expect(sql.startsWith(LOCK)).toBe(true);
    expect(sql).toContain("t.id = 't1' AND t.status = 'paying' AND t.metric = 'fish_catch'");
    expect(sql).toContain("AND t.ends_at <= now()");
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM yuplink.tournament_place pl");
  });

  it("поимки внутри турнира и не раньше оплаты; остаток сверх легшего за заброс", () => {
    expect(sql).toContain(
      "('acc1', 'fish:acc1:op1:', 'tail:fish:acc1:op1:', to_timestamp(1700000000000 / 1000.0))",
    );
    expect(sql).toContain("h.at >= t.started_at AND h.at < t.ends_at AND h.at >= e.joined_at");
    expect(sql).toContain(
      "(left(p.ref, length(g.src)) = g.src OR left(p.ref, length(g.tail)) = g.tail)",
    );
    expect(sql).toContain("(g.n - c.got)::numeric AS qty");
    // Ключ — «всего поимок»: повтор с тем же итогом упрётся в PK очка.
    expect(sql).toContain("g.tail || g.n AS ref");
    expect(sql).toContain("ON CONFLICT (tournament_id, ref) DO NOTHING");
    expect(sql).toContain("AND e.paid AND src.at >= e.joined_at");
  });

  it("источник — ключ выдачи без номера поимки, и у выдачи тот же", () => {
    expect(castSource("acc1", "op1")).toBe("fish:acc1:op1:");
    expect(timedSource("fish:acc1:op1:17")).toBe("fish:acc1:op1:");
  });

  it("строки — оплатившие участники, заброс задел турнир (и закрытые после конца)", () => {
    const rows = flat(tailRowsSql("t1"));
    expect(rows).toContain("e.tournament_id = t.id AND e.paid");
    expect(rows).toContain("e.account_id = f.account_id");
    expect(rows).toContain("f.started_at < t.ends_at");
    expect(rows).toContain("(f.stopped_at IS NULL OR f.stopped_at >= t.started_at)");
    expect(rows).toContain("f.account_id AS account");
  });
});

describe("поздняя выдача", () => {
  const sql = flat(
    noteTimedSql({ metric: "fish_catch", account: "acc1", ref: "fish:acc1:op1:3", times: [1] }),
  );

  it("тем же замком; идущий турнир — как раньше", () => {
    expect(sql.startsWith(LOCK)).toBe(true);
    expect(sql).toContain("AND (t.status = 'running' OR (t.status = 'paying'");
    expect(sql).toContain("v.at >= t.started_at AND v.at < t.ends_at AND v.at >= e.joined_at");
  });

  it("на выплате — пока мест нет и досчёт этот заброс не взял", () => {
    expect(sql).toContain(
      "NOT EXISTS (SELECT 1 FROM yuplink.tournament_place pl WHERE pl.tournament_id = t.id)",
    );
    expect(sql).toContain("p.account_id = 'acc1' AND left(p.ref, 19) = 'tail:fish:acc1:op1:'");
  });
});

describe("поимки заброса", () => {
  const cfg: FishingConfig = {
    intervalMin: 1,
    chancePct: 40,
    items: [{ id: "cst_fish", pct: 100 }],
  };
  const row = (o: Partial<FishRow>): FishRow => ({
    op: "op1",
    heroId: "h1",
    mapId: "m1",
    q: 0,
    r: 0,
    tries: 10,
    planTries: 10,
    chancePct: null,
    salt: "s1",
    caught: 0,
    nextMs: 11 * 60_000,
    seenMs: 0,
    actedMs: null,
    nowMs: 20 * 60_000,
    stopped: true,
    samePlace: true,
    actedHere: false,
    heroOn: true,
    ...o,
  });
  const hits = hitOffsets(fishSeed("acc1", "op1", "s1"), 1, 10, 40);
  const args = { account: "acc1", cfg, startMs: 0, endsMs: 60 * 60_000, rodTries: 0 };

  it("отыгранные — по мигам попыток (первая — next_at минус шаг за каждую)", () => {
    const got = castHits({ ...args, row: row({ caught: hits.length }) }).map((h) => h.at);
    expect(got).toEqual(hits.map((n) => n * 60_000));
  });

  it("не сошлись со счётчиком поимок строки — отыгранные не досчитываем", () => {
    expect(castHits({ ...args, row: row({ caught: hits.length + 1 }) })).toEqual([]);
  });
});
