// Авторассылка «Раздачи DARAI»: только в режиме «авто»; сумма — минимум за час
// наблюдений и свежего строгого счёта; замок до строгого счёта; держатели —
// только из Sendler; итог — в пачку и бота. База, пулы и сеть подменены.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ev: string[] = [];
const st = {
  rule: { mode: "auto" as "auto" | "manual", threshold: 1_000_000 },
  soft: 2_000_000,
  strict: 2_000_000,
  strictFail: false,
  windowMin: 1_500_000 as number | null,
  lockId: "mb_L" as string | null,
  lockThrows: false,
  source: "sendler",
  holders: 2,
  allPaid: true,
  items: [] as Array<{ recipient: string; amountHuman: number }>,
};

vi.mock("../../db/mcpClient", () => ({
  mcpExec: vi.fn(async (sql: string) => {
    const flat = sql.replace(/\s+/g, " ");
    const status = /SET status = '(\w+)'/.exec(flat);
    if (status) return void ev.push(`status:${status[1]}`);
    if (flat.startsWith("DELETE FROM yuplink.money_batch")) return void ev.push("unlock");
    if (flat.includes("INSERT INTO yuplink.money_batch")) {
      ev.push("lock");
      if (st.lockThrows) throw new Error("MCP timeout");
      return [{ _row: { id: st.lockId } }];
    }
    return null;
  }),
}));
vi.mock("../raid-shared", () => ({ sqlStr: (v: string) => `'${String(v).replace(/'/g, "''")}'` }));
vi.mock("./rules", () => ({ loadDist: async () => ({ rules: { darai_free: st.rule } }) }));
vi.mock("./observations", () => ({
  observe: async (v: number) => void ev.push(`obs:${v}`),
  observedMin: async () => st.windowMin,
}));
vi.mock("../darai-pools", () => ({
  daraiPools: async (o?: { strict?: boolean }) => {
    if (!o?.strict) return { payoutAvailable: st.soft };
    ev.push("strict");
    if (st.strictFail) throw new Error("Раскладка пулов не прочиталась");
    return { payoutAvailable: st.strict };
  },
}));
vi.mock("../payouts-plan", () => ({
  DARAI_FT_CONTRACT: "darai.tkn.near",
  DARAI_DECIMALS: 18,
  distributionPreview: async (_p: unknown, amount: number) => ({
    amount,
    legendary: { activeHoldersCount: st.holders, holdersSource: st.source },
  }),
  distributionItems: (p: { amount: number }) => [
    { recipient: "darai_duplo.near", amountHuman: p.amount / 2, tag: "duplo 50%" },
    { recipient: "h1.tg", amountHuman: p.amount / 2, tag: "legendary" },
  ],
}));
vi.mock("../../adminBatchPayoutRun", () => ({
  runAutoBatchPayout: async (o: { items: Array<{ recipient: string; amountHuman: number }> }) => {
    st.items = o.items;
    ev.push("payout");
    return {
      id: "apb_1",
      allPaid: st.allPaid,
      txHashes: ["H"],
      txError: st.allPaid ? null : "x",
      unpaid: st.allPaid ? [] : [o.items[1]],
    };
  },
}));
vi.mock("../../tg", () => ({ sendTgMessageToAdmins: async () => void ev.push("tg") }));

const { runFreeDaraiAuto, lockSql } = await import("./free-darai");

beforeEach(() => {
  ev.length = 0;
  Object.assign(st, {
    rule: { mode: "auto", threshold: 1_000_000 },
    soft: 2_000_000,
    strict: 2_000_000,
    strictFail: false,
    windowMin: 1_500_000,
    lockId: "mb_L",
    lockThrows: false,
    source: "sendler",
    holders: 2,
    allPaid: true,
    items: [],
  });
});

const sum = () => st.items.reduce((s, i) => s + i.amountHuman, 0);

describe("авторассылка «Раздачи DARAI»", () => {
  it("режим «вручную» — ничего не читает и не пишет", async () => {
    st.rule.mode = "manual";
    expect(await runFreeDaraiAuto()).toBeNull();
    expect(ev).toEqual([]);
  });

  it("сейчас ниже порога — только наблюдение", async () => {
    st.soft = 999_999;
    expect(await runFreeDaraiAuto()).toBeNull();
    expect(ev).toEqual(["obs:999999"]);
  });

  it("всплеск: сейчас выше порога, но за час бывало ниже (или наблюдаем меньше 40 минут) — не шлёт", async () => {
    st.windowMin = 500_000;
    expect(await runFreeDaraiAuto()).toBeNull();
    st.windowMin = null;
    expect(await runFreeDaraiAuto()).toBeNull();
    expect(ev.filter((e) => e === "lock")).toEqual([]);
  });

  it("замок занят — строгий счёт не нужен, ничего не шлёт", async () => {
    st.lockId = null;
    expect(await runFreeDaraiAuto()).toBeNull();
    expect(ev).toEqual(["obs:2000000", "lock"]);
  });

  it("замок не подтвердился — сообщение в бота, без рассылки", async () => {
    st.lockThrows = true;
    expect(await runFreeDaraiAuto()).toBeNull();
    expect(ev).toEqual(["obs:2000000", "lock", "tg"]);
  });

  it("шлёт минимум за час, а не всё, что видно сейчас", async () => {
    expect(await runFreeDaraiAuto()).toBe("mb_L");
    expect(ev).toEqual(["obs:2000000", "lock", "strict", "payout", "status:done", "tg"]);
    expect(sum()).toBe(1_500_000);
  });

  it("строгий счёт под замком меньше — шлёт его", async () => {
    st.strict = 1_200_000.555;
    await runFreeDaraiAuto();
    expect(sum()).toBe(1_200_000.55);
  });

  it("под замком порог уже не держится — замок снимается, без рассылки", async () => {
    st.strict = 10;
    expect(await runFreeDaraiAuto()).toBeNull();
    expect(ev).toEqual(["obs:2000000", "lock", "strict", "unlock"]);
  });

  it("строгий счёт не прочитался — пачка failed, без рассылки", async () => {
    st.strictFail = true;
    await runFreeDaraiAuto();
    expect(ev).toEqual(["obs:2000000", "lock", "strict", "status:failed", "tg"]);
  });

  it("держатели не из Sendler — не шлёт", async () => {
    st.source = "db-fallback";
    await runFreeDaraiAuto();
    expect(ev).not.toContain("payout");
    expect(ev).toContain("status:failed");
  });

  it("часть не дошла — пачка failed и держит замок", async () => {
    st.allPaid = false;
    await runFreeDaraiAuto();
    expect(ev).toEqual(["obs:2000000", "lock", "strict", "payout", "status:failed", "tg"]);
  });

  it("замок: час после авторассылки и ручных раздач, нет открытых пачек подписки и ждущих заявок", () => {
    const sql = lockSql("mb_1", 123.456).replace(/\s+/g, " ");
    expect(sql).toContain("bucket = 'darai_free' AND updated_at > now() - interval '60 minutes'");
    expect(sql).toContain("bucket <> 'darai_free' AND status IN ('running', 'failed')");
    expect(sql).toContain("status IN ('approved', 'done', 'failed') AND decided_at >");
    expect(sql).toContain("FROM yuplink.admin_payouts_pending");
    expect(sql).toContain("ON CONFLICT DO NOTHING");
    expect(sql).toContain("123.46");
  });
});
