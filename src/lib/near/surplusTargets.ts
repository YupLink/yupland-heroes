// Куда и как забирать излишки NEAR с NFT-контрактов (кнопка в админке дропов).
// Контракт определяется ПОДКЛЮЧЁННЫМ кошельком: каждый снимает только со своего.
//  · darai_collection.near → лавка Mintbase yuplandshop.mintbase1.near:
//    withdraw_excess_storage_deposits, 1 yocto, сумму считает сам контракт.
//  · yupland_nfts.near (владелец, 18.10.2026) → YupAI yupai.nfts.tg (фабрика HOT
//    nfts.tg): storage_refund {"amount":"<yocto>"}, депозит 0. Контракт переводит
//    ровно amount и только владельцу (owner_id = yupland_nfts.near), сумму не
//    проверяет — её считаем здесь: свободное (баланс − оплата хранилища) минус
//    запас 1 NEAR. Запас нужен: передача NFT новому держателю оплачивает рост
//    хранилища с баланса контракта, при нуле переводы NFT начнут падать.
//    Формат аргументов проверен пробным вызовом на чтение (18.10).
export type SurplusTarget = {
  signer: string;
  contract: string;
  method: string;
  deposit: string;
  gas: string;
  /** Запас на контракте, yocto; null — сумму решает сам контракт. */
  reserveYocto: bigint | null;
  args: (amountYocto: bigint | null) => Record<string, unknown>;
};

const NEAR = BigInt("1000000000000000000000000");
const BYTE_COST = BigInt("10000000000000000000"); // 1e19 yocto за байт хранилища

export const SURPLUS_TARGETS: readonly SurplusTarget[] = [
  {
    signer: "darai_collection.near",
    contract: "yuplandshop.mintbase1.near",
    method: "withdraw_excess_storage_deposits",
    deposit: "1",
    gas: "30000000000000",
    reserveYocto: null,
    args: () => ({}),
  },
  {
    signer: "yupland_nfts.near",
    contract: "yupai.nfts.tg",
    method: "storage_refund",
    deposit: "0",
    gas: "30000000000000",
    reserveYocto: NEAR,
    args: (amount) => ({ amount: (amount ?? BigInt(0)).toString() }),
  },
];

export const surplusTargetOf = (signer: string | null | undefined): SurplusTarget | undefined =>
  SURPLUS_TARGETS.find((t) => t.signer === signer);

const RPCS = ["https://rpc.mainnet.fastnear.com", "https://rpc.mainnet.near.org"];

export type ContractBalance = { amount: bigint; storage: bigint; free: bigint };

/** AbortSignal.timeout есть не во всех WebView — собираем вручную. */
function timeoutSignal(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

/** Баланс контракта, оплата хранилища и свободное — по view_account. */
export async function contractBalance(accountId: string): Promise<ContractBalance> {
  let last: unknown = null;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Зависший первый узел — исключение через 8 с, и пробуем второй.
        signal: timeoutSignal(8000),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "surplus",
          method: "query",
          params: { request_type: "view_account", finality: "final", account_id: accountId },
        }),
      });
      const j = (await r.json()) as {
        result?: { amount: string; locked: string; storage_usage: number };
        error?: unknown;
      };
      if (!j.result) throw new Error("RPC без ответа");
      const amount = BigInt(j.result.amount);
      const storage = BigInt(j.result.storage_usage) * BYTE_COST;
      const locked = BigInt(j.result.locked);
      const owed = storage > locked ? storage - locked : BigInt(0);
      const free = amount > owed ? amount - owed : BigInt(0);
      return { amount, storage, free };
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("Не удалось прочитать баланс контракта");
}

/** Сколько снять: свободное минус запас; не больше показанного игроку. */
export function withdrawable(free: bigint, reserve: bigint, shown?: bigint | null): bigint {
  const can = free > reserve ? free - reserve : BigInt(0);
  return shown != null && shown < can ? shown : can;
}

/** yocto → «56,8844» NEAR (4 знака, вниз). */
export function nearText(yocto: bigint, ru: boolean): string {
  const tenThousandths = yocto / BigInt("100000000000000000000");
  return (Number(tenThousandths) / 1e4).toLocaleString(ru ? "ru-RU" : "en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}
