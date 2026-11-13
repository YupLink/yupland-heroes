// Подпись NEP-413: у привязки и входа — свой текст и своя метка вызова; подпись
// одного назначения не проходит как другое. Адрес-ключ — без похода в блокчейн,
// если не просят onChain.
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as ed25519 from "@noble/ed25519";
import { base58, base64 } from "@scure/base";
import { buildNep413Hash } from "@/lib/nep413";

type Rpc = { result?: unknown; error?: unknown };
const s = vi.hoisted(() => ({
  sql: [] as string[],
  rpc: 0,
  account: { result: {} } as Rpc,
  key: { result: { permission: "FullAccess" } } as Rpc,
}));
vi.mock("../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return sql.includes("UPDATE yuplink.login_challenges") ? [{ nonce: "n" }] : [];
  },
}));
vi.mock("../rpc", () => ({
  nearRpc: async (_m: string, p: { request_type: string }) => (
    s.rpc++, p.request_type === "view_account" ? s.account : s.key
  ),
}));

const mod = await import("./nep413-login");
const priv = crypto.getRandomValues(new Uint8Array(32));
const pub = await ed25519.getPublicKeyAsync(priv);
const implicit = [...pub].map((b) => b.toString(16).padStart(2, "0")).join("");
const nonceBytes = new Uint8Array(32).fill(7);
const sign = async (message: string) => {
  const hash = buildNep413Hash({ message, recipient: "yupland.io", nonce: nonceBytes });
  return base64.encode(await ed25519.signAsync(hash, priv));
};
const args = (signature: string, accountId = implicit) => ({
  accountId, publicKey: `ed25519:${base58.encode(pub)}`, signature, nonce: base64.encode(nonceBytes),
});

beforeEach(() =>
  Object.assign(s, {
    sql: [],
    rpc: 0,
    account: { result: {} },
    key: { result: { permission: "FullAccess" } },
  }),
);

describe("подпись NEP-413 по назначению", () => {
  it("вызов входа — свой текст и метка login", async () => {
    const ch = await mod.issueLoginChallenge("login");
    expect(ch.message).toBe("Sign in to YupLand with your NEAR wallet");
    expect(s.sql[0]).toContain("'login')");
    expect((await mod.issueLoginChallenge()).message).toBe("Sign in to YupLink Golden Drop");
  });

  it("подпись входа проходит как вход; nonce гасится только той же меткой", async () => {
    const sig = await sign("Sign in to YupLand with your NEAR wallet");
    expect(await mod.verifyConnectOwnership(args(sig), { purpose: "login" })).toEqual({ implicit: true });
    expect(s.sql[0]).toContain("COALESCE(purpose, 'link') = 'login'");
    expect(s.rpc).toBe(0);
  });

  it("подпись привязки как вход — отказ", async () => {
    const sig = await sign("Sign in to YupLink Golden Drop");
    await expect(mod.verifyConnectOwnership(args(sig), { purpose: "login" })).rejects.toThrow("Подпись неверна");
    expect(await mod.verifyConnectOwnership(args(sig))).toEqual({ implicit: true });
  });

  it("onChain — адрес-ключ тоже сверяется с блокчейном", async () => {
    const sig = await sign("Sign in to YupLand with your NEAR wallet");
    await mod.verifyConnectOwnership(args(sig), { purpose: "login", onChain: true });
    expect(s.rpc).toBe(1);
  });

  it("ifExists: адреса на блокчейне нет — подписи достаточно", async () => {
    s.account = { error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_ACCOUNT" } } };
    const sig = await sign("Sign in to YupLand with your NEAR wallet");
    await mod.verifyConnectOwnership(args(sig), { purpose: "login", onChain: "ifExists" });
    expect(s.rpc).toBe(1);
  });

  it("ifExists: адрес есть, ключ живой FullAccess — вход", async () => {
    const sig = await sign("Sign in to YupLand with your NEAR wallet");
    await mod.verifyConnectOwnership(args(sig), { purpose: "login", onChain: "ifExists" });
    expect(s.rpc).toBe(2);
  });

  it("ifExists: адрес есть, ключ с него удалён — отказ", async () => {
    s.key = { error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_ACCESS_KEY" } } };
    const sig = await sign("Sign in to YupLand with your NEAR wallet");
    await expect(
      mod.verifyConnectOwnership(args(sig), { purpose: "login", onChain: "ifExists" }),
    ).rejects.toThrow();
  });

  it("ifExists: узел не ответил внятно — отказ, а не вход", async () => {
    s.account = { error: { name: "TIMEOUT_ERROR" } };
    const sig = await sign("Sign in to YupLand with your NEAR wallet");
    await expect(
      mod.verifyConnectOwnership(args(sig), { purpose: "login", onChain: "ifExists" }),
    ).rejects.toThrow("Не удалось проверить ключ");
  });
});
