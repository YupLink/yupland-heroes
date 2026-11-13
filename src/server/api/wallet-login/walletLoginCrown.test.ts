// Новый аккаунт со ссылки «Короны»: без метки устройства — отказ; устройство занято
// другим кошельком — отказ, номер не выдаётся; удачно — номер, игрок, правило вывода.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  deviceOwner: null as string | null,
  logTaken: false,
  claims: [] as string[],
  users: new Set<string>(),
  fullKey: [] as string[],
}));
vi.mock("../../db/pg", () => ({
  pg: {
    users: {
      findOne: async ({ wallet }: { wallet: string }) => (s.users.has(wallet) ? { wallet } : null),
      insert: async (r: { wallet: string }) => void s.users.add(r.wallet),
    },
  },
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("wallet_login_log")) return s.logTaken ? [{ x: 1 }] : [];
    if (sql.includes("wallet_new_device")) {
      const w = /VALUES \('[^']*', '([^']*)'\)/.exec(sql)?.[1] ?? "";
      s.deviceOwner ??= w;
      return [{ wallet: s.deviceOwner }];
    }
    return [];
  },
}));
vi.mock("../nep413-login", () => ({
  requireFullAccessKey: async (w: string) => void s.fullKey.push(w),
}));
vi.mock("./walletLoginStore", () => ({
  claimWalletTg: async (w: string) => (s.claims.push(w), 6755399441055800),
}));
vi.mock("../wallet-link", () => ({ deriveWalletKind: () => ({ kind: "named", storage: null }) }));
vi.mock("../hallway-skip", () => ({ skipHallwayForNewPlayer: async () => ({}) }));
vi.mock("../currency/move", () => ({ accAccountId: async () => "acc_new" }));

const { createCrownAccount } = await import("./walletLoginCrown");
const dev = (device: string | null) => ({ device, fp: null, ip: "1.2.3.4" });
const proof = { implicit: false, publicKey: "ed25519:x" };

beforeEach(() =>
  Object.assign(s, {
    sql: [],
    deviceOwner: null,
    logTaken: false,
    claims: [],
    users: new Set(),
    fullKey: [],
  }),
);

describe("новый аккаунт со ссылки «Короны»", () => {
  it("без метки устройства — отказ, номер не выдаётся", async () => {
    await expect(createCrownAccount("a.near", proof, dev(null))).rejects.toThrow(
      "walletLogin.failed",
    );
    expect(s.claims).toEqual([]);
  });

  it("удачно: номер, игрок, правило вывода «введённое + 10 %»", async () => {
    expect(await createCrownAccount("a.near", proof, dev("d1"))).toEqual({
      tg: 6755399441055800,
      created: true,
    });
    expect(s.users.has("a.near")).toBe(true);
    const own = s.sql.find((q) => q.includes("darai_withdraw_own_only"));
    expect(own).toContain("acc_new");
    expect(own).toContain("kind = 'new'");
    expect(own).toMatch(/,\s*10\s/);
  });

  it("устройство уже под другим кошельком — отказ; тем же кошельком — повтор можно", async () => {
    await createCrownAccount("a.near", proof, dev("d1"));
    await expect(createCrownAccount("b.near", proof, dev("d1"))).rejects.toThrow(
      "walletLogin.deviceTaken",
    );
    expect(s.claims).toEqual(["a.near"]);
    await expect(createCrownAccount("a.near", proof, dev("d1"))).resolves.toMatchObject({
      created: false,
    });
  });

  it("слепок с того же адреса у другого нового — отказ; адрес-ключ — проверка ключа", async () => {
    s.logTaken = true;
    await expect(createCrownAccount("c.near", proof, dev("d2"))).rejects.toThrow(
      "walletLogin.deviceTaken",
    );
    s.logTaken = false;
    const hex = "ab".repeat(32);
    await createCrownAccount(hex, { implicit: true, publicKey: "ed25519:y" }, dev("d3"));
    expect(s.fullKey).toEqual([hex]);
  });
});
