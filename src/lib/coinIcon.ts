// Картинки монет счёта (31.10.2026): настоящие иконки из блокчейна —
// ft_metadata.icon контрактов reward_tokens, скачаны один раз в
// public/tokens (96×96 webp), чтобы не ходить в сеть NEAR на каждом окне.
// Новая монета без картинки — кружок с буквами, как раньше.
const COIN_ICONS = new Set([
  "bees",
  "darai",
  "gdarai",
  "gj",
  "gp",
  "grecha",
  "gwater",
  "hope",
  "jholudi",
  "magicdust",
  "mana",
  "med",
  "mira",
  "ntdarai",
  "pollen",
  "rf",
  "rnbw",
  "seeds",
  "usdt",
  "yupland",
]);

/** Картинка монеты по символу (Darai, GP, USDT…); нет — null. */
export function coinIcon(symbol: string): string | null {
  const key = symbol.toLowerCase();
  return COIN_ICONS.has(key) ? `/tokens/${key}.webp` : null;
}
