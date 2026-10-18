// Какими NFT-контрактами распоряжается кошелёк и сколько NEAR лежит в их
// хранилище сверх нужного. Всё — с блокчейна, прямо из браузера.
//
// Два вида контрактов-копилок, у каждого свой способ забрать излишек:
//  • Mintbase (mb-nft-v1/v2) — метод `withdraw_excess_storage_deposits`
//    (только владелец, 1 yocto): контракт сам считает излишек и шлёт владельцу.
//  • HOT (фабрика nfts.tg) — метод `storage_refund({amount})` (без депозита):
//    сумму считаем мы и передаём; владелец берётся из фабрики.
// Что это за контракт — определяем по цепочке, список лавок не зашит.
const RPCS = [
  "https://rpc.mainnet.fastnear.com",
  "https://free.rpc.fastnear.com",
  "https://near.drpc.org",
  "https://rpc.mainnet.near.org",
];
const FAST_RPCS = 3;
const FASTNEAR = "https://api.fastnear.com/v1/account";
// Фабрика HOT-коллекций (nft.tg): отдаёт карту «коллекция → владелец».
const HOT_FACTORY = "nfts.tg";

/** Подушка Mintbase (storage_stake::CUSHION из mb-sdk). */
export const CUSHION = 10n ** 23n;
/** У HOT сумму задаём мы — подушку берём крупнее, чтобы не оставить контракт
 *  без места, если между чтением и подписью кто-то успеет начеканить. */
export const HOT_CUSHION = 10n ** 24n; // 1 NEAR
/** Меньше этого (0,0001 NEAR) в UI округляется до 0 — пыль, забирать ради неё
 *  газ не стоит: кнопку гасим, пере-проверка перед выводом прерывает. */
export const MIN_CLAIM = 10n ** 20n;
const PRICE = 10n ** 19n; // цена байта в сети NEAR
const PARALLEL = 8;
const MAX_CANDIDATES = 200;

export type StoreFamily = "mintbase" | "hot";
export type StoreRole = "owner" | "minter";
export type StoreInfo = {
  contract: string;
  family: StoreFamily;
  owner: string;
  role: StoreRole;
  /** yoctoNEAR строками — BigInt не переживает кэш react-query. */
  balance: string;
  storage: string;
  claimable: string;
};

/** Сколько можно забрать (yocto): баланс − занятое место − подушка. */
export function claimableYocto(
  amount: bigint,
  usage: bigint,
  pricePerByte: bigint,
  cushion: bigint,
): bigint {
  const unused = amount - usage * pricePerByte;
  return unused > cushion ? unused - cushion : 0n;
}

/** Свои контракты — первыми, дальше — где больше можно забрать. */
export function sortStores(list: StoreInfo[]): StoreInfo[] {
  return [...list].sort((a, b) => {
    if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
    const d = BigInt(b.claimable) - BigInt(a.claimable);
    return d > 0n ? 1 : d < 0n ? -1 : a.contract.localeCompare(b.contract);
  });
}

type RpcReply<T> = {
  result?: T & { error?: unknown };
  error?: { cause?: { name?: string } };
};
/** Ответы «такого нет» — окончательные, на другом узле будет то же самое. */
const ABSENT = new Set(["UNKNOWN_ACCOUNT", "INVALID_ACCOUNT", "NO_CONTRACT_CODE"]);
let turn = 0;

async function rpc<T>(params: object): Promise<T | null> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: "1", method: "query", params });
  const start = turn++ % FAST_RPCS;
  for (let i = 0; i < RPCS.length; i++) {
    const r = await fetch(RPCS[(start + i) % RPCS.length], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => null);
    if (!r?.ok) continue; // 429, 5xx, сеть — следующий узел
    const j = (await r.json().catch(() => null)) as RpcReply<T> | null;
    if (j?.result) return j.result.error ? null : j.result; // нет метода/кода — не копилка
    if (ABSENT.has(j?.error?.cause?.name ?? "")) return null;
  }
  throw new Error("storage.err_load");
}

async function view<T>(contract: string, method: string, args: object = {}): Promise<T | null> {
  const res = await rpc<{ result?: number[] }>({
    request_type: "call_function",
    finality: "optimistic",
    account_id: contract,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
  });
  if (!res?.result) return null;
  try {
    return JSON.parse(new TextDecoder().decode(new Uint8Array(res.result))) as T;
  } catch {
    return null; // ответ не JSON — чужой формат контракта
  }
}

async function accountOf(contract: string): Promise<{ amount: bigint; usage: bigint } | null> {
  const acc = await rpc<{ amount: string; storage_usage: number }>({
    request_type: "view_account",
    finality: "optimistic",
    account_id: contract,
  });
  return acc ? { amount: BigInt(acc.amount), usage: BigInt(acc.storage_usage) } : null;
}

/** Контракт Mintbase: владелец/минтер + оценка излишка. null — не Mintbase. */
async function probeMintbase(contract: string, account: string): Promise<StoreInfo | null> {
  const owner = await view<string>(contract, "get_owner_id");
  if (typeof owner !== "string") return null;
  const isOwner = owner === account;
  if (
    !isOwner &&
    (await view<boolean>(contract, "check_is_minter", { account_id: account })) !== true
  )
    return null;
  const [costs, acc] = await Promise.all([
    view<{ storage_price_per_byte?: string }>(contract, "get_storage_costs"),
    accountOf(contract),
  ]);
  if (!acc || !costs) return null; // без get_storage_costs это не Mintbase
  const price = BigInt(costs.storage_price_per_byte ?? PRICE);
  return {
    contract,
    family: "mintbase",
    owner,
    role: isOwner ? "owner" : "minter",
    balance: acc.amount.toString(),
    storage: (acc.usage * price).toString(),
    claimable: claimableYocto(acc.amount, acc.usage, price, CUSHION).toString(),
  };
}

/** Контракт HOT (фабрика nfts.tg), владелец которого уже известен. */
async function probeHot(contract: string, owner: string): Promise<StoreInfo | null> {
  const acc = await accountOf(contract);
  if (!acc) return null;
  return {
    contract,
    family: "hot",
    owner,
    role: "owner",
    balance: acc.amount.toString(),
    storage: (acc.usage * PRICE).toString(),
    claimable: claimableYocto(acc.amount, acc.usage, PRICE, HOT_CUSHION).toString(),
  };
}

/** Свежие цифры одного контракта — для пере-проверки прямо перед выводом. */
export async function probe(contract: string, account: string): Promise<StoreInfo | null> {
  const mb = await probeMintbase(contract, account);
  if (mb) return mb;
  const owner = await view<string>(HOT_FACTORY, "get_deployed_contract", { contract_id: contract });
  return owner === account ? probeHot(contract, account) : null;
}

/** Контракты, где у кошелька были NFT (FastNEAR). */
async function heldContracts(account: string): Promise<string[]> {
  try {
    const r = await fetch(`${FASTNEAR}/${encodeURIComponent(account)}/nft`);
    if (!r.ok) return [];
    const j = (await r.json()) as { tokens?: { contract_id?: string }[] };
    return [...new Set((j.tokens ?? []).map((t) => t.contract_id).filter((c): c is string => !!c))];
  } catch {
    return []; // индексер недоступен — останутся HOT-коллекции из фабрики
  }
}

/** HOT-коллекции, где кошелёк — владелец (из карты фабрики). */
async function ownedHotContracts(account: string): Promise<string[]> {
  const map = await view<Record<string, string>>(HOT_FACTORY, "get_deployed_contracts");
  if (!map) return [];
  return Object.entries(map)
    .filter(([, owner]) => owner === account)
    .map(([contract]) => contract);
}

/** Контракты-копилки, которыми кошелёк распоряжается (Mintbase + HOT). */
export async function listManagedStores(account: string): Promise<StoreInfo[]> {
  const [held, hot] = await Promise.all([heldContracts(account), ownedHotContracts(account)]);
  const hotSet = new Set(hot);
  // HOT-коллекции владельца проверяем всегда; из FastNEAR берём остальное
  // (Mintbase и возможные HOT), до лимита — свои HOT в начале, чтобы не срезать.
  const ids = [...hot, ...held.filter((c) => !hotSet.has(c))].slice(0, MAX_CANDIDATES);
  const probeOne = (c: string) =>
    hotSet.has(c) ? probeHot(c, account) : probeMintbase(c, account);
  const found: StoreInfo[] = [];
  for (let i = 0; i < ids.length; i += PARALLEL) {
    // Сбой сети — повтор; второй сбой валит весь список, иначе своя копилка
    // молча пропала бы.
    const wave = await Promise.all(
      ids.slice(i, i + PARALLEL).map((c) => probeOne(c).catch(() => probeOne(c))),
    );
    for (const s of wave) if (s) found.push(s);
  }
  return sortStores(found);
}
