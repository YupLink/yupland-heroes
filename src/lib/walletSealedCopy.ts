// Запечатанная копия кошелька в localStorage (11.11.2026). У старых кошельков
// рядом с записью IndexedDB лежал ОТКРЫТЫЙ сид в localStorage — страховка на
// случай, если IndexedDB не переживёт перезаход (Telegram WebView). Открытый сид
// читает любой скрипт на домене, поэтому при переносе под пароль он заменяется
// этой копией: те же запечатанные байты, что в IndexedDB (без пароля не открыть).
// Пропала запись IndexedDB — она восстанавливается из копии (restoreFromCopies).
import {
  b64decode,
  b64encode,
  parseVerificationBlob,
  type VerificationBlob,
} from "./appLockCrypto";
import { idbGet, idbPut, type StoredRecord } from "./secureWalletDb";

const PREFIX = "yl:wallet-vault:";

type Copy = {
  mode: StoredRecord["mode"];
  accountId: string;
  publicKeyStr: string;
  keyOnly?: boolean;
  iv: string;
  ct: string;
  vault?: VerificationBlob;
};

const ls = (): Storage | null => globalThis.localStorage ?? null;

/** Положить копию запечатанной записи. */
export function writeSealedCopy(id: string, rec: StoredRecord): void {
  if (!rec.sealedIv || !rec.sealedCt) return;
  const copy: Copy = {
    mode: rec.mode,
    accountId: rec.accountId,
    publicKeyStr: rec.publicKeyStr,
    keyOnly: rec.keyOnly,
    iv: b64encode(rec.sealedIv),
    ct: b64encode(rec.sealedCt),
    vault: rec.vault,
  };
  ls()?.setItem(PREFIX + id, JSON.stringify(copy));
}

export function removeSealedCopy(id: string): void {
  ls()?.removeItem(PREFIX + id);
}

/** accountId, у которых есть копия. */
export function sealedCopyIds(): string[] {
  const s = ls();
  if (!s) return [];
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k?.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
  }
  return out;
}

function readCopy(id: string): StoredRecord | null {
  try {
    const c = JSON.parse(ls()?.getItem(PREFIX + id) ?? "null") as Copy | null;
    if (!c?.iv || !c.ct || !c.publicKeyStr) return null;
    const ct = b64decode(c.ct);
    return {
      mode: c.mode === "aes" ? "aes" : "ed25519",
      accountId: c.accountId || id,
      publicKeyStr: c.publicKeyStr,
      keyOnly: c.keyOnly,
      signingKey: null,
      sealedIv: b64decode(c.iv),
      sealedCt: ct.buffer.slice(ct.byteOffset, ct.byteOffset + ct.byteLength) as ArrayBuffer,
      vault: parseVerificationBlob(JSON.stringify(c.vault ?? null)) ?? undefined,
    };
  } catch {
    return null;
  }
}

/** Записи IndexedDB, которых нет, — вернуть из копий (ключ не нужен). */
export async function restoreFromCopies(): Promise<void> {
  for (const id of sealedCopyIds()) {
    if (await idbGet<StoredRecord>(id)) continue;
    const rec = readCopy(id);
    if (rec) await idbPut(id, rec);
  }
}
