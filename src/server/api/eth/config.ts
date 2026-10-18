// Ethereum: коллекция Heroes of Valdir (HOV, ERC-721, токены с 1) и публичные узлы сети.
// Ключей не нужно: владельцев читаем пачками eth_call у публичного узла (owner-index).

export const HOV_CONTRACT = "0x5a2a792ede6eb1f0eccd5f6b7ee5a8aaae64e08c";

/** Узлы по порядку: первый отвечает на пачки по 200 eth_call, остальные — запас. */
export const ETH_RPC = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.drpc.org",
  "https://1rpc.io/eth",
];

/** Сколько токенов спрашивать одной пачкой. */
export const OWNER_BATCH = 200;

/** Сообщение для подписи кошельком: nonce одноразовый, подпись ничего не тратит. */
export const ethLinkMessage = (nonce: string) =>
  `YupLink: привязать Ethereum-кошелёк к аккаунту.\nКод: ${nonce}\nЭто подпись, не транзакция — ничего не списывается.`;
