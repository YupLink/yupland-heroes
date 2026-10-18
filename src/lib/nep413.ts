// NEP-413 — Off-Chain Message Signing.
// Подпись произвольного message с привязкой к recipient + nonce без
// on-chain транзакции. Используется dApps для login ("Sign-in with NEAR")
// и проверки владения аккаунтом.
//
// Полная спека: https://github.com/near/NEPs/blob/master/neps/nep-0413.md
//
// Hash подписи = sha256(borsh({
//   tag: 2147484061, // фиксированный (= 2^31 + 413)
//   message: string,
//   nonce: [u8; 32],
//   recipient: string,
//   callbackUrl: Option<string>,
// }))
//
// Подписывается ed25519. Возвращается base64-encoded signature (64 байта).

import * as borsh from "borsh";
import * as ed25519 from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha2.js";

const NEP413_TAG = 2147484061;

const NEP413_SCHEMA: borsh.Schema = {
  struct: {
    tag: "u32",
    message: "string",
    nonce: { array: { type: "u8", len: 32 } },
    recipient: "string",
    callbackUrl: { option: "string" },
  },
};

export interface SignMessageRequest {
  message: string;
  recipient: string;
  nonce: Uint8Array; // 32 bytes
  callbackUrl?: string;
}

export interface SignMessageResult {
  accountId: string;
  publicKey: string; // "ed25519:<base58>"
  signature: string; // base64-encoded 64-byte signature
}

/**
 * Хеш для подписи. Полезно отдельно — например, чтобы показать
 * пользователю что именно будет подписано.
 */
export function buildNep413Hash(req: SignMessageRequest): Uint8Array {
  if (req.nonce.length !== 32) {
    throw new Error("nonce должен быть 32 байта");
  }
  const payload = {
    tag: NEP413_TAG,
    message: req.message,
    nonce: Array.from(req.nonce),
    recipient: req.recipient,
    callbackUrl: req.callbackUrl ?? null,
  };
  const encoded = borsh.serialize(NEP413_SCHEMA, payload);
  return sha256(encoded);
}

/**
 * Подписать NEP-413 message локальным privateKey.
 */
export async function signNep413(
  req: SignMessageRequest,
  privateKey: Uint8Array
): Promise<Uint8Array> {
  const hash = buildNep413Hash(req);
  return ed25519.signAsync(hash, privateKey);
}

function uint8ToBase64(u: Uint8Array): string {
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
}

export { uint8ToBase64 };
