// Разбивка ввода NFT на транзакции и разбор ответа сервера.
//
// Главное здесь — NFT_PER_TX. Раньше клиент лепил все выбранные NFT в одну
// транзакцию: на 12 штуках она получалась заведомо невалидной (см. ниже) и
// «Ввести (12)» падало целиком, ещё и до всякого объяснения.
import { getSignerWallet } from "@/lib/near-connector";
import { extractTxHash, type DepositNft } from "./nft-input-shared";
import { addLine, type DepositOutcome } from "./nftDepositOutcome";

/** Газ на один nft_transfer. */
const GAS_PER_TRANSFER = "30000000000000"; // 30 TGas

/**
 * Потолок NEAR на транзакцию — 300 TGas, то есть ровно 10 переводов по 30 TGas.
 * Одиннадцатый действие делает транзакцию невалидной ещё до сети.
 */
export const NFT_PER_TX = 10;

export type DepositChunk = {
  rewardType: "chip" | "pack";
  contract: string;
  tokenIds: string[];
};

/** Группируем по (тип награды, контракт) — сервер принимает батч только так — и
 *  режем на партии по NFT_PER_TX. */
export function planChunks(nfts: DepositNft[]): DepositChunk[] {
  const groups = new Map<string, DepositChunk>();
  for (const n of nfts) {
    const key = `${n.rewardType}|${n.contract}`;
    let g = groups.get(key);
    if (!g) {
      g = { rewardType: n.rewardType, contract: n.contract, tokenIds: [] };
      groups.set(key, g);
    }
    g.tokenIds.push(n.tokenId);
  }
  const out: DepositChunk[] = [];
  for (const g of groups.values()) {
    for (let i = 0; i < g.tokenIds.length; i += NFT_PER_TX) {
      out.push({ ...g, tokenIds: g.tokenIds.slice(i, i + NFT_PER_TX) });
    }
  }
  return out;
}

/** Подписать и отправить одну партию. Возвращает txHash. */
export async function sendChunkTx(
  chunk: Pick<DepositChunk, "contract" | "tokenIds">,
  receiverId: string,
): Promise<string> {
  const w = await getSignerWallet();
  const outcome = await w.signAndSendTransactions({
    transactions: [
      {
        receiverId: chunk.contract,
        actions: chunk.tokenIds.map((tokenId) => ({
          type: "FunctionCall" as const,
          params: {
            methodName: "nft_transfer",
            args: { receiver_id: receiverId, token_id: tokenId, memo: "yuplink nft input" },
            gas: GAS_PER_TRANSFER,
            deposit: "1",
          },
        })),
      },
    ],
  });
  const txHash = extractTxHash(outcome);
  if (!txHash) throw new Error("chips.no_txhash");
  return txHash;
}

type Failure = { tokenId: string; reason: string };

/**
 * Токены, чей перевод состоялся, но индекс Sendler его ещё не отдал, плюс
 * готовое обещание игроку. Отказом не являются — награду доводит догон.
 */
type PendingPart = { pending?: string[]; pendingNote?: string };

/** Ответ батч-выдачи паков (структурно — как у depositManyAsPack). */
export type PackBatchReply = PendingPart & {
  results: Array<{ tokenId: string; packName: string; grantCount: number }>;
  failures: Failure[];
};

/** Ответ батч-выдачи фишек (структурно — как у depositManyAsChip). */
export type ChipBatchReply = PendingPart & {
  results: Array<{ tokenId: string; templateName: string; level: number }>;
  failures: Failure[];
};

/** Складываем выданные паки в итог; возвращаем зачтённые токены. */
export function absorbPacks(acc: DepositOutcome, r: PackBatchReply): string[] {
  for (const x of r.results) addLine(acc.packs, x.packName, Math.max(1, x.grantCount));
  return r.results.map((x) => x.tokenId);
}

/** То же для фишек. */
export function absorbChips(acc: DepositOutcome, r: ChipBatchReply): string[] {
  for (const x of r.results) addLine(acc.chips, x.templateName, 1, x.level);
  return r.results.map((x) => x.tokenId);
}

/** Отказы: считаем и запоминаем первую причину — её и показываем игроку. */
export function absorbFailures(acc: DepositOutcome, failures: Failure[]): void {
  acc.failed += failures.length;
  if (!acc.failText && failures[0]) acc.failText = failures[0].reason;
}

/**
 * Ожидающие подтверждения: копим счётчик и обещание, возвращаем их токены —
 * кнопку у этих NFT надо погасить так же, как у выданных, иначе игрок отправит
 * их вторым заходом и потеряет.
 */
export function absorbPending(acc: DepositOutcome, r: PendingPart): string[] {
  const list = r.pending ?? [];
  if (list.length === 0) return [];
  acc.pending = (acc.pending ?? 0) + list.length;
  if (!acc.pendingNote && r.pendingNote) acc.pendingNote = r.pendingNote;
  return list;
}
