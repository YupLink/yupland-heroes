// Счёт друзей для вех: свой же кошелёк (тот же Telegram или аккаунт, что у
// пригласившего) другом не считается; с отсечкой — только новые друзья. База подменена.
import { beforeEach, describe, expect, it, vi } from "vitest";

type U = { wallet: string; telegram_id: number | null; account_id: string | null };
const db = {
  users: [] as U[],
  referrals: [] as Array<{
    inviter_wallet: string;
    friend_wallet: string;
    joined_at?: string | null;
  }>,
  buyers: new Set<string>(),
  /** Кошелёк → потрачено, $ (нет — $20 у «купивших», 0 у прочих). */
  spent: new Map<string, number>(),
  /** Кошельки, чей аккаунт прошёл обучение. */
  tutorial: new Set<string>(),
  tutorialAsked: 0,
};

const table = (rows: () => Array<Record<string, unknown>>) => ({
  raw: () => ({
    select: () => ({
      in: async (col: string, vals: unknown[]) => ({
        data: rows().filter((r) => vals.includes(r[col])),
      }),
    }),
  }),
});

vi.mock("./db/pg", () => ({
  pg: { users: table(() => db.users), referrals: table(() => db.referrals) },
}));
vi.mock("./referralSpend", () => ({
  usdSpentByWallet: async (ws: string[]) =>
    new Map(ws.map((w) => [w, db.spent.get(w) ?? (db.buyers.has(w) ? 20 : 0)])),
}));

vi.mock("./referralTutorial", () => ({
  walletsWithTutorial: async (ws: string[]) => {
    db.tutorialAsked += 1;
    return new Set(ws.filter((w) => db.tutorial.has(w)));
  },
}));

const { countUniqueReferrals } = await import("./referralCount");

const INV: U = { wallet: "inv.tg", telegram_id: 100, account_id: "acc_I" };

beforeEach(() => {
  db.users = [INV];
  db.referrals = [];
  db.buyers = new Set();
  db.spent = new Map();
  db.tutorial = new Set();
  db.tutorialAsked = 0;
});

const OLD = "2026-10-10T00:00:00+00:00";
const NEW = "2026-10-22T00:00:00+00:00";
const SINCE = "2026-10-22T00:00:00Z";

function friend(u: U, bought = true, joined_at: string | null = OLD) {
  if (!db.users.some((x) => x.wallet === u.wallet)) db.users.push(u);
  db.referrals.push({ inviter_wallet: INV.wallet, friend_wallet: u.wallet, joined_at });
  if (bought) db.buyers.add(u.wallet);
}

describe("кто засчитан другом", () => {
  it("чужой Telegram с паком — засчитан, без пака — нет", async () => {
    friend({ wallet: "a.tg", telegram_id: 201, account_id: "acc_A" });
    friend({ wallet: "b.tg", telegram_id: 202, account_id: "acc_B" }, false);
    expect(await countUniqueReferrals([INV.wallet])).toBe(1);
  });

  it("друг с тем же Telegram, что у пригласившего, — не друг", async () => {
    friend({ wallet: "inv2.near", telegram_id: 100, account_id: "acc_X" });
    friend({ wallet: "a.tg", telegram_id: 201, account_id: "acc_A" });
    expect(await countUniqueReferrals([INV.wallet])).toBe(1);
  });

  it("друг с тем же аккаунтом (без Telegram) — не друг", async () => {
    friend({ wallet: "inv3.near", telegram_id: null, account_id: "acc_I" });
    expect(await countUniqueReferrals([INV.wallet])).toBe(0);
  });

  it("сестринский кошелёк пригласившего — не друг", async () => {
    const sister: U = { wallet: "inv4.near", telegram_id: null, account_id: null };
    friend(sister);
    expect(await countUniqueReferrals([INV.wallet, sister.wallet])).toBe(0);
  });

  it("два кошелька одного чужого Telegram — один друг", async () => {
    friend({ wallet: "a.tg", telegram_id: 201, account_id: "acc_A" });
    friend({ wallet: "a.near", telegram_id: 201, account_id: "acc_A" });
    expect(await countUniqueReferrals([INV.wallet])).toBe(1);
  });
});

describe("вехи: только новые друзья (связь с отсечки)", () => {
  it("старый друг с паком не в счёт, новый — в счёт", async () => {
    friend({ wallet: "old.tg", telegram_id: 301, account_id: "acc_O" }, true, OLD);
    friend({ wallet: "new.tg", telegram_id: 302, account_id: "acc_N" }, true, NEW);
    expect(await countUniqueReferrals([INV.wallet], SINCE)).toBe(1);
    // Без отсечки — все засчитанные, как раньше.
    expect(await countUniqueReferrals([INV.wallet])).toBe(2);
  });

  it("новый друг без пака — ещё не засчитан", async () => {
    friend({ wallet: "new.tg", telegram_id: 302, account_id: "acc_N" }, false, NEW);
    expect(await countUniqueReferrals([INV.wallet], SINCE)).toBe(0);
  });

  it("человек со старой связью не становится новым через второй кошелёк", async () => {
    friend({ wallet: "a.tg", telegram_id: 201, account_id: "acc_A" }, true, OLD);
    friend({ wallet: "a.near", telegram_id: 201, account_id: "acc_A" }, true, NEW);
    expect(await countUniqueReferrals([INV.wallet], SINCE)).toBe(0);
  });

  it("связь без даты — старая", async () => {
    friend({ wallet: "x.tg", telegram_id: 401, account_id: "acc_X" }, true, null);
    expect(await countUniqueReferrals([INV.wallet], SINCE)).toBe(0);
  });

  it("свой второй кошелёк и с новой связью — не друг", async () => {
    friend({ wallet: "inv2.near", telegram_id: 100, account_id: "acc_X" }, true, NEW);
    expect(await countUniqueReferrals([INV.wallet], SINCE)).toBe(0);
  });
});

describe("порог трат друга (рефка золотом, §8.101)", () => {
  it("$12 — в «Много друзей» (от $10), в боксы (больше $15) — нет; ровно $15 — тоже нет", async () => {
    const a: U = { wallet: "a.tg", telegram_id: 201, account_id: "acc_a" };
    const b: U = { wallet: "b.tg", telegram_id: 202, account_id: "acc_b" };
    friend(a, false, NEW);
    friend(b, false, NEW);
    db.spent.set("a.tg", 12);
    db.spent.set("b.tg", 15);
    expect(await countUniqueReferrals([INV.wallet])).toBe(2);
    expect(await countUniqueReferrals([INV.wallet], SINCE, { minUsd: 15, strict: true })).toBe(0);
    db.spent.set("b.tg", 15.01);
    expect(await countUniqueReferrals([INV.wallet], SINCE, { minUsd: 15, strict: true })).toBe(1);
  });

  it("траты кошельков одного Telegram складываются", async () => {
    const a1: U = { wallet: "a1.tg", telegram_id: 301, account_id: "acc_a" };
    const a2: U = { wallet: "a2.tg", telegram_id: 301, account_id: "acc_a" };
    friend(a1, false, NEW);
    db.users.push(a2);
    db.spent.set("a1.tg", 6);
    db.spent.set("a2.tg", 5);
    expect(await countUniqueReferrals([INV.wallet])).toBe(1);
  });
});

describe("с 05.11.2026 новый друг — за обучение (владелец: «только обучение»)", () => {
  const T_SINCE = "2026-11-05T00:00:00Z";
  const AFTER = "2026-11-05T00:00:00+00:00";
  const BOX = { minUsd: 15, strict: true, tutorialSince: T_SINCE };

  it("прошёл обучение без трат — засчитан; не прошёл, хоть и потратил $100, — нет", async () => {
    friend({ wallet: "a.tg", telegram_id: 501, account_id: "acc_a" }, false, AFTER);
    friend({ wallet: "b.tg", telegram_id: 502, account_id: "acc_b" }, false, AFTER);
    db.tutorial.add("a.tg");
    db.spent.set("b.tg", 100);
    expect(await countUniqueReferrals([INV.wallet], SINCE, BOX)).toBe(1);
  });

  it("друг до отсечки — по-прежнему за траты больше $15, обучение не нужно", async () => {
    friend({ wallet: "old.tg", telegram_id: 503, account_id: "acc_o" }, false, NEW);
    db.spent.set("old.tg", 20);
    expect(await countUniqueReferrals([INV.wallet], SINCE, BOX)).toBe(1);
    expect(db.tutorialAsked).toBe(0); // новых нет — базу про обучение не спрашиваем
    db.tutorial.add("old.tg");
    db.spent.set("old.tg", 5);
    expect(await countUniqueReferrals([INV.wallet], SINCE, BOX)).toBe(0);
  });

  it("обучение прошёл другой кошелёк его Telegram — засчитан", async () => {
    friend({ wallet: "c.tg", telegram_id: 504, account_id: "acc_c" }, false, AFTER);
    db.users.push({ wallet: "c.near", telegram_id: 504, account_id: "acc_c" });
    db.tutorial.add("c.near");
    expect(await countUniqueReferrals([INV.wallet], SINCE, BOX)).toBe(1);
  });

  it("человек со связью до отсечки не становится «новым» через второй кошелёк", async () => {
    friend({ wallet: "d.tg", telegram_id: 505, account_id: "acc_d" }, false, NEW);
    friend({ wallet: "d.near", telegram_id: 505, account_id: "acc_d" }, false, AFTER);
    db.tutorial.add("d.tg");
    expect(await countUniqueReferrals([INV.wallet], SINCE, BOX)).toBe(0);
  });

  it("свой второй кошелёк с обучением — не друг", async () => {
    friend({ wallet: "inv5.near", telegram_id: 100, account_id: "acc_I" }, false, AFTER);
    db.tutorial.add("inv5.near");
    expect(await countUniqueReferrals([INV.wallet], SINCE, BOX)).toBe(0);
  });

  it("без tutorialSince («Много друзей») — правило трат как было", async () => {
    friend({ wallet: "e.tg", telegram_id: 506, account_id: "acc_e" }, false, AFTER);
    db.tutorial.add("e.tg");
    expect(await countUniqueReferrals([INV.wallet])).toBe(0);
    db.spent.set("e.tg", 10);
    expect(await countUniqueReferrals([INV.wallet])).toBe(1);
  });
});
