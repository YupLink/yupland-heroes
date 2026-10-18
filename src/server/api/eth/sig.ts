// Проверка подписи personal_sign (EIP-191): по сообщению и подписи восстанавливаем адрес
// и сравниваем с заявленным. Ключей игрока не видим, транзакций не шлём.
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

const enc = new TextEncoder();

/** Хэш сообщения так, как его подписывает кошелёк: префикс EIP-191 + длина в байтах. */
export function personalHash(message: string): Uint8Array {
  const body = enc.encode(message);
  const prefix = enc.encode(`\x19Ethereum Signed Message:\n${body.length}`);
  const all = new Uint8Array(prefix.length + body.length);
  all.set(prefix);
  all.set(body, prefix.length);
  return keccak_256(all);
}

/** Адрес из несжатого публичного ключа: последние 20 байт keccak от X‖Y. */
export function addressOf(pubUncompressed: Uint8Array): string {
  return `0x${bytesToHex(keccak_256(pubUncompressed.slice(1)).slice(-20))}`;
}

/** Адрес, подписавший сообщение; null — подпись битая. */
export function recoverAddress(message: string, signature: string): string | null {
  try {
    const raw = hexToBytes(signature.replace(/^0x/i, ""));
    if (raw.length !== 65) return null;
    const v = raw[64];
    const recid = v >= 27 ? v - 27 : v;
    if (recid !== 0 && recid !== 1) return null;
    const rec = new Uint8Array(65);
    rec[0] = recid;
    rec.set(raw.slice(0, 64), 1);
    const point = secp256k1.Signature.fromBytes(rec, "recovered").recoverPublicKey(
      personalHash(message),
    );
    return addressOf(point.toBytes(false));
  } catch {
    return null;
  }
}

/** Адрес Ethereum: 0x + 40 hex, в нижнем регистре. */
export const normAddress = (a: string): string | null => {
  const s = a.trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(s) ? s : null;
};
