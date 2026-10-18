// Догон оплат энергии: перевод прошёл on-chain, энергия не начислена.
//
// Живой случай 22.08: игрок отправил 2×5000 HOPE, зачёт не состоялся,
// деньги ушли в никуда — спасал ручной разбор. Теперь крон сам находит такие
// переводы по memo `buy energy pack {packId}` и выдаёт энергию.
//
// В отличие от пак-догона работает с ЛЮБЫМ токеном (HOPE, GDarai, USDT…),
// потому что энергия продаётся за целый список валют.
//
// Зачёт одного перевода живёт в lost-payments-energy-settle.ts — тем же кодом
// игрок закрывает свою оплату сразу, не дожидаясь крона (energy-packs-pending).
import { fetchAdminFtTransferHistory } from "@/server/sendler";
import { readTopUpMemo } from "./lost-payments-account-memo";
import {
  ENERGY_RECEIVER,
  knownEnergyTx,
  loadEnergyPacks,
  settleEnergyTransfer,
} from "./lost-payments-energy-settle";

/** Не лезем в древность: крон догоняет только свежие переводы. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type Result = {
  scanned: number;
  delivered: number;
  energy: number;
  skippedKnown: number;
  skippedNoMemo: number;
  skippedCheap: number;
};

export async function runEnergyOrphanReconcile(): Promise<Result> {
  const out: Result = {
    scanned: 0,
    delivered: 0,
    energy: 0,
    skippedKnown: 0,
    skippedNoMemo: 0,
    skippedCheap: 0,
  };

  const packs = await loadEnergyPacks();
  if (packs.size === 0) return out;

  const done = await knownEnergyTx();
  const inc = await fetchAdminFtTransferHistory({
    walletId: ENERGY_RECEIVER,
    direction: "in",
    limit: 200,
  });
  const minTs = Date.now() - MAX_AGE_MS;

  for (const t of inc) {
    out.scanned++;
    const tx = t.txHash ?? "";
    if (!tx) continue;
    if (done.has(tx.toLowerCase())) {
      out.skippedKnown++;
      continue;
    }
    // Время приходит в наносекундах блока.
    const ts = t.blockTimestampNs ? Number(t.blockTimestampNs) / 1e6 : NaN;
    if (Number.isFinite(ts) && ts < minTs) continue;

    const mm = readTopUpMemo(t);
    if (!mm) continue; // без подписанта начислять некому
    const res = await settleEnergyTransfer({
      tx,
      symbol: String(t.symbol ?? ""),
      paid: Number(t.amount ?? 0),
      packs,
      memo: mm.memo,
      signer: mm.signer,
    }).catch(() => null);

    if (!res) continue;
    if (!res.ok) {
      if (res.reason === "cheap") out.skippedCheap++;
      else if (res.reason === "known") out.skippedKnown++;
      else if (res.reason === "no_memo") out.skippedNoMemo++;
      continue;
    }
    done.add(tx.toLowerCase());
    out.delivered++;
    out.energy += res.energy;
  }
  return out;
}
