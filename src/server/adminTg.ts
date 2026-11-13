// Telegram админов (env ADMIN_TG_ACCOUNTS): любой кошелёк, на котором сидит сессия
// такого Telegram, — админский (auth.ts). Вынесено, чтобы вход по кошельку
// (wallet-login) мог отказать в сессии с номером админа.
export const ADMIN_TG_ALLOWLIST: readonly number[] = (process.env.ADMIN_TG_ACCOUNTS ?? "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isSafeInteger(n) && n > 0);

export const isAdminTg = (tg: number | null | undefined): boolean =>
  tg != null && ADMIN_TG_ALLOWLIST.includes(Number(tg));
