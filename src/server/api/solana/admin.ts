// Админ-ручки Solana (владелец): кто привязал кош + что пришло на наш адрес.
// Только чтение. Выдачу награды не трогаем (коллекции пока нет).
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { getCurrentWallet, isAdminWallet } from "../../auth";
import { SOLANA_RECEIVE_ADDRESS } from "./config";
import { solBalance, recentSignatures } from "./helius";

function requireOwner(): void {
  const w = getCurrentWallet();
  if (!w || !isAdminWallet(w)) throw new Error("Только владелец");
}

/** Список привязанных Solana-кошельков по аккаунтам. */
export const solanaAdminList = createServerFn({ method: "GET" }).handler(async () => {
  requireOwner();
  const rows = (await mcpExec(
    `SELECT account_id, address, verified_at FROM yuplink.solana_wallet
      WHERE address IS NOT NULL ORDER BY verified_at DESC NULLS LAST LIMIT 500;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ account_id: string; address: string; verified_at: string }>;
  return { count: rows?.length ?? 0, wallets: rows ?? [] };
});

/** Поступления на наш адрес: баланс + последние транзакции. */
export const solanaAdminDeposits = createServerFn({ method: "GET" }).handler(async () => {
  requireOwner();
  const [sol, sigs] = await Promise.all([
    solBalance(SOLANA_RECEIVE_ADDRESS).catch(() => null),
    recentSignatures(SOLANA_RECEIVE_ADDRESS, 25).catch(() => []),
  ]);
  return {
    address: SOLANA_RECEIVE_ADDRESS,
    sol,
    recent: (sigs ?? []).map((s) => ({
      signature: s.signature,
      slot: s.slot,
      blockTime: s.blockTime,
      failed: !!s.err,
    })),
  };
});
