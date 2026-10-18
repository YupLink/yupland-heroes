// Пополнения пула с казны: «в пути» (моложе 30 минут) — только то, что ещё
// не стало ни товаром, ни зачислением на счёт игрока. darai_collection.near —
// ещё и игрок: его ввод на свой счёт не должен вычитаться второй раз.
import { beforeEach, describe, expect, it, vi } from "vitest";

const MIN = 60_000;
const st = {
  items: [] as Array<Record<string, unknown>>,
  claimed: new Set<string>(),
  inserted: [] as string[],
};

vi.mock("../sendler", () => ({
  SENDLER_API_ROOT: "https://sendler.test",
  fetchWithRetry: async (url: string) => ({
    ok: true,
    json: async () => ({
      items: new URL(url).searchParams.get("wallet_id") === "darai_collection.near" ? st.items : [],
      next_cursor: null,
    }),
  }),
}));
vi.mock("../near", () => ({ rawToHuman: (raw: string) => String(Number(BigInt(raw) / 10n ** 18n)) }));
vi.mock("../db/mcpClient", () => ({
  mcpExec: async () => [...st.claimed].map((tx) => ({ tx, claimed: true })),
}));
vi.mock("./darai-pools-move", () => ({
  poolRef: (k: string, r: string) => `${k}:${r}`,
  insertPoolMove: async (o: { ref: string }) => (st.inserted.push(o.ref), { inserted: true }),
  poolTotals: async () => ({ deposited: 0 }),
}));
vi.mock("./receipt-guard", () => ({ CHECKS: { account: (tx: string) => `SELECT 1 WHERE ${tx} IS NOT NULL` } }));

const { syncCollectionDeposits } = await import("./darai-pools-sync");

const tr = (hash: string, millions: number, minsAgo: number) => ({
  receiver_id: "darai_gdrop.near",
  tx_hash: hash,
  receipt_id: `r_${hash}`,
  amount: (BigInt(millions * 1e6) * 10n ** 18n).toString(),
  block_timestamp: new Date(Date.now() - minsAgo * MIN).toISOString().replace("Z", ""),
  memo: "",
});

beforeEach(() => {
  process.env.SENDLER_API_KEY = "k";
  st.items = [];
  st.claimed = new Set();
  st.inserted = [];
});

describe("пополнения казны в пути", () => {
  it("свежий ввод на счёт игрока (квитанция занята) — не «в пути»", async () => {
    st.items = [tr("h_player", 150, 5), tr("h_treasury", 400, 10)];
    st.claimed = new Set(["h_player"]);
    const r = await syncCollectionDeposits();
    expect(r.unsettled).toBe(400_000_000);
    expect(st.inserted).toEqual([]);
  });

  it("старше 30 минут: казна — в пул, ввод игрока — нет", async () => {
    st.items = [tr("h_player", 150, 40), tr("h_treasury", 400, 45)];
    st.claimed = new Set(["h_player"]);
    const r = await syncCollectionDeposits();
    expect(r.unsettled).toBe(0);
    expect(st.inserted).toEqual(["collection_deposit:r_h_treasury"]);
  });
});
