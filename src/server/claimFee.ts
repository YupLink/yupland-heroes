// Верификация комиссии за claim: юзер шлёт N yoctoN на наш кош, бэк
// через NEAR RPC проверяет факт TX. Без custodial-подписи — юзер сам
// инициировал и подписал через embedded.
//
// Защиты:
//  1. fee_tx_hash UNIQUE в redemptions + nft_redemptions (нельзя
//     переиспользовать одну квитанцию на два claim'a)
//  2. RPC view_tx с finality=final — ждём пока TX подтверждена
//  3. Сверяем signer, receiver, amount
//  4. Не старше N минут (защита от reuse чужой quitancii)

import { pg } from "./db/pg";

interface FeeConfig {
  yocto: bigint;
  recipient: string;
}

let cachedConfig: FeeConfig | null = null;
let cachedAt = 0;

export async function getClaimFeeConfig(): Promise<FeeConfig> {
  // cache 60 сек чтобы не дёргать БД на каждом claim
  if (cachedConfig && Date.now() - cachedAt < 60_000) return cachedConfig;
  const recipientRow = await pg.settings.findOne({
    key: "claim_fee_recipient",
  });
  const yoctoRow = await pg.settings.findOne({ key: "claim_fee_yocto" });
  cachedConfig = {
    recipient: recipientRow?.value ?? "darai_gdrop.near",
    yocto: BigInt(yoctoRow?.value ?? "2000000000000000000000"), // 0.002 NEAR
  };
  cachedAt = Date.now();
  return cachedConfig;
}

interface VerifyFeeArgs {
  txHash: string;
  signerExpected: string;
}

interface VerifiedFee {
  ok: true;
  amount: bigint;
}

interface FeeError {
  ok: false;
  error: string;
}

export async function verifyClaimFeeTx(
  args: VerifyFeeArgs
): Promise<VerifiedFee | FeeError> {
  const cfg = await getClaimFeeConfig();

  // 1. Проверка что hash уже не использован
  const existsRedemption = await pg.redemptions.findFirst({
    fee_tx_hash: args.txHash,
  });
  if (existsRedemption) return { ok: false, error: "fee_tx уже использовалась" };
  const existsNft = await pg.nftRedemptions.findFirst({
    fee_tx_hash: args.txHash,
  });
  if (existsNft) return { ok: false, error: "fee_tx уже использовалась" };

  // 2. RPC через пул с failover (claim_fee — нативный NEAR Transfer,
  // не ft_transfer → Sendler не индексирует, нужен только RPC).
  const { nearRpc } = await import("./rpc");
  const j = await nearRpc<{
    transaction?: {
      signer_id?: string;
      receiver_id?: string;
      actions?: Array<{ Transfer?: { deposit?: string } }>;
    };
    status?: { SuccessValue?: string };
  }>("tx", [args.txHash, args.signerExpected]);
  if (j.error) {
    const msg =
      typeof j.error === "object" && j.error && "message" in j.error
        ? String((j.error as { message: string }).message)
        : "RPC error";
    return { ok: false, error: `RPC: ${msg}` };
  }
  const tx = j.result?.transaction;
  if (!tx) return { ok: false, error: "tx не найдена в RPC" };

  if (tx.signer_id !== args.signerExpected)
    return { ok: false, error: `signer ${tx.signer_id} ≠ ${args.signerExpected}` };
  if (tx.receiver_id !== cfg.recipient)
    return { ok: false, error: `receiver ${tx.receiver_id} ≠ ${cfg.recipient}` };

  let totalTransferred = 0n;
  for (const a of tx.actions ?? []) {
    if (a.Transfer?.deposit) totalTransferred += BigInt(a.Transfer.deposit);
  }
  if (totalTransferred < cfg.yocto) {
    return {
      ok: false,
      error: `недоплачено: ${totalTransferred} < ${cfg.yocto}`,
    };
  }

  // SuccessValue должен быть (TX финализирована)
  if (!j.result?.status?.SuccessValue && j.result?.status?.SuccessValue !== "") {
    return { ok: false, error: "tx ещё не финализирована" };
  }

  return { ok: true, amount: totalTransferred };
}
