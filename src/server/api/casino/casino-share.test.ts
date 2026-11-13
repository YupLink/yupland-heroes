// Доля владельцев казино (владелец, 09.11.2026, §8.124): итог суток МСК — функцией
// базы с переносом убытка; доля — строкой «Казино» в «Добыче» с ключом
// cshare:<день>:<герой>; «Забрать» — только аккаунту доли, золото и пул — одним вызовом.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => {
  const fresh = () => ({
    sql: [] as string[],
    settled: [] as Array<Record<string, unknown>>,
    unqueued: [] as Array<Record<string, unknown>>,
    stuck: [] as Array<Record<string, unknown>>,
    payError: null as string | null,
    queued: [] as Array<Record<string, unknown>>,
  });
  return Object.assign(fresh(), { fresh });
});

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("casino_share_settle_due(")) return s.settled;
    if (sql.includes("p.queued_at IS NULL")) return s.unqueued;
    if (sql.includes("rr.claimed_at < now()")) return s.stuck;
    if (sql.includes("casino_share_pay(")) {
      if (s.payError) throw new Error(s.payError);
      return [{ res: { paid: true } }];
    }
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/reward-queue", () => ({
  queueEncounterReward: async (r: Record<string, unknown>) => void s.queued.push(r),
}));
vi.mock("@/server/api/beta-raid/owner", () => ({ raidOwner: async (w: string) => `acc_${w}` }));
vi.mock("@/server/api/raid-reward-extra", () => ({ BAD_REF: "raid.reward_bad_ref" }));

const { casinoSharePass, claimCasinoShare } = await import("./casino-share");
const { settleSql, stuckSql } = await import("./casino-share-sql");
const pays = () => s.sql.filter((x) => x.includes("casino_share_pay("));

beforeEach(() => void Object.assign(s, s.fresh()));

describe("«Забрать» доли", () => {
  it("день и герой из строки, аккаунт — того, кто нажал", async () => {
    await claimCasinoShare("2026-11-09:hero_1", "w");
    expect(pays()[0]).toContain("casino_share_pay('2026-11-09'::date, 'hero_1', 'acc_w')");
  });

  it("битая строка и чужая доля — «битая ссылка»; сбой базы — «пока не вышло»", async () => {
    await expect(claimCasinoShare("garbage", "w")).rejects.toThrow("raid.reward_bad_ref");
    expect(pays()).toEqual([]);
    s.payError = "bridge: casino_share_bad_ref";
    await expect(claimCasinoShare("2026-11-09:h", "w")).rejects.toThrow("raid.reward_bad_ref");
    s.payError = "bridge: deadlock detected";
    await expect(claimCasinoShare("2026-11-09:h", "w")).rejects.toThrow("casino.share_later");
  });
});

describe("обход", () => {
  it("подводит дни, ставит строку «Казино» каждой доле и отмечает её", async () => {
    s.settled = [{ day: "2026-11-09", profit: 40000, fund: 2000, heroes: 2, perHero: 1000 }];
    s.unqueued = [{ day: "2026-11-09", heroId: "h1", account: "acc_a", amount: 1000 }];
    await casinoSharePass();
    expect(s.queued).toEqual([
      {
        account: "acc_a",
        mapId: "casino",
        cycleNo: 0,
        sourceName: "casino_share",
        kind: "casino_share",
        amount: 1000,
        packId: "2026-11-09:h1",
        key: "cshare:2026-11-09:h1",
        unlabeled: true,
      },
    ]);
    expect(s.sql.some((x) => x.includes("SET queued_at = now()"))).toBe(true);
  });

  it("забранную и не выданную — выдаёт; не вышло — строку обратно в «Добычу»", async () => {
    s.stuck = [{ day: "2026-11-09", heroId: "h1", account: "acc_a" }];
    await casinoSharePass();
    expect(pays()).toHaveLength(1);
    expect(s.sql.some((x) => x.includes("SET claimed_at = NULL"))).toBe(false);
    s.sql = [];
    s.payError = "boom";
    await casinoSharePass();
    const release = s.sql.find((x) => x.includes("SET claimed_at = NULL")) ?? "";
    expect(release).toContain("md5('cshare:2026-11-09:h1')");
    expect(release).toContain("AND p.paid_at IS NULL");
  });

  it("SQL: с 09.11, 5 %; id строки — тот же ключ; живые строки", () => {
    expect(settleSql()).toContain("casino_share_settle_due('2026-11-09'::date, 5)");
    expect(stuckSql).toContain("md5('cshare:' || p.day::text || ':' || p.hero_id)");
    expect(stuckSql).toContain("rr.expires_at IS NULL OR rr.expires_at > now()");
  });
});

describe("миграция casino-share-01", () => {
  const sql = readFileSync("migrations/casino-share-01.sql", "utf8").replace(/\s+/g, " ");
  it("итог — пул казино 'casino:%' за сутки МСК; только закончившиеся сутки", () => {
    expect(sql).toContain("m.kind LIKE 'casino:%'");
    expect(sql).toContain("(v_day::timestamp AT TIME ZONE 'Europe/Moscow')");
    expect(sql).toContain("WHILE v_day < v_today LOOP");
  });
  it("убыток — в долг; прибыль сперва гасит долг; 5 % — со сверх; вниз до целого", () => {
    expect(sql).toContain("v_cover := 0; v_base := 0; v_debt := v_debt - v_profit;");
    expect(sql).toContain("v_cover := LEAST(v_debt, v_profit); v_base := v_profit - v_cover;");
    expect(sql).toContain("v_fund := round(v_base * p_pct / 100, 4);");
    expect(sql).toContain("floor(v_fund / v_n)");
    expect(sql).toContain("v_n := cardinality(v_ids);");
    expect(sql).toContain("FROM unnest(v_ids, v_accs) AS x(hero, acc)");
    expect(sql).toContain("((now() - interval '5 minutes') AT TIME ZONE 'Europe/Moscow')::date");
    expect(sql).toContain("t.meta->>'ability' = 'casino_owner'");
  });
  it("выдача: только аккаунту доли; золото и пул одним вызовом, вид пула не 'casino:%'", () => {
    expect(sql).toContain("v_p.account_id IS DISTINCT FROM p_account");
    expect(sql).toContain("yuplink.res_move(p_account, 'gold', v_p.amount, 'casino_share', v_ref)");
    expect(sql).toContain("SELECT 'gold', -v_got, 'out:casino_share', v_ref WHERE v_got > 0");
    expect(sql).toContain("pg_advisory_xact_lock(hashtext('casino-share'))");
  });
});
