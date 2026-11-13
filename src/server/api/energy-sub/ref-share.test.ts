// Рефка золотом с подписки друга (§8.101): строка начисления пригласившему и доля
// фонда выкупа — тем же запросом, что подписка (FROM sub — повтор не задваивает).
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = {
  inviterWallet: null as string | null,
  inviterTg: null as string | null,
  inviterAccount: "acc_I",
  joinedAt: "2026-11-02T00:00:00+00:00" as string | null,
};
const sqls: string[] = [];

vi.mock("../../db/mcpClient", () => ({
  mcpExec: vi.fn(async (sql: string) => {
    const flat = sql.replace(/\s+/g, " ").trim();
    sqls.push(flat);
    if (flat.includes("FROM yuplink.referrals"))
      return st.inviterWallet
        ? [{ inviter_wallet: st.inviterWallet, inviter_tg: st.inviterTg, joined_at: st.joinedAt }]
        : [];
    return null;
  }),
}));
vi.mock("../raid-shared", () => ({ sqlStr: (v: string) => `'${String(v).replace(/'/g, "''")}'` }));
vi.mock("../currency/move", () => ({ accAccountId: async () => st.inviterAccount }));

const { createSubSql, subIdOf } = await import("./buy-sql");
const { inviterAccountOf } = await import("./ref-share");

const tier = {
  id: "esub_novice",
  name: "Новичок",
  nameEn: "Novice",
  priceUsd: 7,
  energyPerDay: 500,
  boxPackId: "cp_eu1k2rl8yG",
  boxesPerDay: 1,
  days: 30,
  active: true,
  sort: 1,
  boxName: null,
  boxImage: null,
  noDecay: false,
  licenseTier: null,
  withdrawBonus: 0,
};
const base = {
  subId: subIdOf("r1"),
  account: "acc_F",
  wallet: "f.tg",
  tier,
  rate: null,
  payRef: "r1",
};
const flat = (s: string) => s.replace(/\s+/g, " ");

beforeEach(() => {
  sqls.length = 0;
  st.inviterWallet = null;
  st.inviterTg = null;
  st.inviterAccount = "acc_I";
  st.joinedAt = "2026-11-02T00:00:00+00:00";
});

describe("SQL подписки с пригласившим (рефка золотом, §8.101)", () => {
  it("USDT, 10 %: доля фонда выкупа — в корзину банка, корзины подписки — с остатка", () => {
    const sql = flat(
      createSubSql({ ...base, token: "USDT", amount: 7, ref: { inviter: "acc_I", pct: 10 } }),
    );
    // остаток 6,3 по 30/70 (без доли было бы 2.1 / 4.9)
    expect(sql).toContain("'sub_usd_map', 'USDT', 1.89000000");
    expect(sql).toContain("'sub_usd', 'USDT', 4.41000000");
    expect(sql).toContain(
      "'bank_usd', 'USDT', 0.70000000, 'income', 'esub:' || sub.id || ':ref_bb' FROM sub",
    );
    // пригласившему — строка начисления: $7 → 7 000 золота, 10 % → 700
    expect(sql).toContain(
      "SELECT 'sub:' || sub.id, 'acc_F', 'acc_I', 'sub', 'USDT', 7, 7.00, 7000, 10, 700, 0.70000000 FROM sub",
    );
    expect(sql).toContain("'friendbuy'");
    expect(sql).not.toContain("ref_reward");
  });

  it("без пригласившего — корзины целиком, ни доли, ни строки", () => {
    const sql = flat(createSubSql({ ...base, token: "USDT", amount: 7, ref: null }));
    expect(sql).toContain("'sub_usd_map', 'USDT', 2.10000000");
    expect(sql).toContain("'sub_usd', 'USDT', 4.90000000");
    expect(sql).not.toContain("ref_spend");
  });

  it("DARAI, 14 %: доля — в очередь откупа банка; звёзды — в свою корзину", () => {
    const d = flat(
      createSubSql({
        ...base,
        token: "Darai",
        amount: 1000,
        rate: 2,
        ref: { inviter: "acc_I", pct: 14 },
      }),
    );
    expect(d).toContain("'Darai', 140, 'referral', 'refbb:sub:' || sub.id FROM sub");
    expect(d).toContain("'sub_burn', 'Darai', 129.00000000"); // 15 % от 860
    expect(d).toContain("7000, 14, 980, 140 FROM sub");
    const s = flat(
      createSubSql({ ...base, token: "STARS", amount: 593, ref: { inviter: "acc_I", pct: 10 } }),
    );
    // звёзды — нам на счёт целиком, в фонд выкупа не идут (02.11)
    expect(s).not.toContain("ref_bb_stars");
    expect(s).toContain("'sub_stars', 'STARS', 593.00000000");
    expect(s).toContain("INSERT INTO yuplink.ref_spend"); // золото пригласившему — как всем
  });
});

describe("кто пригласил покупателя", () => {
  it("нет приглашения — null", async () => {
    expect(await inviterAccountOf("acc_F", "f.tg")).toBeNull();
  });

  it("есть — аккаунт пригласившего; ищется по всем кошелькам аккаунта", async () => {
    st.inviterWallet = "i.tg";
    expect(await inviterAccountOf("acc_F", "f.tg")).toBe("acc_I");
    const q = sqls.find((x) => x.includes("FROM yuplink.referrals"))!;
    expect(q).toContain("friend_wallet = 'f.tg'");
    expect(q).toContain("u.account_id = 'acc_F'");
  });

  it("свои строки (тот же аккаунт или Telegram) отсекаются в SQL до LIMIT 1", async () => {
    st.inviterWallet = "i.tg";
    await inviterAccountOf("acc_F", "f.tg");
    const q = sqls.find((x) => x.includes("FROM yuplink.referrals"))!;
    const [filter, tail] = q.split("ORDER BY");
    expect(tail).toContain("LIMIT 1");
    expect(filter).toContain("r.inviter_wallet <> 'f.tg'");
    expect(filter).toContain("AND NOT EXISTS");
    expect(filter).toContain("iu.account_id = 'acc_F'");
    expect(filter).toContain("iu.telegram_id = ANY (my.tgs)");
    expect(filter).toContain("ia.telegram_id = ANY (my.tgs)");
    // Telegram покупателя — со всех его кошельков и с самого аккаунта
    expect(filter).toContain("u.account_id = 'acc_F' OR u.wallet = 'f.tg'");
    expect(filter).toContain("a.id = 'acc_F'");
  });

  it("сам себя пригласил (сестринский кошелёк) — null", async () => {
    st.inviterWallet = "f2.tg";
    st.inviterAccount = "acc_F";
    expect(await inviterAccountOf("acc_F", "f.tg")).toBeNull();
  });

  it("пригласил Google-игрок (id ≥ 2^52) — доли нет; Telegram — есть", async () => {
    st.inviterWallet = "tg4503599627370497";
    st.inviterTg = "4503599627370497";
    expect(await inviterAccountOf("acc_F", "f.tg")).toBeNull();
    st.inviterTg = "700000002";
    expect(await inviterAccountOf("acc_F", "f.tg")).toBe("acc_I");
  });
});

describe("только новые друзья (02.11.2026: прежним не компенсируем)", () => {
  it("связь с 02.11 — пригласивший есть; раньше или без даты — нет", async () => {
    st.inviterWallet = "i.tg";
    expect(await inviterAccountOf("acc_F", "f.tg", "2026-11-02T00:00:00Z")).toBe("acc_I");
    st.joinedAt = "2026-11-01T00:00:00+00:00";
    expect(await inviterAccountOf("acc_F", "f.tg", "2026-11-02T00:00:00Z")).toBeNull();
    st.joinedAt = null;
    expect(await inviterAccountOf("acc_F", "f.tg", "2026-11-02T00:00:00Z")).toBeNull();
    expect(await inviterAccountOf("acc_F", "f.tg")).toBe("acc_I");
  });
});
