import type { DetectedInput } from "./types";
import { APPLOCK_NEVER } from "@/lib/appLock";

export function humanizeError(msg: string): string {
  if (msg.includes("NotEnoughBalance"))
    return "Недостаточно NEAR на кошельке (нужен ещё на газ ~0.05 NEAR)";
  if (msg.includes("InsufficientGas"))
    return "Недостаточно газа на TX";
  if (msg.includes("LackBalanceForState"))
    return "Не хватает баланса на storage stake";
  if (msg.includes("AccountDoesNotExist"))
    return "Получатель не существует в сети NEAR";
  if (msg.includes("Неверный PIN")) return "Неверный PIN";
  return msg;
}

export function formatYoctoStr(yocto: string, decimals: number): string {
  try {
    const n = BigInt(yocto);
    const div = 10n ** BigInt(decimals);
    const whole = n / div;
    const frac = n % div;
    if (frac === 0n) return `${whole}`;
    const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4);
    return `${whole}.${fracStr}`.replace(/\.?0+$/, "");
  } catch {
    return yocto;
  }
}

export const AUTOLOCK_OPTIONS: { ms: number; label: string }[] = [
  { ms: 5 * 60_000, label: "5 минут" },
  { ms: 15 * 60_000, label: "15 минут" },
  { ms: 60 * 60_000, label: "1 час" },
  { ms: 4 * 60 * 60_000, label: "4 часа" },
  { ms: APPLOCK_NEVER, label: "Никогда" },
];

export function fmtLockLeft(s: number): string {
  if (!isFinite(s)) return "∞";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h} ч ${m % 60} мин`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export async function detectImportInput(raw: string): Promise<DetectedInput> {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "empty" };

  const words = trimmed.split(/\s+/);
  if (words.length >= 12) {
    const { validateMnemonic } = await import("@scure/bip39");
    const { wordlist } = await import("@scure/bip39/wordlists/english.js");
    if (validateMnemonic(trimmed.toLowerCase(), wordlist)) {
      return { kind: "seed", seed: trimmed.toLowerCase() };
    }
    return { kind: "unknown" };
  }

  let body = trimmed;
  if (body.startsWith("ed25519:")) body = body.slice("ed25519:".length).trim();
  if (/^[0-9a-fA-F]+$/.test(body) && (body.length === 64 || body.length === 128)) {
    return { kind: "key", key: trimmed };
  }
  try {
    const { base58 } = await import("@scure/base");
    const bytes = base58.decode(body);
    if (bytes.length === 32 || bytes.length === 64) {
      return { kind: "key", key: trimmed };
    }
  } catch {
    /* not base58 */
  }
  return { kind: "unknown" };
}
