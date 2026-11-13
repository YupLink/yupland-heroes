// Награды за друзей: список «ждёт» и клейм. Клейм — один запрос (CAS + выдача),
// повтор и вторая вкладка второй раз не выдают. База подменена.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  kind: "box" | "usdt";
  status: string;
  pack_id: string | null;
  amount: string;
  token: string | null;
};
const st = {
  row: null as Row | null,
  /** что вернёт CAS-запрос клейма */
  claimed: 1,
  /** статус при перечитывании после неудачного CAS */
  after: "claimed",
  pending: [] as Array<Record<string, unknown>>,
};
const sqls: string[] = [];
const grantBoxes = vi.fn(async () => ({ count: 0, boxes: 0 }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Fn = (ctx: { data: unknown }) => unknown;
    const wrap = (fn: Fn, validate?: (d: unknown) => unknown) => (args?: { data?: unknown }) =>
      fn({ data: validate ? validate(args?.data) : args?.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (validate: (d: unknown) => unknown) => ({
        handler: (fn: Fn) => wrap(fn, validate),
      }),
    };
  },
}));
let reads = 0;
vi.mock("../db/mcpClient", () => ({
  mcpExec: vi.fn(async (sql: string) => {
    const flat = sql.replace(/\s+/g, " ").trim();
    sqls.push(flat);
    if (flat.includes("UPDATE yuplink.ref_reward SET status = 'claimed'"))
      return [{ _row: { claimed: st.claimed } }];
    if (flat.includes("FROM yuplink.ref_reward WHERE id =")) {
      reads++;
      if (!st.row) return [];
      return [reads > 1 ? { ...st.row, status: st.after } : st.row];
    }
    if (flat.includes("FROM yuplink.ref_reward r")) return st.pending;
    return [];
  }),
}));
vi.mock("./raid-shared", () => ({ sqlStr: (v: string) => `'${String(v).replace(/'/g, "''")}'` }));
vi.mock("../auth", () => ({ getCurrentWallet: () => "i.tg" }));
vi.mock("../maintenance", () => ({ assertNotMaintenance: () => {} }));
vi.mock("../rateGate", () => ({ moneyGate: async () => {} }));
vi.mock("./account-rollout", () => ({ requireAccountUser: async () => "i.tg" }));
vi.mock("./currency/move", () => ({ accAccountId: async () => "acc_I" }));
vi.mock("./user-shared", () => ({ accountIdOf: async () => "acc_I" }));
vi.mock("./chips-pack-fallback", () => ({
  resolveGrantablePack: async (id: string) => `${id}_fb`,
}));
vi.mock("../referralTiers", () => ({ grantReferralBoxesIfDue: grantBoxes }));

const { claimReferralReward, getMyReferralRewards } = await import("./referral-rewards");
const claim = (id = "rrb_1") => claimReferralReward({ data: { id } });
const claimSql = () =>
  sqls.find((s) => s.includes("UPDATE yuplink.ref_reward SET status = 'claimed'"));

const box: Row = {
  id: "rrb_1",
  kind: "box",
  status: "pending",
  pack_id: "cp_eu1k2rl8yG",
  amount: "1",
  token: null,
};
const usdt: Row = {
  id: "rru_1",
  kind: "usdt",
  status: "pending",
  pack_id: null,
  amount: "0.7",
  token: "USDT",
};

beforeEach(() => {
  sqls.length = 0;
  reads = 0;
  Object.assign(st, { row: null, claimed: 1, after: "claimed", pending: [] });
  grantBoxes.mockClear();
});

describe("клейм бокса", () => {
  it("строка → claimed и пак в инвентарь одним запросом, подмена исчерпанного пака", async () => {
    st.row = box;
    expect(await claim()).toMatchObject({ ok: true, kind: "box", already: false });
    const sql = claimSql()!;
    expect(sql).toContain("kind = 'box' AND status = 'pending'");
    expect(sql).toContain("INSERT INTO yuplink.chip_pack_grants");
    expect(sql).toContain("'cp_eu1k2rl8yG_fb', 'referral', 'refbox:' || c.id");
    expect(sql).toContain("FROM c");
  });

  it("уже забран — второй выдачи нет, запроса клейма нет", async () => {
    st.row = { ...box, status: "claimed" };
    expect(await claim()).toMatchObject({ ok: true, already: true });
    expect(claimSql()).toBeUndefined();
  });

  it("гонка: соседний запрос забрал первым — «уже забрано», не ошибка", async () => {
    st.row = box;
    st.claimed = 0;
    expect(await claim()).toMatchObject({ ok: true, already: true });
  });

  it("CAS не прошёл, а строка всё ещё ждёт — просим повторить", async () => {
    st.row = box;
    st.claimed = 0;
    st.after = "pending";
    await expect(claim()).rejects.toThrow("refrw.retry");
  });

  it("чужая или несуществующая строка — отказ", async () => {
    await expect(claim("rrb_x")).rejects.toThrow("refrw.not_found");
    expect(sqls.find((s) => s.includes("FROM yuplink.ref_reward WHERE id ="))).toContain(
      "account_id = 'acc_I'",
    );
  });
});

describe("клейм USDT", () => {
  it("на счёт видом ref_sub ключом refsub:<id> — тем же запросом, что CAS", async () => {
    st.row = usdt;
    expect(await claim("rru_1")).toMatchObject({
      ok: true,
      kind: "usdt",
      amount: 0.7,
      token: "USDT",
      already: false,
    });
    const sql = claimSql()!;
    expect(sql).toContain("kind = 'usdt' AND status = 'pending'");
    expect(sql).toContain(
      "yuplink.acc_move(c.account_id, c.token, c.amount, 'ref_sub', 'refsub:' || c.id, 'i.tg')",
    );
  });
});

describe("список «ждёт получения»", () => {
  it("боксы и доллары раздельно, сумма долларов", async () => {
    st.pending = [
      {
        id: "rrb_1",
        kind: "box",
        status: "pending",
        milestone: 15,
        pack_id: "cp",
        token: null,
        amount: "1",
        created_at: "t",
        pack_name: "Bonus Box",
        pack_image: null,
      },
      {
        id: "rru_1",
        kind: "usdt",
        status: "pending",
        milestone: null,
        pack_id: null,
        token: "USDT",
        amount: "0.7",
        created_at: "t",
      },
      {
        id: "rru_2",
        kind: "usdt",
        status: "pending",
        milestone: null,
        pack_id: null,
        token: "USDT",
        amount: "2.5",
        created_at: "t",
      },
    ];
    const r = await getMyReferralRewards();
    expect(r.boxes.map((b) => b.milestone)).toEqual([15]);
    expect(r.usdt).toHaveLength(2);
    expect(r.usdtTotal).toBe(3.2);
    // догон вех при опросе
    expect(grantBoxes).toHaveBeenCalledWith("i.tg");
    expect(sqls.find((s) => s.includes("FROM yuplink.ref_reward r"))).toContain(
      "r.status = 'pending'",
    );
  });
});
