// Чем подписывать вывод из хранилища: кошельком, подключённым на этой странице
// (свой коннектор, не приложения), или кошельком YupLink этого браузера.
import { forgetWallet, getStorageConnector, isOwnWallet } from "@/lib/storageConnector";
import type { StoreFamily } from "./storageChain";

export type StorageSigner = { accountId: string; kind: "external" | "yuplink" };

const GAS = 50_000_000_000_000n; // вызов + один перевод NEAR владельцу

// У Mintbase сумму считает сам контракт (депозит 1 yocto); у HOT сумму задаём
// мы, а депозит контракт не принимает (0).
function claimCall(family: StoreFamily, amountYocto: string) {
  return family === "hot"
    ? { method: "storage_refund", args: { amount: amountYocto }, deposit: 0n }
    : { method: "withdraw_excess_storage_deposits", args: {}, deposit: 1n };
}

/** Подключённый здесь внешний кошелёк (первым) и кошельки YupLink этого браузера. */
export async function listStorageSigners(): Promise<StorageSigner[]> {
  const out: StorageSigner[] = [];
  try {
    const conn = await (await getStorageConnector())?.getConnectedWallet();
    const id = conn?.accounts[0]?.accountId;
    if (id) out.push({ accountId: id, kind: "external" });
  } catch {
    /* внешний не подключён */
  }
  try {
    const { listLocalWallets } = await import("@/lib/embeddedWallet");
    for (const id of await listLocalWallets()) {
      if (!out.some((s) => s.accountId === id)) out.push({ accountId: id, kind: "yuplink" });
    }
  } catch {
    /* хранилище браузера недоступно — только внешний */
  }
  return out;
}

export async function connectExternal(): Promise<void> {
  const c = await getStorageConnector();
  if (!c) throw new Error("storage.err_wallets");
  await c.connect();
}

export async function disconnectExternal(): Promise<void> {
  const c = await getStorageConnector();
  const conn = await c?.getConnectedWallet().catch(() => null);
  // HOT из рамки Telegram и расширения — общие с приложением: их signOut
  // выкинул бы и из приложения. Такой просто забываем на этой странице.
  if (c && conn && isOwnWallet(conn.wallet.manifest.id)) await c.disconnect(conn.wallet);
  else forgetWallet();
}

type Outcome = {
  status?: unknown;
  transaction?: { hash?: string };
  receipts_outcome?: { outcome?: { logs?: string[] } }[];
};

function failed(o: Outcome | null): boolean {
  const s = o?.status;
  return !!s && typeof s === "object" && "Failure" in s;
}

/** Контракт не падает, когда отдавать нечего, — только пишет это в лог. */
function nothingWithdrawn(o: Outcome | null): boolean {
  return !!o?.receipts_outcome?.some((r) =>
    r.outcome?.logs?.some((l) => l.includes("Nothing withdrawn")),
  );
}

/** Забрать излишек хранилища контракта. Возвращает hash транзакции. */
export async function sendClaim(opts: {
  signer: StorageSigner;
  contract: string;
  family: StoreFamily;
  /** Сколько забрать (yocto) — используется только для HOT. */
  amount: string;
  pin?: string;
}): Promise<string> {
  const { signer, contract } = opts;
  const { method, args, deposit } = claimCall(opts.family, opts.amount);
  if (signer.kind === "external") {
    const conn = await (await getStorageConnector())?.getConnectedWallet().catch(() => null);
    if (!conn) throw new Error("storage.err_not_connected");
    if (conn.accounts[0]?.accountId !== signer.accountId)
      throw new Error("storage.err_wallet_changed");
    const out = await conn.wallet.signAndSendTransaction({
      signerId: signer.accountId,
      receiverId: contract,
      actions: [
        {
          type: "FunctionCall" as const,
          params: { methodName: method, args, gas: GAS.toString(), deposit: deposit.toString() },
        },
      ],
    });
    const o = out as Outcome | null;
    if (failed(o)) throw new Error("storage.err_failed");
    if (nothingWithdrawn(o)) throw new Error("storage.err_nothing");
    return o?.transaction?.hash ?? "";
  }
  const { getSecureSigner } = await import("@/lib/embeddedWallet");
  const { functionCallAction, signAndSendSequential } = await import("@/lib/nearTx");
  // PIN/пароль спрашиваются здесь, до транзакции, — ошибка уходит на страницу.
  const key = await getSecureSigner({ accountId: signer.accountId, pin: opts.pin });
  const [res] = await signAndSendSequential({
    signerId: signer.accountId,
    sign: key.sign,
    publicKeyStr: key.publicKeyStr,
    txs: [
      {
        receiverId: contract,
        actions: [functionCallAction({ methodName: method, args, gas: GAS, deposit })],
      },
    ],
  });
  if (!res?.txHash) throw new Error(res?.error || "storage.err_failed");
  return res.txHash;
}
