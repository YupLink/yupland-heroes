// Счётчик новых лотов аукциона: SQL считает все действующие чужие лоты без
// лимита выдачи, отметка пишет только переданные id и повтор безвреден, игрок —
// аккаунт сессии. Поведение того же SQL на настоящем Postgres проверено
// прогоном миграции и запросов (проба с откатом, PGlite).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEEN_MAX_IDS, markSeenSql, unreadCountSql } from "./seen-sql";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  wallet: null as string | null,
  account: null as string | null,
  count: 0,
  fail: false,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (s.fail) throw new Error("MCP POST 502");
    return sql.includes("count(*)") ? [{ n: s.count }] : [];
  },
}));
vi.mock("../../auth", () => ({ getCurrentWallet: () => s.wallet }));
vi.mock("../currency/move", () => ({ accAccountId: async () => s.account }));

import { getAuctionUnread, markAuctionsSeen, markSeenInput } from "./seen";

type Handler<I, O> = (a: I) => Promise<O>;
const unread = getAuctionUnread as unknown as Handler<void, { unreadCount: number }>;
const mark = markAuctionsSeen as unknown as Handler<
  { data: { auctionIds: string[] } },
  { unreadCount: number }
>;

beforeEach(() => {
  s.sql.length = 0;
  s.wallet = "w.near";
  s.account = "acc_me";
  s.count = 0;
  s.fail = false;
});

describe("SQL счётчика", () => {
  const sql = unreadCountSql("acc_me");

  it("считает все действующие лоты — без LIMIT выдачи", () => {
    expect(sql).toMatch(/count\(\*\)/);
    expect(sql).not.toMatch(/LIMIT/i);
    expect(sql).toContain("a.status = 'live' AND a.end_at > now()");
  });

  it("свои лоты не в счёт, просмотренные — по аккаунту и id лота", () => {
    expect(sql).toContain("a.seller_account_id IS DISTINCT FROM 'acc_me'");
    expect(sql).toContain("s.account_id = 'acc_me' AND s.auction_id = a.id");
    // Ни ставки, ни время изменения лота в счёте не участвуют.
    expect(sql).not.toMatch(/auction_bid|top_bid|seen_at/);
  });

  it("кавычки в id аккаунта экранируются", () => {
    expect(unreadCountSql("a'b")).toContain("'a''b'");
  });
});

describe("SQL отметки", () => {
  it("только переданные id, только действующие и не свои, повтор — DO NOTHING", () => {
    const sql = markSeenSql("acc_me", ["gauc_1", "gauc_2"]) ?? "";
    expect(sql).toContain("a.id IN ('gauc_1','gauc_2')");
    expect(sql).toContain("a.status = 'live' AND a.end_at > now()");
    expect(sql).toContain("a.seller_account_id IS DISTINCT FROM 'acc_me'");
    expect(sql).toContain("ON CONFLICT (account_id, auction_id) DO NOTHING");
  });

  it("повторы id схлопываются, пустой список — без запроса", () => {
    expect(markSeenSql("acc_me", ["x", "x", "y"])).toContain("IN ('x','y')");
    expect(markSeenSql("acc_me", [])).toBeNull();
  });

  it("не больше SEEN_MAX_IDS id и экранирование", () => {
    const many = Array.from({ length: SEEN_MAX_IDS + 50 }, (_, i) => `gauc_${i}`);
    const sql = markSeenSql("acc_me", many) ?? "";
    expect(sql.match(/'gauc_\d+'/g)).toHaveLength(SEEN_MAX_IDS);
    expect(markSeenSql("acc_me", ["x'); DROP TABLE t; --"])).toContain("'x''); DROP TABLE t; --'");
  });

  it("вход: массив строк, не больше 200", () => {
    expect(markSeenInput.parse({ auctionIds: ["gauc_1"] })).toEqual({ auctionIds: ["gauc_1"] });
    expect(() => markSeenInput.parse({ auctionIds: Array(201).fill("a") })).toThrow();
    expect(() => markSeenInput.parse({ auctionIds: [""] })).toThrow();
    expect(() => markSeenInput.parse({})).toThrow();
  });
});

describe("ручки", () => {
  it("без входа счётчик 0 и в базу не ходим", async () => {
    s.wallet = null;
    expect(await unread()).toEqual({ unreadCount: 0 });
    expect(s.sql).toHaveLength(0);
  });

  it("без аккаунта отметка — отказ", async () => {
    s.account = null;
    await expect(mark({ data: { auctionIds: ["gauc_1"] } })).rejects.toThrow(
      "err.auction_seen_login",
    );
    expect(s.sql).toHaveLength(0);
  });

  it("счётчик — по аккаунту сессии", async () => {
    s.count = 137;
    expect(await unread()).toEqual({ unreadCount: 137 });
    expect(s.sql[0]).toContain("'acc_me'");
  });

  it("отметка: вставка, затем свежий счётчик в ответе", async () => {
    s.count = 4;
    expect(await mark({ data: { auctionIds: ["gauc_1", "gauc_2"] } })).toEqual({ unreadCount: 4 });
    expect(s.sql).toHaveLength(2);
    expect(s.sql[0]).toMatch(/^INSERT INTO yuplink.auction_seen/);
    expect(s.sql[1]).toContain("count(*)");
  });

  it("пустой список — только счётчик", async () => {
    s.count = 2;
    expect(await mark({ data: { auctionIds: [] } })).toEqual({ unreadCount: 2 });
    expect(s.sql).toHaveLength(1);
  });

  it("сбой базы — ключ словаря, не техтекст", async () => {
    s.fail = true;
    await expect(unread()).rejects.toThrow("err.auction_seen_failed");
    await expect(mark({ data: { auctionIds: ["gauc_1"] } })).rejects.toThrow(
      "err.auction_seen_failed",
    );
  });
});
