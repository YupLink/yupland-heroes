// Перевод разработчикам: «sending» пишется после подписи и до отправки — с
// хэшем, nonce и байтами; не подтвердился — в ошибке кошельки и причина, а не
// «1 из 2» (failed — это куски транзакций, а не получатели).
import { beforeEach, describe, expect, it, vi } from "vitest";

const sqls: string[] = [];
const st = { sendingSaved: true };
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    sqls.push(sql);
    return sql.includes("RETURNING id") ? (st.sendingSaved ? [{ id: "mb_1" }] : []) : null;
  },
}));
const sent: string[] = [];
vi.mock("../../near", () => ({
  BATCH_CHUNK_PAIRS: 10,
  getOperatingBalanceRaw: async () => "999999999999",
  invalidateBalanceCache: () => {},
  humanToRaw: (v: number) => BigInt(Math.round(v * 1e6)),
  ftTransferBatched: async (o: {
    items: Array<{ receiverId: string }>;
    onSigned: (h: string, m: { nonce: string; signedTx: string }) => Promise<void>;
  }) => {
    const receivers = o.items.map((i) => i.receiverId);
    try {
      await o.onSigned("TX1", { nonce: "42", signedTx: "BYTES" });
    } catch (e) {
      return { txHashes: [], paid: [], failed: [{ receivers, txHash: "", error: (e as Error).message }] };
    }
    sent.push("broadcast");
    return { txHashes: [], paid: [], failed: [{ receivers, txHash: "TX1", error: "не подтверждено" }] };
  },
}));

const { sendDevOnce, USDT_FT } = await import("./batch-steps");
const wallets = [
  { wallet: "owner.tg", share: 0.5 },
  { wallet: "partner.tg", share: 0.5 },
];

beforeEach(() => {
  sqls.length = 0;
  sent.length = 0;
  st.sendingSaved = true;
});

describe("шаг «dev» сорвался", () => {
  it("«sending» с хэшем, nonce и байтами; в ошибке — кошельки, причина и хэш", async () => {
    await expect(sendDevOnce("mb_1", [], USDT_FT, wallets, 71)).rejects.toThrow(
      "Шаг «dev»: перевод не подтвердился — owner.tg, partner.tg: не подтверждено (tx TX1)",
    );
    const all = sqls.join(" ");
    expect(all).toContain('"state":"sending"');
    expect(all).toContain('"hash":"TX1","nonce":"42","tx":"BYTES"');
    expect(all).not.toContain('"state":"done"');
  });

  it("пометка «sending» не записалась — транзакция не уходит", async () => {
    st.sendingSaved = false;
    await expect(sendDevOnce("mb_1", [], USDT_FT, wallets, 71)).rejects.toThrow(/не записалась/);
    expect(sent).toEqual([]);
  });

  it("«sending» с байтами — не повторяется, разберёт сверка; без байтов — владелец", async () => {
    const withTx = [{ name: "dev" as const, state: "sending" as const, amount: 71, hash: "H", nonce: "1", tx: "T", at: "" }];
    await expect(sendDevOnce("mb_1", withTx, USDT_FT, wallets, 71)).rejects.toThrow(/сверю с сетью сам/);
    const legacy = [{ name: "dev" as const, state: "sending" as const, amount: 71, at: "" }];
    await expect(sendDevOnce("mb_1", legacy, USDT_FT, wallets, 71)).rejects.toThrow(/проверь кошелёк/);
    expect(sent).toEqual([]);
  });
});
