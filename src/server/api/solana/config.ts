// Конфиг интеграции Solana (изолированный модуль, за флагом solana_connect).
// Кошелёк и ключ — это ВВОД/ЧТЕНИЕ, без транзакций и приватных ключей игрока.

/** Адрес казны Solana: сюда идут пополнения. Публичный, ключ у владельца. */
export const SOLANA_RECEIVE_ADDRESS = "AFbBFw3FAcy48ndcwNmJVzhBH1GDHAGcsgdTJ8bJJA6k";

/** Префикс сообщения, которое игрок подписывает кошельком при привязке. */
export const SOLANA_LINK_PREFIX = "YupLink: подтвердите привязку Solana-кошелька";

/** Точная строка подписи — одна и та же на клиенте и сервере. */
export function solanaLinkMessage(nonce: string): string {
  return `${SOLANA_LINK_PREFIX}\nnonce: ${nonce}`;
}

/** URL Helius RPC. Ключ — ТОЛЬКО в серверном окружении, в клиент не едет. */
export function heliusUrl(): string | null {
  const k = process.env.HELIUS_API_KEY;
  return k ? `https://mainnet.helius-rpc.com/?api-key=${k}` : null;
}

/** Программа SPL-токенов (USDC и прочие токены Solana). */
export const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
