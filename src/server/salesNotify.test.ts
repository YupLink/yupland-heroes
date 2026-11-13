// Письмо о покупке подписки и лицензии (§8.111): что, почём, звёзды — всем
// админам; кто купил — только владельцу.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sent: [] as Array<{ to: number; text: string }>,
  sql: [] as string[],
}));
vi.mock("./db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("FROM yuplink.accounts a"))
      return [{ telegram_username: "buyer_<1>", telegram_id: 777 }];
    if (sql.includes("WHERE wallet IN")) return [{ telegram_id: 111 }];
    return [];
  },
}));
vi.mock("./tg", () => ({
  tgSendMessage: async (to: number, text: string) => {
    s.sent.push({ to, text });
    return true;
  },
}));

const { saleText, notifySale } = await import("./salesNotify");

const sub = {
  what: "sub" as const,
  title: "Стандарт",
  days: 30,
  amount: 1234567,
  currency: "Darai",
  usd: 4.99,
  account: "acc_1",
  wallet: "kate.tg",
};

beforeEach(() => {
  s.sent = [];
  s.sql = [];
  vi.stubEnv("ADMIN_TG_IDS", "111, 222");
  vi.stubEnv("PAYOUTS_ADMIN_WALLETS", "owner.tg");
  vi.stubEnv("OWNER_TG_ID", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("письмо о покупке", () => {
  it("подписка: тариф, срок, сумма и доллары; покупатель — только если передан", () => {
    expect(saleText(sub)).toBe("🧾 Подписка «Стандарт» · 30 дн.\n💰 1 234 567 DARAI (≈ $4,99)");
    expect(saleText(sub, { username: "kate", telegramId: 5 }).split("\n")[2]).toBe(
      "👤 @kate · TG 5 · kate.tg",
    );
    expect(saleText(sub, { username: null, telegramId: null }).split("\n")[2]).toBe(
      "👤 без ника · kate.tg",
    );
  });

  it("лицензия звёздами и алмазами: звёзды подписаны, алмазы без долларов", () => {
    const lic = {
      ...sub,
      what: "license" as const,
      title: "Малая",
      amount: 350,
      currency: "STARS",
      usd: 0.6,
      note: "5 000 золота в сутки",
    };
    expect(saleText(lic)).toBe(
      "🏦 Лицензия банка «Малая» · 30 дн.\n💰 350 звёзд ⭐ (≈ $0,6)\n5 000 золота в сутки",
    );
    expect(saleText({ ...lic, currency: "diamonds", amount: 50, usd: null }).split("\n")[1]).toBe(
      "💰 50 алмазов 💎",
    );
  });

  it("владельцу — с ником покупателя, Ярославу — без; HTML экранирован", async () => {
    await notifySale(sub);
    expect(s.sent.map((m) => m.to).sort()).toEqual([111, 222]);
    const owner = s.sent.find((m) => m.to === 111)!.text;
    const other = s.sent.find((m) => m.to === 222)!.text;
    expect(owner).toContain("👤 @buyer_&lt;1&gt; · TG 777 · kate.tg");
    expect(other).not.toContain("👤");
    expect(other).not.toContain("kate.tg");
  });

  it("никого нет — не пишет и не падает", async () => {
    vi.stubEnv("ADMIN_TG_IDS", "");
    vi.stubEnv("PAYOUTS_ADMIN_WALLETS", "");
    await expect(notifySale(sub)).resolves.toBeUndefined();
    expect(s.sent).toEqual([]);
  });
});
