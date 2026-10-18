// chips-craft-darai — DARAI balance, deposit, and verification.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import {
  requireWallet,
  DARAI_FT_CONTRACT,
  getMintSpend,
} from "./chips-mint-helpers";
import { DARAI_DECIMALS, DARAI_DEPOSIT_RECEIVER } from "./chips-utils";

export const DARAI_MIN_DEPOSIT_HUMAN = 1_000_000n;
const DARAI_MIN_DEPOSIT_RAW =
  DARAI_MIN_DEPOSIT_HUMAN * 10n ** BigInt(DARAI_DECIMALS);

export async function computeDaraiBalance(wallet: string): Promise<{
  pending: number;
  deposited: number;
  spent: number;
  available: number;
}> {
  const { getSisterWallets } = await import("./user");
  const sisters = await getSisterWallets(wallet);
  const { data: pendRows } = await pg.redemptions
    .raw()
    .select("amount")
    .in("wallet", sisters)
    .eq("reward_token", "DARAI")
    .gt("amount", 0);
  const pending = (pendRows ?? []).reduce(
    (s, r) => s + Number((r as { amount: number }).amount ?? 0),
    0
  );
  const { data: depRows } = await pg.daraiDeposits
    .raw()
    .select("amount")
    .in("wallet", sisters);
  const deposited = (depRows ?? []).reduce(
    (s, r) => s + Number((r as { amount: number }).amount ?? 0),
    0
  );
  const { data: spendRows } = await pg.chipEconomySpend
    .raw()
    .select("amount")
    .in("wallet", sisters);
  const spentTable = (spendRows ?? []).reduce(
    (s, r) => s + Number((r as { amount: number }).amount ?? 0),
    0
  );
  let mintSpent = 0;
  for (const w of sisters) mintSpent += await getMintSpend(w);
  const spent = spentTable + mintSpent;
  return {
    pending,
    deposited,
    spent,
    available: Math.max(0, pending + deposited - spent),
  };
}

export const getMyDaraiBalance = createServerFn({ method: "GET" }).handler(
  async () => computeDaraiBalance(requireWallet())
);

export const getDaraiDepositInfo = createServerFn({ method: "GET" }).handler(
  async () => {
    return {
      ftContract: DARAI_FT_CONTRACT,
      receiverId: DARAI_DEPOSIT_RECEIVER,
      decimals: DARAI_DECIMALS,
      minHuman: Number(DARAI_MIN_DEPOSIT_HUMAN),
    };
  }
);

export const myDaraiDeposits = createServerFn({ method: "GET" }).handler(
  async () => {
    const wallet = requireWallet();
    const { getSisterWallets } = await import("./user");
    const { data } = await pg.daraiDeposits
      .raw()
      .select("id,amount,tx_hash,receiver_id,created_at")
      .in("wallet", await getSisterWallets(wallet))
      .order("created_at", { ascending: false })
      .limit(20);
    return (data ?? []) as Array<{
      id: string;
      amount: number;
      tx_hash: string;
      receiver_id: string;
      created_at: string;
    }>;
  }
);

export const verifyDaraiDeposit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ txHash: z.string().min(20).max(64) }).parse(d)
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const receiverId = DARAI_DEPOSIT_RECEIVER;

    const existing = await pg.daraiDeposits.findFirst({ tx_hash: data.txHash });
    if (existing) throw new Error("Эту квитанцию уже зачли");
    // Приёмник у билетов, энергии и DARAI ОДИН (darai_gdrop.near), поэтому
    // перевод, которым уже купили билеты или пополнили счёт, нельзя зачесть
    // здесь вторым товаром. Остальные пути зовут стража через verifyFtTransfer,
    // а этот ходит своим RPC — страж вызывается явно.
    const { assertReceiptFree } = await import("./receipt-guard");
    await assertReceiptFree(data.txHash, "darai");

    const { nearRpc } = await import("../rpc");
    const j = await nearRpc<{
      transaction?: {
        signer_id?: string;
        receiver_id?: string;
        actions?: Array<{
          FunctionCall?: {
            method_name?: string;
            args?: string;
            deposit?: string;
          };
        }>;
      };
      status?: { SuccessValue?: string };
    }>("tx", [data.txHash, wallet]);
    if (j.error) {
      const msg =
        typeof j.error === "object" && j.error && "message" in j.error
          ? String((j.error as { message: string }).message)
          : "RPC error";
      throw new Error(`NEAR RPC: ${msg}`);
    }
    const tx = j.result?.transaction;
    if (!tx) throw new Error("Tx не найдена в RPC");
    if (tx.signer_id !== wallet)
      throw new Error(
        `Подписант квитанции (${tx.signer_id}) не совпадает с тобой`
      );
    if (tx.receiver_id !== DARAI_FT_CONTRACT)
      throw new Error(
        `Tx адресована не контракту DARAI (${tx.receiver_id} ≠ ${DARAI_FT_CONTRACT})`
      );
    if (!j.result?.status?.SuccessValue && j.result?.status?.SuccessValue !== "")
      throw new Error("Tx ещё не финализирована — подожди и повтори");

    let depositedRaw = 0n;
    for (const a of tx.actions ?? []) {
      const fc = a.FunctionCall;
      if (!fc || fc.method_name !== "ft_transfer" || !fc.args) continue;
      try {
        const argsJson = JSON.parse(
          Buffer.from(fc.args, "base64").toString("utf8")
        ) as { receiver_id?: string; amount?: string };
        if (argsJson.receiver_id !== receiverId) continue;
        if (typeof argsJson.amount !== "string") continue;
        depositedRaw += BigInt(argsJson.amount);
      } catch {
        // битый JSON — пропускаем
      }
    }
    if (depositedRaw < DARAI_MIN_DEPOSIT_RAW) {
      throw new Error(
        `Минимум ${DARAI_MIN_DEPOSIT_HUMAN.toString()} DARAI. В квитанции: ${(
          depositedRaw /
          10n ** BigInt(DARAI_DECIMALS)
        ).toString()}`
      );
    }

    const humanAmount = Number(depositedRaw / 10n ** BigInt(DARAI_DECIMALS));
    await pg.daraiDeposits.insert({
      id: `dd_${nanoid(10)}`,
      wallet,
      tx_hash: data.txHash,
      amount: humanAmount,
      ft_contract: DARAI_FT_CONTRACT,
      receiver_id: receiverId,
      created_at: new Date().toISOString(),
    });

    return { ok: true, amount: humanAmount };
  });
