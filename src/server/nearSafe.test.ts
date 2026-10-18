// Подписант: две подписи подряд не берут один nonce, даже если ключ доступа
// («final») ещё не видит первую; подписанные байты отдаются ДО отправки, и
// их же можно отправить повторно.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as ed25519 from "@noble/ed25519";
import { base58 } from "@scure/base";

const st = { akNonce: 100, sent: [] as string[], reply: { ok: true, result: { status: { SuccessValue: "" } } } as unknown };
vi.mock("./rpc", () => ({
  viewAccessKey: async () => ({ nonce: st.akNonce, block_hash: base58.encode(new Uint8Array(32).fill(7)) }),
  broadcastTxCommit: async (b64: string) => (st.sent.push(b64), st.reply),
  txStatus: async () => ({ data: null, status: "pending" }),
}));
vi.mock("./wallet/kms", () => ({ kmsDecryptString: async () => "" }));

const { signAndSendSafe, sendSigned, functionCallAction } = await import("./nearSafe");

beforeAll(async () => {
  const seed = new Uint8Array(32).fill(3);
  const pub = await ed25519.getPublicKeyAsync(seed);
  const sk = new Uint8Array(64);
  sk.set(seed);
  sk.set(pub, 32);
  process.env.NEAR_SIGNER_ACCOUNT_ID = "darai_gdrop.near";
  process.env.NEAR_SIGNER_PRIVATE_KEY = `ed25519:${base58.encode(sk)}`;
  delete process.env.NEAR_SIGNER_SHARE1_ENCRYPTED;
  delete process.env.NEAR_SIGNER_ENCRYPTED_KEY;
});

beforeEach(() => {
  st.sent.length = 0;
  st.reply = { ok: true, result: { status: { SuccessValue: "" }, receipts_outcome: [] } };
});

const action = () => functionCallAction({ methodName: "ft_transfer", args: { a: 1 }, gas: 1n, deposit: 1n });

describe("подписант", () => {
  it("подряд — разные nonce, хотя ключ показывает старый номер", async () => {
    const metas: Array<{ nonce: string; signedTx: string }> = [];
    for (let i = 0; i < 2; i++) {
      await signAndSendSafe({ receiverId: "usdt.tether-token.near", actions: [action()], onSigned: async (_h, m) => void metas.push(m) });
    }
    expect(BigInt(metas[1].nonce)).toBe(BigInt(metas[0].nonce) + 1n);
    // Ключ ушёл вперёд — берём его номер.
    st.akNonce = 500;
    await signAndSendSafe({ receiverId: "x", actions: [action()], onSigned: async (_h, m) => void metas.push(m) });
    expect(metas[2].nonce).toBe("501");
  });

  it("байты отдаются до отправки — те же и уходят в сеть; исход возвращается", async () => {
    let saved = "";
    const r = await signAndSendSafe({
      receiverId: "x",
      actions: [action()],
      onSigned: async (_h, m) => {
        expect(st.sent).toEqual([]);
        saved = m.signedTx;
      },
    });
    expect(st.sent).toEqual([saved]);
    expect(r.status).toBe("confirmed");
    expect(r.outcome).toMatchObject({ receipts_outcome: [] });
  });

  it("пометка не записалась — в сеть ничего не уходит", async () => {
    await expect(
      signAndSendSafe({ receiverId: "x", actions: [action()], onSigned: async () => Promise.reject(new Error("db")) }),
    ).rejects.toThrow("db");
    expect(st.sent).toEqual([]);
  });

  it("отказ сети — unknown с ошибкой ноды целиком", async () => {
    st.reply = { ok: false, errorMsg: "Server error", errorData: { data: { InvalidNonce: {} } } };
    const r = await sendSigned("H", "BYTES");
    expect(r).toMatchObject({ txHash: "H", status: "unknown", errorData: { data: { InvalidNonce: {} } } });
    expect(st.sent).toEqual(["BYTES"]);
  });
});
