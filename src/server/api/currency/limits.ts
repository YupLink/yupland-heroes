// Пороги счёта: сколько можно положить и сколько забрать.
//
// Минимум нужен не из вредности: перевод стоит газа и разовой регистрации
// получателя, поэтому пыль на счёте обходится дороже, чем стоит.
//
// Запрет по токену — ручной рубильник владельца, а не автоматика. У каждого
// токена свой круг обращения: он выпадает в награду, тратится внутри игры,
// заводится обратно за покупки; кошелёк пополняется под конкретные выводы.
// Решать, хватает ли резерва, — дело владельца, поэтому по умолчанию открыты
// все токены, а закрыть любой можно строкой в настройках.
import { pg } from "../../db/pg";

const SETTINGS_KEY = "acc_deposit_limits";
const TTL_MS = 30_000;

/** Чего нет в списке — минимум единица, и класть/забирать можно только целыми. */
const DEFAULT_MIN = 1;

/** Пороги на вход и на выход. У DARAI, HOPE и желудей свои, остальные от единицы. */
const DEFAULT_DEPOSIT: Record<string, number> = { Darai: 1_000_000, HOPE: 1_000 };
const DEFAULT_WITHDRAW: Record<string, number> = {
  Darai: 1_000_000,
  HOPE: 1_000,
  JHOLUDI: 10_000,
};

/** По умолчанию открыты все. Закрыть токен — строкой в settings. */
const DEFAULT_DISABLED: string[] = [];

export type DepositLimits = {
  deposit: Record<string, number>;
  withdraw: Record<string, number>;
  disabled: string[];
};

let cache: { at: number; value: DepositLimits } | null = null;

/** Владелец правит их строкой в settings, без выката. */
export async function depositLimits(): Promise<DepositLimits> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value: DepositLimits = {
    deposit: DEFAULT_DEPOSIT,
    withdraw: DEFAULT_WITHDRAW,
    disabled: DEFAULT_DISABLED,
  };
  try {
    const row = await pg.settings.findOne({ key: SETTINGS_KEY });
    if (row?.value) {
      const p = JSON.parse(row.value) as Partial<DepositLimits> & {
        min?: Record<string, number>;
      };
      value = {
        // `min` — старое имя поля, читаем его, чтобы прежняя настройка не пропала.
        deposit: { ...DEFAULT_DEPOSIT, ...(p.deposit ?? p.min ?? {}) },
        withdraw: { ...DEFAULT_WITHDRAW, ...(p.withdraw ?? {}) },
        disabled: Array.isArray(p.disabled) ? p.disabled : DEFAULT_DISABLED,
      };
    }
  } catch {
    // Битая настройка не должна закрывать счёт — работаем на дефолтах.
  }
  cache = { at: Date.now(), value };
  return cache.value;
}

export function invalidateDepositLimits(): void {
  cache = null;
}

export async function minDepositFor(token: string): Promise<number> {
  const { deposit } = await depositLimits();
  return deposit[token] ?? DEFAULT_MIN;
}

export async function minWithdrawFor(token: string): Promise<number> {
  const { withdraw } = await depositLimits();
  return withdraw[token] ?? DEFAULT_MIN;
}

export async function depositAllowed(token: string): Promise<boolean> {
  const { disabled } = await depositLimits();
  return !disabled.includes(token);
}
