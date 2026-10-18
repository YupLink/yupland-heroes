// YUPLINK · Кто держит legendary-NFT — вынесено из payouts.ts, чтобы файл
// раздачи не разрастался (правило ≤250 строк) и чтобы список держателей
// можно было переиспользовать отдельно от калькулятора долей.

import { pg } from "../db/pg";
import { fetchSendlerNftsByTitle } from "../sendler";

export const LEGENDARY_NFT_NAME = "Yup'ik YupLink (legendary)";
export const LEGENDARY_NFT_CONTRACT = "yuplandshop.mintbase1.near";

// Системные коши — их держатели не считаются в legendary-доле (это «склад»,
// а не реальные держатели). darai_gdrop тут не появится сам по себе, но
// добавляем на всякий случай.
export const SYSTEM_WALLETS_EXCLUDED_FROM_HOLDERS = new Set([
  "darai_collection.near",
  "darai_gdrop.near",
  "darai_duplo.near",
]);

export interface LegendaryHolders {
  holders: Array<{ wallet: string; qty: number }>;
  source: "sendler" | "db-fallback";
  totalFound: number;
}

/** Текущие держатели legendary-NFT.
 *  Канонический источник — Sendler API (он индексит весь mintbase).
 *  Локальная yuplink.nfts — fallback (могут быть устаревшие записи).
 *  Возвращаем (wallet, qty) с учётом всех 150 экземпляров. */
export async function fetchLegendaryHolders(): Promise<LegendaryHolders> {
  // 1) Пробуем Sendler — он отдаёт все 150 экземпляров с актуальным owner_id.
  try {
    const items = await fetchSendlerNftsByTitle(
      LEGENDARY_NFT_CONTRACT,
      LEGENDARY_NFT_NAME
    );
    const counts = new Map<string, number>();
    for (const it of items) {
      const w = (it.owner_id ?? "").trim();
      if (!w) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    return {
      holders: Array.from(counts.entries())
        .map(([wallet, qty]) => ({ wallet, qty }))
        .sort((a, b) => b.qty - a.qty),
      source: "sendler",
      totalFound: items.length,
    };
  } catch (e) {
    console.warn(
      "fetchLegendaryHolders: Sendler упал, fallback на DB",
      e instanceof Error ? e.message : e
    );
  }

  // 2) Fallback: локальная yuplink.nfts (может быть устаревшая).
  const { data } = await pg.nfts
    .raw()
    .select("owner_wallet")
    .eq("contract_id", LEGENDARY_NFT_CONTRACT)
    .eq("name", LEGENDARY_NFT_NAME);
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ owner_wallet: string }>) {
    if (!r.owner_wallet) continue;
    counts.set(r.owner_wallet, (counts.get(r.owner_wallet) ?? 0) + 1);
  }
  const arr = Array.from(counts.entries())
    .map(([wallet, qty]) => ({ wallet, qty }))
    .sort((a, b) => b.qty - a.qty);
  return {
    holders: arr,
    source: "db-fallback",
    totalFound: arr.reduce((s, h) => s + h.qty, 0),
  };
}
