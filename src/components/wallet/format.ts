// Общие форматтеры баланса для wallet-UI. Логику чисел не меняем —
// это те же реализации, что были инлайн в admin.wallet.tsx, вынесены
// в одно место, чтобы переиспользовать в hero / списках активов.

/** yoctoNEAR (10^24) → human-строка, до 4 знаков после запятой. */
export function formatYocto(yocto: string): string {
  try {
    const n = BigInt(yocto);
    const div = 10n ** 24n;
    const whole = n / div;
    const frac = n % div;
    if (frac === 0n) return `${whole}`;
    const fracStr = frac.toString().padStart(24, "0").slice(0, 4);
    return `${whole}.${fracStr}`;
  } catch {
    return yocto;
  }
}

/** Баланс FT с учётом decimals токена → human-строка (до 4 знаков). */
export function formatFt(balance: string, decimals?: number): string {
  if (decimals == null) return balance;
  try {
    const n = BigInt(balance);
    const div = 10n ** BigInt(decimals);
    const whole = n / div;
    const frac = n % div;
    if (frac === 0n) return `${whole}`;
    const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4);
    return `${whole}.${fracStr}`;
  } catch {
    return balance;
  }
}

/** implicit-аккаунт = 64 hex-символа (= hex публичного ключа). */
export function isImplicit(accountId: string): boolean {
  return /^[0-9a-f]{64}$/i.test(accountId);
}

/** Короткий вид адреса: implicit → aaaaaa…zzzzzz, named — как есть. */
export function displayAddress(accountId: string): string {
  if (!isImplicit(accountId)) return accountId;
  return `${accountId.slice(0, 6)}…${accountId.slice(-6)}`;
}

/** Чуть более длинный middle-truncate для hero/настроек. */
export function midTruncate(s: string, head = 10, tail = 8): string {
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}
