// Сбор отнятых шахт частью «Собрать со всех шахт» (§8.71). Базу подменяет
// журнал в памяти с правилами raid_mine_lost_claim (minecap-01): только своя
// строка, зачисление ровно раз, собранная уходит из выборки; ачивка «Хозяин
// шахт» по её правилу (DARAI — очко за 1 000).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Line = {
  id: string;
  acc: string;
  resource: string | null;
  token: string | null;
  amount: number;
  claimed: boolean;
};

const s = vi.hoisted(() => ({
  me: "acc_me" as string | null,
  log: [] as Line[],
  balance: new Map<string, number>(),
  sql: [] as string[],
  bumps: [] as Array<[string, string, number]>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "me.near" }));
vi.mock("@/server/rateGate", () => ({ actionGate: async () => {} }));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => s.me }));
vi.mock("@/server/api/achievements/bump", () => ({
  bumpAchievement: (acc: string, track: string, n: number) =>
    s.bumps.push([acc, track, Math.floor(n)]),
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    const all = /old_account = '([^']+)'/.exec(sql);
    if (sql.includes("FROM yuplink.raid_mine_capture_log l") && all) {
      return s.log.filter((l) => l.acc === all[1] && !l.claimed).map((l) => ({ id: l.id }));
    }
    const m = /raid_mine_lost_claim\('([^']+)', '([^']+)', '([^']+)'\)/.exec(sql);
    if (m) {
      const line = s.log.find((l) => l.id === m[1]);
      if (!line || line.acc !== m[2]) throw new Error("MCP: mine_lost_gone");
      if (line.claimed)
        return [{ res: { was: true, amount: 0, resource: line.resource, token: line.token } }];
      line.claimed = true;
      const key = line.token ?? line.resource ?? "?";
      s.balance.set(`${line.acc}:${key}`, (s.balance.get(`${line.acc}:${key}`) ?? 0) + line.amount);
      return [
        { res: { was: false, amount: line.amount, resource: line.resource, token: line.token } },
      ];
    }
    return [];
  },
}));

const { claimLostRows } = await import("./mine-lost-claim");
const claim = () => claimLostRows("acc_me", "me.near");

beforeEach(() => {
  s.me = "acc_me";
  s.sql = [];
  s.bumps = [];
  s.balance = new Map();
  s.log = [
    { id: "mcl_w", acc: "acc_me", resource: "wood", token: null, amount: 40, claimed: false },
    {
      id: "mcl_d",
      acc: "acc_me",
      resource: "token",
      token: "Darai",
      amount: 30000,
      claimed: false,
    },
    { id: "mcl_z", acc: "acc_me", resource: "stone", token: null, amount: 0, claimed: false },
    { id: "mcl_x", acc: "acc_other", resource: "gold", token: null, amount: 9, claimed: false },
  ];
});

describe("сбор отнятых шахт («Собрать со всех шахт»)", () => {
  it("только свои строки; зачисляет ровно раз; DARAI — очко «Хозяина шахт» за 1 000", async () => {
    const r = await claim();
    expect(r.done).toEqual(["mcl_w", "mcl_d", "mcl_z"]);
    expect(r.credited).toEqual({ wood: 40, Darai: 30000 });
    const list = s.sql.find((q) => q.includes("FROM yuplink.raid_mine_capture_log l")) ?? "";
    expect(list).toContain("l.old_account = 'acc_me' AND l.claimed_at IS NULL");
    expect(s.sql).toContain(
      "SELECT yuplink.raid_mine_lost_claim('mcl_w', 'acc_me', 'me.near') AS res",
    );
    expect(s.bumps).toEqual([
      ["acc_me", "minelord", 40],
      ["acc_me", "minelord", 30],
    ]);
    expect(s.log.find((l) => l.id === "mcl_x")?.claimed).toBe(false);
    expect(s.balance.get("acc_other:gold")).toBeUndefined();
    // Повтор — строк нет (ушли из списка), ни денег, ни ачивки.
    s.bumps = [];
    expect(await claim()).toEqual({ done: [], credited: {} });
    expect(s.balance.get("acc_me:wood")).toBe(40);
    expect(s.bumps).toEqual([]);
  });

  it("чужая/исчезнувшая строка в выборке — мимо, остальные собираются", async () => {
    s.log.push({
      id: "mcl_y",
      acc: "acc_other",
      resource: "gold",
      token: null,
      amount: 5,
      claimed: false,
    });
    s.log[0].acc = "acc_me";
    const orig = s.log.find((l) => l.id === "mcl_d");
    if (orig) orig.acc = "acc_other";
    const r = await claim();
    expect(r.done).toEqual(["mcl_w", "mcl_z"]);
    expect(r.credited).toEqual({ wood: 40 });
  });
});
