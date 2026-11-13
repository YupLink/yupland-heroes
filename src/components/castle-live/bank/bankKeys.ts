// Ключи react-query банка замка. После любого действия в банке (постройка, обмен,
// вклад и снятие, лицензия) перечитываются все разом: ресурсы, счёт, метка DARAI
// холдеров и окна банка — результат виден сразу, без перезагрузки страницы.
import type { QueryClient } from "@tanstack/react-query";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { HOLDER_TAG_KEY } from "@/lib/holderTagKey";

export const CASTLE_BANK_KEY = ["castle-bank"] as const;
export const BANK_POOLS_KEY = ["bank-pools"] as const;
export const BANK_STAKE_KEY = ["bank-stake"] as const;
export const BANK_LICENSE_KEY = ["bank-license"] as const;
export const BANK_RATE_KEY = ["bank-rate"] as const;
/** Статистика пулов (админ): ["bank-stats", id] и ["bank-stats", "history", id]. */
export const BANK_STATS_KEY = ["bank-stats"] as const;
/** Признак «банк построен» для ввода NFT холдеров (HolderNftSection). */
export const HOLDER_INPUT_INFO_KEY = ["holder-input-info"] as const;

const ALL = [
  CASTLE_BANK_KEY,
  BANK_POOLS_KEY,
  BANK_STAKE_KEY,
  BANK_LICENSE_KEY,
  // график курса: свой обмен виден в последней свече сразу, не через 15 с
  BANK_RATE_KEY,
  BANK_STATS_KEY,
  HOLDER_INPUT_INFO_KEY,
  ACC_BALANCES_KEY,
  RESOURCES_KEY,
  HOLDER_TAG_KEY,
  // соседние карточки Ратуши держат свой снимок ресурсов
  ["castle-casino"],
  ["auction-house"],
] as const;

export function refreshBank(qc: QueryClient): Promise<unknown> {
  return Promise.allSettled(ALL.map((queryKey) => qc.invalidateQueries({ queryKey })));
}
