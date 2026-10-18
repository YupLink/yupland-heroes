// Чем подписывать сжигание: тем же подключением, что живёт в приложении.
//
// Внешний кошелёк (HOT и др.) — общий коннектор приложения, его не
// переподключаем и не отключаем. Кошельки YupLink — ключи в этом браузере,
// подписывают сами. Сессию сервиса здесь не трогаем вовсе: выбор кошелька на
// странице влияет только на то, чьи NFT жечь.
import { getConnector } from "@/lib/near-connector";
import { BURN_GAS, BURN_GAS_BIG, chunkIds } from "./burnPlan";

export type BurnSigner = { accountId: string; kind: "external" | "yuplink" };

/** Подключённый внешний кошелёк и кошельки YupLink этого браузера. */
export async function listBurnSigners(sessionWallet: string | null): Promise<BurnSigner[]> {
  const out: BurnSigner[] = [];
  const c = await getConnector();
  if (c) {
    try {
      const conn = await c.getConnectedWallet();
      const id = conn.accounts[0]?.accountId;
      if (id) out.push({ accountId: id, kind: "external" });
    } catch {
      /* внешний не подключён */
    }
  }
  try {
    const { listLocalWallets } = await import("@/lib/embeddedWallet");
    for (const id of await listLocalWallets()) {
      if (!out.some((s) => s.accountId === id)) out.push({ accountId: id, kind: "yuplink" });
    }
  } catch {
    /* хранилище недоступно — только внешний */
  }
  // Кошелёк текущей сессии — первым: его и выбираем по умолчанию.
  return out.sort(
    (a, b) => Number(b.accountId === sessionWallet) - Number(a.accountId === sessionWallet),
  );
}

type Outcome = { status?: unknown } | null | undefined;

function statusOf(o: Outcome): "ok" | "failed" | "unknown" {
  const s = o?.status;
  if (!s || typeof s !== "object") return "unknown";
  if ("Failure" in s) return "failed";
  return "SuccessValue" in s || "SuccessReceiptId" in s ? "ok" : "unknown";
}

export type BurnResult = {
  /** Точно сгорело — убираем с экрана сразу. */
  burned: string[];
  /** Хоть одна партия не прошла (сгоревшее в других уже не вернуть). */
  failed: boolean;
};

/**
 * Сжечь token_ids. Партии по BURN_PER_TX; во внешнем кошельке — все партии
 * одним подтверждением, у кошелька YupLink — одной серией nonce.
 */
export async function sendBurn(opts: {
  signer: BurnSigner;
  contract: string;
  tokenIds: string[];
  pin?: string;
}): Promise<BurnResult> {
  const chunks = chunkIds(opts.tokenIds);
  if (chunks.length === 0) return { burned: [], failed: false };
  return opts.signer.kind === "external"
    ? burnExternal(opts.signer.accountId, opts.contract, chunks)
    : burnYupLink(opts.signer.accountId, opts.contract, chunks, opts.pin);
}

async function burnExternal(
  accountId: string,
  contract: string,
  chunks: string[][],
): Promise<BurnResult> {
  // Без переподключения: getSignerWallet при обрыве сам зовёт connect(), а
  // выбор другого кошелька там подменил бы сессию всего приложения.
  const c = await getConnector();
  const conn = await c?.getConnectedWallet().catch(() => null);
  if (!conn) throw new Error("burn.err_not_connected");
  if (conn.accounts[0]?.accountId !== accountId) throw new Error("burn.err_wallet_changed");
  const out = await conn.wallet.signAndSendTransactions({
    signerId: accountId,
    transactions: chunks.map((ids) => ({
      receiverId: contract,
      actions: [
        {
          type: "FunctionCall" as const,
          params: {
            methodName: "nft_batch_burn",
            args: { token_ids: ids },
            gas: BURN_GAS,
            deposit: "1",
          },
        },
      ],
    })),
  });
  const outs = (Array.isArray(out) ? out : [out]) as Outcome[];
  const st = chunks.map((_, i) => statusOf(outs[i]));
  return {
    burned: chunks.filter((_, i) => st[i] === "ok").flat(),
    failed: st.some((x) => x === "failed"),
  };
}

async function burnYupLink(
  accountId: string,
  contract: string,
  chunks: string[][],
  pin?: string,
): Promise<BurnResult> {
  const { getSecureSigner } = await import("@/lib/embeddedWallet");
  const { functionCallAction, signAndSendSequential } = await import("@/lib/nearTx");
  // PIN/пароль спрашиваются здесь, до первой транзакции, — ошибка уходит на страницу.
  const signer = await getSecureSigner({ accountId, pin });
  // Одна серия nonce: запрос nonce на каждую партию отстаёт на «final» и
  // вторая партия ловила бы InvalidNonce.
  const res = await signAndSendSequential({
    signerId: accountId,
    sign: signer.sign,
    publicKeyStr: signer.publicKeyStr,
    txs: chunks.map((ids) => ({
      receiverId: contract,
      actions: [
        functionCallAction({
          methodName: "nft_batch_burn",
          args: { token_ids: ids },
          gas: BURN_GAS_BIG,
          deposit: 1n,
        }),
      ],
    })),
  });
  return {
    burned: chunks.filter((_, i) => !!res[i]?.txHash).flat(),
    failed: res.some((r) => !r.txHash),
  };
}
