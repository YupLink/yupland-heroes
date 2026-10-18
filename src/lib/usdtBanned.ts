// USDT — живые деньги на кошельке проекта (ПРАВИЛА §8.49а): «Свободно USDT» в
// минус не уходит. Обещать USDT можно только там, где сумма известна заранее и
// сверена со свободным (раскладка на карте, раздача, подарки, выплаты — там свои
// проверки, usdt-guard). Награды без предела — мистические боксы, паки, грядки,
// шахты, лавки, дропы, сундуки и локации старого рейда, недельный босс,
// турниры — USDT не настраивают: отказ при сохранении, в пикерах админки его нет.

/** Символ токена — USDT (регистр и пробелы по краям не важны). */
export const isUsdt = (s: string | null | undefined): boolean =>
  (s ?? "").trim().toLowerCase() === "usdt";

export const USDT_BANNED_MSG =
  "USDT здесь нельзя: эта награда выдаётся без предела, а USDT — живые деньги (ПРАВИЛА §8.49а)";
export const USDT_BANNED_MSG_EN =
  "USDT is not allowed here: this reward has no upper bound and USDT is real money";

/** Отказ, если символ — USDT. */
export function assertNotUsdt(token: string | null | undefined): void {
  if (isUsdt(token)) throw new Error(USDT_BANNED_MSG);
}

/** Символы токенов для пикера награды — без USDT. */
export const withoutUsdt = <T extends string>(list: readonly T[]): T[] =>
  list.filter((s) => !isUsdt(s));

type FillerLike = { kind: string; token?: string | null };

/** Наполнители награды (лайки, токен, …) дают USDT. */
export const usdtInFillers = (
  cfg: { fillers?: readonly FillerLike[] } | null | undefined,
): boolean => (cfg?.fillers ?? []).some((f) => f.kind === "token" && isUsdt(f.token));

/** Отказ, если наполнители награды дают USDT. */
export function assertNoUsdtFillers(
  cfg: { fillers?: readonly FillerLike[] } | null | undefined,
): void {
  if (usdtInFillers(cfg)) throw new Error(USDT_BANNED_MSG);
}

const usdtStr = (v: unknown): boolean => typeof v === "string" && isUsdt(v);
const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};

/** Шахта пишет конфиг плоско ({resource, token}) — в клетке или под ключом mine. */
const mineUsdt = (o: Record<string, unknown>): boolean =>
  o.resource === "token" && usdtStr(o.token);

/**
 * USDT в настройке постройки клетки: шахта (lib/mineConfig) и грядка
 * (lib/fieldConfig, field.reward). Прочие поля конфига не смотрим.
 */
export function usdtInBuildingConfig(cfg: unknown): boolean {
  const o = rec(cfg);
  const reward = rec(rec(o.field).reward);
  const fieldUsdt = reward.kind !== "item" && reward.resource === "token" && usdtStr(reward.token);
  return mineUsdt(o) || mineUsdt(rec(o.mine)) || fieldUsdt;
}

/** Отказ с именем клетки — как у правила «Забвения» (assertOblivionCell). */
export function assertNoUsdtCell(cell: string, cfg: unknown): true {
  if (!usdtInBuildingConfig(cfg)) return true;
  throw new Error(`Клетка ${cell}: ${USDT_BANNED_MSG}`);
}
