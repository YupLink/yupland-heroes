// Оплата энергии «в пути»: перевод подписан on-chain, покупка ещё не записана.
//
// Живой случай 24.08 (player12.tg): серверный вызов после подписи не докрутил,
// энергия появилась только через 4 минуты (крон-догон), и игрок за это время
// заплатил второй раз. Пока оплата не зачтена, кнопки покупки должны быть
// закрыты, а зачёт — идти сразу, не дожидаясь получаса до крона.
import { createServerFn } from "@tanstack/react-start";
import { fetchAdminFtTransferHistory } from "@/server/sendler";
import { requireWallet } from "./energy-packs-shared";
import { readTopUpMemo } from "./lost-payments-account-memo";
import {
  ENERGY_RECEIVER,
  knownEnergyTx,
  loadEnergyPacks,
  settleEnergyTransfer,
} from "./lost-payments-energy-settle";

/** Старше этого оплату «в пути» не считаем — её добьёт крон. */
const WINDOW_MS = 6 * 60 * 60 * 1000;

export type PendingEnergyPayment = {
  txHash: string;
  packId: string | null;
  symbol: string;
  amount: number;
  ageSec: number;
  /** Служебные: метка и подписант из записи Sendler. Клиенту не отдаём. */
  memo: string;
  signer: string;
};

/** Свои переводы на приёмник с memo энергии, по которым покупки ещё нет. */
async function unsettledOf(wallets: string[]): Promise<PendingEnergyPayment[]> {
  const known = await knownEnergyTx();
  const out: PendingEnergyPayment[] = [];
  const now = Date.now();

  for (const w of wallets.slice(0, 3)) {
    const items = await fetchAdminFtTransferHistory({
      walletId: w,
      direction: "out",
      limit: 30,
    }).catch(() => []);
    for (const t of items) {
      const tx = t.txHash ?? "";
      if (!tx || known.has(tx.toLowerCase())) continue;
      if (t.receiver && t.receiver !== ENERGY_RECEIVER) continue;
      const ts = t.blockTimestampNs ? Number(t.blockTimestampNs) / 1e6 : NaN;
      if (!Number.isFinite(ts) || now - ts > WINDOW_MS) continue;

      // Метка — ИЗ ЗАПИСИ Sendler. Прежде на каждый перевод уходил запрос в
      // цепь: до девяноста подряд на один заход игрока в экран энергии.
      const head = readTopUpMemo(t);
      const packId = head?.memo.match(/buy energy pack (\S+)/)?.[1] ?? null;
      if (!packId || !head) continue;
      out.push({
        txHash: tx,
        packId,
        symbol: String(t.symbol ?? ""),
        amount: Number(t.amount ?? 0),
        ageSec: Math.max(0, Math.round((now - ts) / 1000)),
        memo: head.memo,
        signer: head.signer,
      });
    }
  }
  return out;
}

async function myWallets(): Promise<string[]> {
  const wallet = requireWallet();
  const { getSisterWallets } = await import("./user");
  const sisters = await getSisterWallets(wallet).catch(() => [wallet]);
  return Array.from(new Set([wallet, ...sisters]));
}

/** Есть ли у меня оплата, которая ещё не превратилась в энергию. */
export const myPendingEnergyPayment = createServerFn({ method: "GET" }).handler(async () => {
  const wallets = await myWallets();
  const list = await unsettledOf(wallets).catch(() => []);
  const p = list[0];
  // Форму ответа не меняем: memo/signer — служебные, клиенту не нужны (§11.13).
  const pending = p
    ? {
        txHash: p.txHash,
        packId: p.packId,
        symbol: p.symbol,
        amount: p.amount,
        ageSec: p.ageSec,
      }
    : null;
  return { pending, count: list.length };
});

/**
 * Зачесть свои неучтённые оплаты прямо сейчас. Тот же код, что у крона, но
 * только по своим переводам — игрок получает энергию за секунды.
 */
export const settleMyEnergyPayments = createServerFn({ method: "POST" }).handler(async () => {
  const wallets = await myWallets();
  const list = await unsettledOf(wallets).catch(() => []);
  if (list.length === 0) return { settled: 0, energy: 0, pending: null };

  const packs = await loadEnergyPacks();
  let settled = 0;
  let energy = 0;
  for (const p of list) {
    const res = await settleEnergyTransfer({
      tx: p.txHash,
      symbol: p.symbol,
      paid: p.amount,
      packs,
      memo: p.memo,
      signer: p.signer,
    }).catch(() => null);
    if (res?.ok) {
      settled++;
      energy += res.energy;
    }
  }
  const left = await unsettledOf(wallets).catch(() => []);
  return { settled, energy, pending: left[0] ?? null };
});
