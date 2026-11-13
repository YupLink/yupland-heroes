// Google-сессии вывод наружу закрыт: ручки вывода отказывают google.noWithdraw
// раньше любого похода в базу/цепь; обычный Telegram-игрок идёт дальше, как раньше.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_TG_BASE } from "@/lib/auth/googleTg";

const st = vi.hoisted(() => ({ tg: 0, reached: [] as string[], walletOnly: false }));

type Fn = (a: { data: unknown }) => unknown;
vi.mock("@tanstack/react-start", () => {
  const wrap = (fn: Fn, v?: (d: unknown) => unknown) => (a?: { data?: unknown }) =>
    fn({ data: v ? v(a?.data) : a?.data });
  return {
    createServerFn: () => ({
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    }),
  };
});
const stop = (where: string) => {
  st.reached.push(where);
  throw new Error(`stop:${where}`);
};
vi.mock("../../auth", () => ({
  getSessionTgId: () => st.tg,
  isWalletOnlySessionCookie: () => st.walletOnly === true,
  getCurrentWallet: () => "player.near",
  requirePayoutsAdmin: () => "owner.near",
  isPayoutsAdminWallet: () => false,
}));
vi.mock("../../maintenance", () => ({ assertNotMaintenance: () => {} }));
// Кошелёк из сессии в базе не подтверждён: «старый вход без подписи» выводить не может.
vi.mock("../../db/pg", () => ({ pg: { users: { findOne: async () => null } }, sb: {} }));
vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => stop("db") }));
vi.mock("../../rateGate", () => ({ moneyGate: async () => {} }));
vi.mock("../../sendler", () => ({ fetchSendlerNftsByOwner: async () => stop("sendler") }));
vi.mock("../currency/treasury", () => ({ OPERATING_WALLET: "darai_gdrop.near" }));
vi.mock("../currency/move", () => ({
  accAccountId: async () => stop("acc"),
  humanizeAccError: String,
}));
vi.mock("../account-rollout", () => ({ requireAccountUser: async () => stop("account") }));
vi.mock("../user-claims-inventory", () => ({ requireLinkedTelegram: async () => stop("tg") }));
vi.mock("../user-claims-core", () => ({ getSisterWallets: async () => stop("sisters") }));
vi.mock("../user-claims-types", () => ({ NFT_PRIZE_OWNER: "darai_gdrop.near" }));
vi.mock("../user-payouts-resolver", () => ({
  resolveStuckProcessing: async () => stop("resolver"),
}));
vi.mock("../user-payouts-lock", () => ({}));
vi.mock("../user-payouts-execute", () => ({ processPayment: async () => stop("pay") }));

const { requestAccountWithdraw } = await import("../currency/withdraw");
const { withdrawTokens } = await import("../user-payouts-withdraw");
const { withdrawMyNfts } = await import("../user-claim-withdraw-nft");

const calls = {
  "вывод со счёта (Кошелёк/Казна)": () =>
    requestAccountWithdraw({ data: { token: "Darai", amount: 100, recipient: "me.near" } }),
  "вывод наград (Мои NFT)": () => withdrawTokens({ data: { symbol: "Darai" } }),
  "вывод NFT-призов": () => withdrawMyNfts({ data: { recipient: "me.near" } }),
};

beforeEach(() => {
  st.reached = [];
  st.walletOnly = false;
});

describe("вывод для Google-сессии закрыт", () => {
  for (const [name, call] of Object.entries(calls)) {
    it(`${name}: Google — google.noWithdraw, дальше ни шагу`, async () => {
      st.tg = GOOGLE_TG_BASE + 7;
      await expect(call()).rejects.toThrow("google.noWithdraw");
      expect(st.reached).toEqual([]);
    });

    it(`${name}: обычный Telegram — проходит гейт, как раньше`, async () => {
      st.tg = 700000002;
      await expect(call()).rejects.toThrow(/^stop:/);
      expect(st.reached).toHaveLength(1);
    });

    it(`${name}: вход кошельком без подписи — walletLogin.noWithdraw, дальше ни шагу`, async () => {
      st.tg = 700000002;
      st.walletOnly = true;
      await expect(call()).rejects.toThrow("walletLogin.noWithdraw");
      expect(st.reached).toHaveLength(0);
      st.walletOnly = false;
    });
  }
});
