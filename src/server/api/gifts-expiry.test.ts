// Подарок сгорает через 48 часов: список отдаёт живые, клейм требует живой
// срок и честно говорит «сгорел», зачистка идемпотентна, срок продлевается
// при срыве выдачи. База подменена: смотрим на SQL и на ответ ручек.
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const state = {
  list: [] as unknown[],
  claim: [] as unknown[],
  stale: [] as unknown[],
  status: [] as unknown[],
  deliverFails: false,
};

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

vi.mock("../db/mcpClient", () => ({
  mcpExec: vi.fn(async (sql: string) => {
    const flat = sql.replace(/\s+/g, " ").trim();
    calls.push(flat);
    if (flat.includes("ORDER BY created_at DESC")) return state.list;
    if (flat.includes("SET status = 'claimed'")) return state.claim;
    if (flat.includes("SET status = 'expired'") && flat.includes("RETURNING id"))
      return state.stale;
    if (flat.startsWith("SELECT status FROM")) return state.status;
    return null;
  }),
}));
vi.mock("../auth", () => ({ getCurrentWallet: () => "w1" }));
vi.mock("./user-shared", () => ({ accountIdOf: async () => "acc_A" }));
vi.mock("./chips-utils", () => ({
  sqlStr: (v: string) => `'${String(v).replace(/'/g, "''")}'`,
}));
vi.mock("./gifts-deliver", () => ({
  deliverGift: vi.fn(async () => {
    if (state.deliverFails) throw new Error("выдача упала");
  }),
}));

const { getMyGifts, claimGift } = await import("./gifts");
const { expireStaleGifts, whyNotClaimed, GIFT_LIVE_SQL } = await import("./gifts-expire");

const row = (over: Record<string, unknown> = {}) => ({
  id: "gft_1",
  account_id: "acc_A",
  kind: "energy",
  amount: "500",
  ref_id: null,
  title: null,
  image: null,
  note: null,
  status: "pending",
  created_at: "2026-09-20T10:00:00+00:00",
  expires_ms: 1_800_000_000_000,
  ...over,
});

beforeEach(() => {
  calls.length = 0;
  state.list = [];
  state.claim = [];
  state.stale = [];
  state.status = [];
  state.deliverFails = false;
});

describe("getMyGifts", () => {
  it("спрашивает только живые pending и отдаёт срок числом", async () => {
    state.list = [row(), row({ id: "gft_2", expires_ms: null })];
    const res = await getMyGifts();
    const sql = calls.find((c) => c.includes("ORDER BY created_at DESC")) ?? "";
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain(GIFT_LIVE_SQL);
    expect(sql).toContain("extract(epoch from expires_at) * 1000 AS expires_ms");
    expect(res.map((g) => g.expiresAt)).toEqual([1_800_000_000_000, null]);
    expect(res[0]?.amount).toBe(500);
    // Зачистка стартует с ПЕРВОГО чтения в процессе, и первый прогон — сразу.
    // Проверяем здесь же: таймер — одиночка на модуль, второй вызов его не
    // заводит, и в отдельном тесте прогона уже не увидеть.
    const sweep = calls.find((c) =>
      c.startsWith("UPDATE yuplink.player_gift SET status = 'expired'"),
    );
    expect(sweep).toBeDefined();
    expect(sweep).toContain(
      "WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= now()",
    );
  });
});

describe("claimGift", () => {
  it("CAS: живой срок нужен только pending, повтор с той же меткой проходит и на границе", async () => {
    state.claim = [row({ status: "claimed" })];
    const res = await claimGift({ data: { id: "gft_1", op: "k1" } });
    expect(res).toEqual({ ok: true, kind: "energy", amount: 500 });
    const sql = calls.find((c) => c.includes("SET status = 'claimed'")) ?? "";
    expect(sql).toContain(
      `((status = 'pending' AND ${GIFT_LIVE_SQL}) OR claim_op = 'acc_A:gft_1:k1')`,
    );
  });

  it("просроченный pending → expired и ошибка «сгорел»", async () => {
    state.stale = [{ id: "gft_1" }];
    await expect(claimGift({ data: { id: "gft_1" } })).rejects.toThrow("gifts.err_expired");
    const sql = calls.find((c) => c.includes("SET status = 'expired'")) ?? "";
    expect(sql).toContain("WHERE id = 'gft_1' AND account_id = 'acc_A' AND status = 'pending'");
    // Ключ повтора освобождаем: стабильный source_ref не должен блокировать
    // повторную выдачу после сгорания.
    expect(sql).toContain("source_ref || ':x:' || id");
  });

  it("уже сожжён зачисткой — тоже «сгорел», а не «уже забран»", async () => {
    state.status = [{ status: "expired" }];
    await expect(claimGift({ data: { id: "gft_1" } })).rejects.toThrow("gifts.err_expired");
  });

  it("забран другим заходом — «уже забран»", async () => {
    state.status = [{ status: "claimed" }];
    await expect(claimGift({ data: { id: "gft_1" } })).rejects.toThrow("gifts.err_taken");
  });

  it("срыв выдачи возвращает в pending и продлевает срок минимум на час", async () => {
    state.claim = [row({ status: "claimed" })];
    state.deliverFails = true;
    await expect(claimGift({ data: { id: "gft_1" } })).rejects.toThrow("выдача упала");
    const sql = calls.find((c) => c.includes("SET status = 'pending'")) ?? "";
    expect(sql).toContain("GREATEST(expires_at, now() + interval '1 hour')");
    expect(sql).toContain("WHEN expires_at IS NULL THEN NULL");
  });
});

describe("gifts-expire", () => {
  it("зачистка идемпотентна по WHERE и не бросает при ошибке базы", async () => {
    await expect(expireStaleGifts()).resolves.toBeUndefined();
    const sql =
      calls.find((c) => c.startsWith("UPDATE yuplink.player_gift SET status = 'expired'")) ?? "";
    expect(sql).toMatch(/^UPDATE yuplink.player_gift SET status = 'expired'/);
    expect(sql).toContain(
      "WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= now()",
    );
    // Следом — возврат DARAI сгоревших турнирных призов в пул (tour-expire).
    expect(calls.at(-1)).toContain("'tour-x:' || g.id");
  });

  it("whyNotClaimed: нет строки вовсе — «taken»", async () => {
    expect(await whyNotClaimed("acc_A", "gft_x")).toBe("taken");
  });
});
