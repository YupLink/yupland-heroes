// Частота привязки Solana-кошелька. Каждый запрос — поход в базу, привязка —
// ещё и проверка подписи ed25519; живому игроку хватает пары раз в минуту,
// гард ловит скрипт, а не человека (rateGate: счётчик в базе, общий на процессы).
import { rateGate } from "../../rateGate";

export const SOLANA_LINK_LIMITS = {
  /** Код для подписи: открыл окно — и, может, передумал. */
  nonce: { limit: 5, windowMs: 60_000 },
  /** Привязка: подпись могли отклонить в кошельке и подписать снова. */
  attach: { limit: 10, windowMs: 60_000 },
  unlink: { limit: 5, windowMs: 60_000 },
  /** Просмотр кошелька: каждый — запрос баланса и токенов в Helius (платная квота). */
  status: { limit: 20, windowMs: 60_000 },
} as const;

export type SolanaLinkStep = keyof typeof SOLANA_LINK_LIMITS;

export function solanaLinkGate(step: SolanaLinkStep, account: string): Promise<void> {
  return rateGate(`sol:${step}:${account}`, {
    ...SOLANA_LINK_LIMITS[step],
    message: "Слишком часто — подожди минуту и повтори",
  });
}
