// Самопочинка пачек: шаг «sending» разбирается по сети, вслепую ничего не
// переотправляется; те же подписанные байты — можно, они не исполнятся дважды.
import { beforeEach, describe, expect, it, vi } from "vitest";

const MIN = 60_000;
const st = {
  found: null as unknown,
  resend: { status: "unknown" } as { status: string; outcome?: unknown; errorData?: unknown },
  absent: false,
  rows: [] as unknown[],
  taken: true,
};
const ev: string[] = [];

vi.mock("./batch-resolve", async (orig) => ({
  ...(await orig<typeof import("./batch-resolve")>()),
  txOutcome: async () => st.found,
}));
vi.mock("../../nearSafe", () => ({
  sendSigned: async (hash: string, tx: string) => (ev.push(`resend:${hash}:${tx}`), { txHash: hash, ...st.resend }),
}));
vi.mock("../../rpc-absent", () => ({ txAbsentOnTwoProviders: async () => st.absent }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    const flat = sql.replace(/\s+/g, " ");
    if (flat.includes("FROM yuplink.money_batch WHERE bucket IN")) return st.rows;
    if (flat.includes("SET status = 'running'")) return st.taken ? (ev.push("take"), [{ id: "x" }]) : [];
    if (flat.includes("SET status = 'failed'")) return void ev.push("release"), null;
    const step = /steps \|\| '(.+)'::jsonb/.exec(flat);
    if (step) {
      const s = JSON.parse(step[1].replace(/''/g, "'"))[0];
      ev.push(`step:${s.name}:${s.state}${s.received ? `:${s.received}` : ""}`);
    }
    return null;
  },
}));
vi.mock("../raid-shared", () => ({ sqlStr: (v: string) => `'${String(v).replace(/'/g, "''")}'` }));
vi.mock("./batch", () => ({ runBatch: async (id: string) => void ev.push(`run:${id}`) }));
vi.mock("../../tg", () => ({ sendTgMessageToAdmins: async (t: string) => void ev.push(`tg:${t.slice(0, 2)}`) }));

const { judgeStep, healStuckBatches } = await import("./batch-heal");

const ago = (m: number) => new Date(Date.now() - m * MIN).toISOString();
const dev = (over: Record<string, unknown> = {}) => ({
  name: "dev" as const,
  state: "sending" as const,
  amount: 71,
  hash: "H1",
  nonce: "5",
  tx: "BYTES",
  at: ago(10),
  ...over,
});
const ok = { status: { SuccessValue: "" }, receipts_outcome: [] };
const fail = { status: { Failure: {} }, receipts_outcome: [] };
const swapOutcome = {
  status: { SuccessValue: "" },
  receipts_outcome: [
    {
      outcome: {
        executor_id: "usdt.tether-token.near",
        logs: [
          `EVENT_JSON:${JSON.stringify({
            event: "ft_transfer",
            data: [{ old_owner_id: "darai_gdrop.near", new_owner_id: "v2.ref-finance.near", amount: "2100000" }],
          })}`,
        ],
      },
    },
    { outcome: { executor_id: "darai.tkn.near", logs: ["Transfer 4200000000000000000000000 from v2.ref-finance.near to darai_gdrop.near"] } },
  ],
};

beforeEach(() => {
  process.env.NEAR_SIGNER_ACCOUNT_ID = "darai_gdrop.near";
  Object.assign(st, { found: null, resend: { status: "unknown" }, absent: false, rows: [], taken: true });
  ev.length = 0;
});

describe("разбор шага «sending» по сети", () => {
  it("без подписанных байтов или старше 12 ч — владельцу; свежий — ждём", async () => {
    expect((await judgeStep(dev({ tx: undefined }))).kind).toBe("owner");
    expect((await judgeStep(dev({ at: ago(13 * 60) }))).kind).toBe("owner");
    expect((await judgeStep(dev({ at: ago(1) }))).kind).toBe("wait");
    expect(ev).toEqual([]);
  });

  it("нашлась и прошла — done; нашлась и упала — перевод заново", async () => {
    st.found = ok;
    expect(await judgeStep(dev())).toEqual({ kind: "done", hash: "H1" });
    st.found = fail;
    expect((await judgeStep(dev())).kind).toBe("retry");
    expect(ev).toEqual([]);
  });

  it("обмен: прошёл — done с приходом по логам; упал — владельцу, не повторяем", async () => {
    const swap = dev({ name: "swap", amount: 2.1 });
    st.found = swapOutcome;
    expect(await judgeStep(swap)).toEqual({ kind: "done", hash: "H1", received: 4_200_000 });
    st.found = fail;
    expect((await judgeStep(swap)).kind).toBe("owner");
    st.found = ok; // прошёл, но прихода не видно
    expect((await judgeStep(swap)).kind).toBe("owner");
    // Ref откатил обмен: «успех» со значением "0" — USDT вернулись, можно повторить.
    st.found = { status: { SuccessValue: Buffer.from('"0"').toString("base64") }, receipts_outcome: [] };
    expect((await judgeStep(swap)).kind).toBe("retry");
  });

  it("не нашлась — те же байты ещё раз; прошла — done", async () => {
    st.resend = { status: "confirmed", outcome: ok };
    expect(await judgeStep(dev())).toEqual({ kind: "done", hash: "H1" });
    expect(ev).toEqual(["resend:H1:BYTES"]);
  });

  it("сеть отвергла (InvalidNonce/Expired): retry только если узел прямо говорит «такой нет»", async () => {
    st.resend = { status: "unknown", errorData: { data: { TxExecutionError: { InvalidTxError: { InvalidNonce: {} } } } } };
    expect((await judgeStep(dev())).kind).toBe("wait");
    st.absent = true;
    expect((await judgeStep(dev())).kind).toBe("retry");
    st.resend = { status: "unknown", errorData: { data: { TxExecutionError: { InvalidTxError: "Expired" } } } };
    expect((await judgeStep(dev())).kind).toBe("retry");
  });

  it("сеть молчит — ждём, даже если узел «не знает» транзакцию", async () => {
    st.absent = true;
    st.resend = { status: "unknown", errorData: { message: "timeout" } };
    expect((await judgeStep(dev())).kind).toBe("wait");
  });
});

describe("проход по вставшим пачкам", () => {
  const row = (steps: unknown[], idle = true) => ({
    id: "mb_1",
    bucket: "sub_usd",
    status: "failed",
    steps,
    updated_at: "2026-10-03 07:48:35+00",
    idle,
  });

  it("шага в полёте нет: продолжаем, если пачка стоит 15+ минут; не больше 3 раз", async () => {
    st.rows = [row([{ name: "dev", state: "retry", amount: 71, at: ago(60) }], false)];
    await healStuckBatches();
    expect(ev).toEqual([]);
    st.rows = [row([{ name: "dev", state: "retry", amount: 71, at: ago(60) }])];
    for (let i = 0; i < 4; i++) await healStuckBatches();
    expect(ev).toEqual(["take", "run:mb_1", "take", "run:mb_1", "take", "run:mb_1"]);
  });

  it("перевод прошёл в сети — done и продолжение; не ушёл — retry и продолжение", async () => {
    st.rows = [row([dev()])];
    st.found = ok;
    await healStuckBatches();
    expect(ev).toEqual(["take", "step:dev:done", "tg:🔧", "run:mb_1"]);
    ev.length = 0;
    st.found = fail;
    await healStuckBatches();
    expect(ev).toEqual(["take", "step:dev:retry", "tg:🔧", "run:mb_1"]);
  });

  it("пачку уже забрал другой воркер — шагов не пишем", async () => {
    st.rows = [row([dev()])];
    st.found = ok;
    st.taken = false;
    await healStuckBatches();
    expect(ev).toEqual([]);
  });

  it("сеть не ответила — пачка забрана, но возвращена во «встала»", async () => {
    st.rows = [row([dev()])];
    await healStuckBatches();
    expect(ev).toEqual(["take", "resend:H1:BYTES", "release"]);
  });

  it("свежий шаг — сеть не трогаем и пачку не забираем", async () => {
    st.rows = [row([dev({ at: ago(1) })])];
    await healStuckBatches();
    expect(ev).toEqual([]);
  });

  it("три повтора шага уже были — четвёртого нет, письмо владельцу", async () => {
    const r = { name: "dev", state: "retry", amount: 71, at: ago(60) };
    st.rows = [{ ...row([r, r, r, dev()]), id: "mb_cap" }];
    st.found = fail;
    await healStuckBatches();
    expect(ev).toEqual(["take", "release", "tg:⚠️"]);
  });

  it("старый шаг без байтов — письмо владельцу, пачку не трогаем", async () => {
    st.rows = [row([dev({ tx: undefined, hash: undefined, nonce: undefined })])];
    await healStuckBatches();
    expect(ev).toEqual(["tg:⚠️"]);
  });
});
