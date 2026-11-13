import type { BankPool, BankToken } from "@/lib/castleBank";

type Pair = Pick<BankPool, "tokenA" | "tokenB">;

// These helpers receive only live pools. Balances do not affect whether a pair exists.
export const bankSourceTokens = (pools: readonly Pair[]): BankToken[] =>
  [...new Set(pools.flatMap((p) => [p.tokenA, p.tokenB]))];

export const bankTargetTokens = (pools: readonly Pair[], source: BankToken): BankToken[] =>
  [...new Set(pools.filter((p) => p.tokenA === source || p.tokenB === source)
    .map((p) => p.tokenA === source ? p.tokenB : p.tokenA))];

export const bankPoolForPair = <T extends Pair>(
  pools: readonly T[], source: BankToken, target: BankToken,
): T | undefined => pools.find((p) =>
  (p.tokenA === source && p.tokenB === target) ||
  (p.tokenB === source && p.tokenA === target));

export const preferredBankTarget = (targets: readonly BankToken[], previous: BankToken | null): BankToken | null =>
  previous && targets.includes(previous) ? previous : targets[0] ?? null;
