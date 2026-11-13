// Подписи игроков по кошелькам (лавка фишек, дуэли фишек): своё имя или @ник.
import { mcpExec } from "@/server/db/mcpClient";
import { walletLabelsSql } from "./player-name-sql";

/** Кошелёк → подпись. Сбой чтения — пустой словарь (покажется кошелёк). */
export async function walletLabels(wallets: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(wallets.filter(Boolean))];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = (await mcpExec(walletLabelsSql(ids), { wrapJson: true }).catch(() => [])) as Array<{
    wallet: string;
    name: string | null;
  }> | null;
  for (const r of rows ?? []) if (r.wallet && r.name?.trim()) out.set(r.wallet, r.name.trim());
  return out;
}

export async function walletLabel(wallet: string): Promise<string | null> {
  return (await walletLabels([wallet])).get(wallet) ?? null;
}
