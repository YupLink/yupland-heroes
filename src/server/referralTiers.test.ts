// Вехи друзей → строки «бокс ждёт»: ключ аккаунт + веха; в счёт идут только
// новые друзья (с REF_NEW_SCHEME_SINCE). База, счёт друзей и аккаунт подменены.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = { count: 0, friends: 0, inserted: 0, account: "acc_I" as string | null };
const countCalls: Array<[string[], string | undefined, unknown]> = [];
const sqls: string[] = [];

vi.mock("./db/mcpClient", () => ({
  mcpExec: vi.fn(async (sql: string) => {
    const flat = sql.replace(/\s+/g, " ").trim();
    sqls.push(flat);
    if (flat.includes("INSERT INTO yuplink.ref_reward"))
      return Array.from({ length: st.inserted }, () => ({ id: "x" }));
    return [];
  }),
}));
vi.mock("./api/raid-shared", () => ({
  sqlStr: (v: string) => `'${String(v).replace(/'/g, "''")}'`,
}));
vi.mock("./api/currency/move", () => ({ accAccountId: async () => st.account }));
vi.mock("./referralCount", () => ({
  getInviterSisters: async (w: string) => [w, "w2.tg"],
  getInviterCanonicalWallet: async (w: string) => w,
  countUniqueReferrals: async (sisters: string[], since?: string, rule?: unknown) => {
    countCalls.push([sisters, since, rule]);
    return rule ? st.count : st.friends;
  },
}));

const { grantReferralBoxesIfDue, insertBoxesSql, describeTierProgress, boxRef } =
  await import("./referralTiers");

const inserts = () => sqls.filter((s) => s.includes("INSERT INTO yuplink.ref_reward"));

beforeEach(() => {
  sqls.length = 0;
  countCalls.length = 0;
  Object.assign(st, { count: 0, friends: 0, inserted: 0, account: "acc_I" });
});

describe("боксы за вехи", () => {
  it("нет засчитанных друзей — ничего не пишет", async () => {
    expect(await grantReferralBoxesIfDue("w1.tg")).toEqual({ count: 0, boxes: 0, friends: 0 });
    expect(inserts()).toHaveLength(0);
  });

  it("15 друзей с нуля — пять вех одним запросом, повтор упирается в ключ", async () => {
    st.count = 15;
    st.inserted = 5;
    expect(await grantReferralBoxesIfDue("w1.tg")).toEqual({ count: 15, boxes: 5, friends: 0 });
    const sql = inserts()[0];
    for (const m of [1, 3, 5, 10, 15]) expect(sql).toContain(`'refbox:acc_I:${m}'`);
    expect(sql).toContain("'cp_eu1k2rl8yG'");
    expect(sql).toContain("ON CONFLICT (source_ref) DO NOTHING");
  });

  it("боксы — новые друзья больше $15 (отсечка 22.10.2026), с 05.11 — за обучение; «Много друзей» — от $10, с 02.11.2026", async () => {
    await grantReferralBoxesIfDue("w1.tg");
    expect(countCalls).toEqual([
      [
        ["w1.tg", "w2.tg"],
        "2026-10-22T00:00:00Z",
        { minUsd: 15, strict: true, tutorialSince: "2026-11-05T00:00:00Z" },
      ],
      [["w1.tg", "w2.tg"], "2026-11-02T00:00:00Z", undefined],
    ]);
  });

  it("«Много друзей»: счёт ачивки — числом друзей, вниз не идёт", async () => {
    st.friends = 3;
    expect(await grantReferralBoxesIfDue("w1.tg")).toEqual({ count: 0, boxes: 0, friends: 3 });
    const sql = sqls.find((q) => q.includes("account_achievement"));
    expect(sql).toContain("'acc_I', 'friends', 3");
    expect(sql).toContain("GREATEST(yuplink.account_achievement.count, EXCLUDED.count)");
  });

  it("старая отметка (билеты/золото) больше не читается и вехи не режет", async () => {
    st.count = 3;
    st.inserted = 2;
    expect(await grantReferralBoxesIfDue("w1.tg")).toEqual({ count: 3, boxes: 2, friends: 0 });
    expect(sqls.some((q) => q.includes("referral_tier_tickets_granted"))).toBe(false);
    const sql = inserts()[0];
    for (const m of [1, 3]) expect(sql).toContain(`'refbox:acc_I:${m}'`);
    expect(sql).not.toContain("'refbox:acc_I:5'");
  });

  it("аккаунт не найден — счёт есть, боксов нет", async () => {
    st.count = 2;
    st.account = null;
    expect(await grantReferralBoxesIfDue("w1.tg")).toEqual({ count: 2, boxes: 0, friends: 0 });
    expect(inserts()).toHaveLength(0);
  });

  it("30 и 45 друзей — каждые 15 после 15-го", () => {
    const sql = insertBoxesSql("acc_I", [30, 45]);
    expect(sql).toContain("'refbox:acc_I:30'");
    expect(sql).toContain("'refbox:acc_I:45'");
    expect(boxRef("acc_I", 30)).toBe("refbox:acc_I:30");
  });
});

describe("прогресс для экрана", () => {
  it("пройдено, следующая веха, сетка", () => {
    expect(describeTierProgress(16)).toEqual({
      count: 16,
      currentTier: 5,
      nextThreshold: 30,
      maxTier: 6,
      thresholds: [1, 3, 5, 10, 15, 30],
    });
  });
});
