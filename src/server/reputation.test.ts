// Кэш репутации Sendler: суммы за пределами integer доезжают до базы как есть.
//
// Боевой случай 21.10: у игрока NFT «baron» на −4 000 000 000,
// итого −4 651 524 000 — больше, чем вмещает integer. Колонку перевели в bigint
// (migrations/sendler-rep-01.sql); тест держит вторую половину: код не режет,
// не округляет и не теряет такое число по дороге и дописывает хвост списка.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const st = {
  chunks: [] as Row[][],
  settings: [] as Row[],
};

vi.mock("./db/pg", () => ({
  pg: {
    sendlerReputation: {
      upsert: async (rows: Row[]) => void st.chunks.push(rows),
    },
    settings: {
      upsert: async (row: Row) => void st.settings.push(row),
      findOne: async () => null,
    },
  },
}));

const { refreshReputation } = await import("./reputation");

const INT32_MIN = -(2 ** 31);
const HUGE_NEGATIVE = -4_651_524_000;

function stubSendler(items: Row[]) {
  vi.stubGlobal(
    "fetch",
    async () => new Response(JSON.stringify({ items, total: items.length }), { status: 200 }),
  );
}

beforeEach(() => {
  st.chunks = [];
  st.settings = [];
  vi.stubEnv("SENDLER_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("refreshReputation: суммы больше integer", () => {
  it("−4 651 524 000 уходит в upsert без изменений и получает анти-ранг #1", async () => {
    stubSendler([
      {
        owner: "top.tg",
        owner_rank: 1,
        total_reputation: 345_517_640,
        house: 6620,
        bonus_reputation: 0,
      },
      { owner: "zero.tg", owner_rank: null, total_reputation: 0, house: 0 },
      { owner: "minus.tg", owner_rank: null, total_reputation: -1_000, house: 10 },
      {
        owner: "player1.tg",
        owner_rank: null,
        total_reputation: HUGE_NEGATIVE,
        house: 390,
        bonus_reputation: 0,
      },
    ]);

    const r = await refreshReputation();

    expect(r.fetched).toBe(4);
    const rows = st.chunks.flat();
    const huge = rows.find((x) => x.wallet === "player1.tg");
    expect(HUGE_NEGATIVE).toBeLessThan(INT32_MIN);
    expect(huge?.total_reputation).toBe(HUGE_NEGATIVE);
    expect(huge?.negative_rank).toBe(1);
    expect(rows.find((x) => x.wallet === "minus.tg")?.negative_rank).toBe(2);
    expect(rows.find((x) => x.wallet === "zero.tg")?.negative_rank).toBeNull();
  });

  it("запись в хвостовой пачке (за 500-й строкой) тоже доезжает, отметка обновления пишется", async () => {
    const items: Row[] = Array.from({ length: 500 }, (_, i) => ({
      owner: `p${i}.tg`,
      owner_rank: i + 1,
      total_reputation: 1_000_000 - i,
    }));
    items.push({ owner: "player1.tg", owner_rank: null, total_reputation: HUGE_NEGATIVE });
    stubSendler(items);

    await refreshReputation();

    expect(st.chunks).toHaveLength(2);
    expect(st.chunks[1]).toEqual([
      expect.objectContaining({
        wallet: "player1.tg",
        total_reputation: HUGE_NEGATIVE,
        negative_rank: 1,
      }),
    ]);
    expect(st.settings.map((s) => s.key)).toContain("sendler_reputation_last_fetch");
    expect(st.settings).toContainEqual({ key: "sendler_reputation_negative_total", value: "1" });
  });
});
