// Сверка индексатора: проверки в SQL, здоровье, дубли, запись расхождений, письма.
import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: Array<{ id: number; text: string }> = [];
const sqls: string[] = [];
let issueRows: unknown[] = [];
let freshRows: unknown[] = [];
let dayClaimed = true;

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    sqls.push(sql);
    if (sql.includes("'deposit_not_on_chain' AS kind")) return issueRows;
    if (sql.includes("AS stats")) return [{ stats: STATS }];
    if (sql.includes("FROM yuplink.chain_recon_run WHERE at <="))
      return [{ hour: { errors: 1 }, day: { errors: 0, rate_limited: 2, polls: 10 } }];
    // Обёртка mcpExec кладёт запись в свой CTE: вложенный WITH с записью — ошибка, как в Postgres.
    if (/^\s*WITH\b/.test(sql) && /\b(INSERT|UPDATE|DELETE)\b/.test(sql))
      throw new Error("nested WITH with DML");
    if (sql.includes("INSERT INTO yuplink.chain_recon_issue")) return freshRows;
    if (sql.includes("chain_recon_daily")) return dayClaimed ? [{ value: "x" }] : [];
    return [];
  },
}));
vi.mock("@/server/salesNotify", () => ({ adminChats: async () => ({ to: [1, 2], owner: 1 }) }));
vi.mock("@/server/tg", () => ({
  tgSendMessage: async (id: number, text: string) => void sent.push({ id, text }),
}));

const STATS = {
  since: "2026-11-02T00:00:00Z",
  deposits: { sendler: 10, sendler24: 1, matched: 10, chainIn: 11, chainIn24: 1, credited: 11 },
  payouts: { chainOut: 19, chainOut24: 1, recorded: 19 },
  nft: {
    total: 182294,
    same: 182053,
    burnedOurs: 240,
    movedAfterSnap: 1,
    differs: 0,
    onlyOurs: 0,
    onlySendler: 0,
  },
  health: { ok_at: new Date().toISOString(), polls: 100, errors: 3, rate_limited: 40, err: null },
  cursors: {},
};

const { reconIssuesSql, reconStatsSql } = await import("./recon-sql");
const { healthIssues, dedupeIssues, upsertIssuesSql, resolveIssuesSql, runRecon, STALE_MS } =
  await import("./recon");
const { notifyDaily } = await import("./recon-notify");
const { alarmText, dailyText } = await import("./recon-text");

beforeEach(() => {
  sent.length = 0;
  sqls.length = 0;
  issueRows = [];
  freshRows = [];
  dayClaimed = true;
});

describe("проверки сверки (SQL)", () => {
  it("все шесть видов расхождений, свои кошельки и NFT-контракты — в запросе", () => {
    const sql = reconIssuesSql(["darai_gdrop.near"], ["yuplandshop.mintbase1.near"]);
    for (const k of [
      "deposit_not_on_chain",
      "chain_not_credited",
      "deposit_amount_mismatch",
      "payout_not_recorded",
      "payout_not_on_chain",
      "nft_owner_differs",
    ])
      expect(sql).toContain(`'${k}'`);
    expect(sql).toContain("'darai_gdrop.near'");
    expect(sql).toContain("'yuplandshop.mintbase1.near'");
    // Обмены пачек денег — свои: их хэши в шагах money_batch.
    expect(sql).toContain("FROM yuplink.money_batch");
    expect(sql).toContain("interval '15 minutes'");
  });

  it("числа: пополнения, выплаты, NFT, здоровье", () => {
    const sql = reconStatsSql(["darai_gdrop.near"], ["yuplandshop.mintbase1.near"]);
    for (const k of [
      "'deposits'",
      "'payouts'",
      "'nft'",
      "'burnedOurs'",
      "'movedAfterSnap'",
      "'health'",
    ])
      expect(sql).toContain(k);
  });
});

describe("здоровье индексатора", () => {
  it("свежий проход — тихо; молчит дольше 5 минут — тревога; много ошибок — предупреждение", () => {
    const now = Date.now();
    expect(
      healthIssues(
        { ...STATS, health: { ok_at: new Date(now - 60_000).toISOString() } } as never,
        now,
        0,
      ),
    ).toEqual([]);
    const stale = healthIssues(
      { ...STATS, health: { ok_at: new Date(now - STALE_MS - 1).toISOString() } } as never,
      now,
      0,
    );
    expect(stale.map((i) => [i.kind, i.severity])).toEqual([["indexer_stale", "alarm"]]);
    expect(healthIssues({ ...STATS, health: null } as never, now, 0)[0].kind).toBe("indexer_stale");
    expect(healthIssues(STATS as never, now, 21).map((i) => i.kind)).toEqual(["indexer_errors"]);
  });
});

describe("запись расхождений", () => {
  const a = {
    kind: "chain_not_credited",
    severity: "alarm" as const,
    key: "H1",
    detail: { amount: "1" },
  };
  it("одна транзакция с двумя переводами — одно расхождение", () => {
    expect(dedupeIssues([a, { ...a, detail: { amount: "2" } }])).toHaveLength(1);
  });

  it("нет расхождений — вставки нет, все открытые закрываются; есть — одна команда без вложенного WITH", () => {
    expect(upsertIssuesSql([])).toBeNull();
    expect(resolveIssuesSql([])).toContain("SET resolved_at = now()");
    const some = upsertIssuesSql([a])!;
    expect(some.trimStart().startsWith("INSERT INTO yuplink.chain_recon_issue")).toBe(true);
    expect(some).not.toMatch(/\bWITH\b/);
    expect(some).toContain("RETURNING id, kind, severity, key, detail, notified_at");
    expect(resolveIssuesSql([a])).toContain("id NOT IN ('chain_not_credited:H1')");
  });
});

describe("прогон и письма", () => {
  it("новая тревога — письмо владельцу один раз, отметка notified_at", async () => {
    issueRows = [
      {
        kind: "payout_not_recorded",
        severity: "alarm",
        key: "TX9",
        detail: JSON.stringify({ to: "x.near", amount: "5" }),
      },
    ];
    freshRows = [
      {
        id: "payout_not_recorded:TX9",
        kind: "payout_not_recorded",
        severity: "alarm",
        key: "TX9",
        detail: { to: "x.near" },
        notified_at: null,
      },
      // Уже разосланная тревога второй раз не пишется.
      {
        id: "payout_not_recorded:OLD",
        kind: "payout_not_recorded",
        severity: "alarm",
        key: "OLD",
        detail: {},
        notified_at: "2026-11-06T00:00:00Z",
      },
    ];
    const stats = await runRecon(["darai_gdrop.near"], ["yuplandshop.mintbase1.near"]);
    expect(stats.day).toEqual({ errors: 3, rateLimited: 38, polls: 90 });
    const alarms = sent.filter((m) => m.text.includes("новые расхождения"));
    expect(alarms.map((m) => m.id)).toEqual([1]); // только владельцу
    expect(alarms[0].text).toContain("без записи о выплате");
    expect(alarms[0].text).not.toContain("OLD");
    expect(alarms[0].text).toContain("новые расхождения — 1");
    expect(sqls.some((s) => s.includes("SET notified_at = now()"))).toBe(true);
    expect(sqls.some((s) => s.includes("INSERT INTO yuplink.chain_recon_run"))).toBe(true);
  });

  it("сводка — после 06:00 UTC и один раз в сутки", async () => {
    await notifyDaily(STATS as never, 0, new Date("2026-11-06T05:59:00Z"));
    expect(sent).toHaveLength(0);
    dayClaimed = false;
    await notifyDaily(STATS as never, 0, new Date("2026-11-06T07:00:00Z"));
    expect(sent).toHaveLength(0);
    dayClaimed = true;
    await notifyDaily(STATS as never, 0, new Date("2026-11-06T07:00:00Z"));
    expect(sent.map((m) => m.id)).toEqual([1]);
  });

  it("тексты: тревога с хэшем, сводка с числами", () => {
    const text = alarmText([
      {
        kind: "chain_not_credited",
        severity: "alarm",
        key: "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopq1234",
        detail: { from: "p.tg", token: "darai.tkn.near", amount: "10" },
      },
    ]);
    expect(text).toContain("в игре не зачтено");
    expect(text).toContain("ABCDEFGH…1234 · p.tg · darai.tkn.near · 10");
    const daily = dailyText(
      { ...STATS, day: { errors: 0, rateLimited: 5, polls: 2000 } } as never,
      0,
    );
    expect(daily).toContain("расхождений нет");
    expect(daily).toContain("выплат записано 19/19");
    expect(daily).toContain("сожжено (у Sendler ещё числятся) 240");
  });
});
