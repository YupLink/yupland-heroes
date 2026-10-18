// Сборка карточки «что было с этой NFT» для экрана владельца.
//
// Ответ на жалобу «ввёл NFT — ничего не пришло» собирается из четырёх следов, и
// ни один из них сам по себе не полон:
//   • перевод на складе (Sendler) — что игрок реально отправил;
//   • журнал операций    — что успел сделать сервер и на чём встал;
//   • квитанция          — отметка «эту NFT зачли» (доказательством ВЫДАЧИ не
//                          является — ровно на этом и терялись паки);
//   • круг NFT           — зачтён ли этот перевод (nft-cycle.ts): выдача за
//                          него или закрытый другим вводом круг.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";
import { STORE_NFT_CONTRACT } from "./chips-mint-helpers";
import { creditStatuses, creditKey, type CreditStatus } from "./nft-cycle-read";
import { OLD_TRANSFER_NOTE } from "./nft-cycle-credit";
import {
  journalByWallet,
  journalByToken,
  journalByTx,
  type NftInputOpRow,
} from "./nft-input-journal-read";
import { scanWalletOutgoing, scanStoreIncoming, type InputCandidate } from "./nft-input-scan";

export type NftInputView = {
  at: string | null;
  wallet: string;
  contract: string;
  tokenId: string;
  txHash: string;
  title: string;
  /** Выдача состоялась (бокс или фишка) — единственный настоящий критерий. */
  delivered: boolean;
  deliveredLabel: string;
  journalStatus: "started" | "granted" | "failed" | null;
  journalError: string | null;
  /** Квитанция зачтена: если выдачи при этом нет — это и есть сирота. */
  receipt: boolean;
  /** Перевод виден в истории цепочки (а не только в наших таблицах). */
  onChain: boolean;
};

export type SearchKind = "wallet" | "token" | "tx";

/** Кошелёк — с точкой (`alice.tg`), токен — только цифры, остальное — хэш. */
export function detectSearchKind(q: string): SearchKind {
  const s = q.trim();
  if (/^\d+$/.test(s)) return "token";
  if (s.includes(".")) return "wallet";
  return "tx";
}

type ReceiptRow = { wallet: string; tx_hash: string; token_id: string; used_at: string };

async function receipts(where: string): Promise<ReceiptRow[]> {
  const rows = (await mcpExec(
    `SELECT wallet, tx_hash, token_id, used_at FROM yuplink.nft_input_used
      WHERE ${where} ORDER BY used_at DESC LIMIT 100;`,
    { wrapJson: true },
  )) as ReceiptRow[];
  return (rows ?? []).filter((r) => r.token_id);
}

type Draft = Omit<NftInputView, "delivered" | "deliveredLabel">;

function keyOf(tokenId: string, txHash: string): string {
  return `${tokenId}|${txHash}`;
}

function addChain(map: Map<string, Draft>, list: InputCandidate[]): void {
  for (const c of list) {
    const k = keyOf(c.tokenId, c.txHash);
    const prev = map.get(k);
    map.set(k, {
      at: c.atMs ? new Date(c.atMs).toISOString() : (prev?.at ?? null),
      wallet: c.wallet,
      contract: c.contract,
      tokenId: c.tokenId,
      txHash: c.txHash,
      title: c.title || (prev?.title ?? ""),
      journalStatus: prev?.journalStatus ?? null,
      journalError: prev?.journalError ?? null,
      receipt: prev?.receipt ?? false,
      onChain: true,
    });
  }
}

function addJournal(map: Map<string, Draft>, rows: NftInputOpRow[]): void {
  for (const j of rows) {
    const k = keyOf(j.token_id, j.tx_hash);
    const prev = map.get(k);
    map.set(k, {
      at: prev?.at ?? j.created_at,
      wallet: prev?.wallet ?? j.wallet,
      contract: prev?.contract ?? j.contract,
      tokenId: j.token_id,
      txHash: j.tx_hash,
      title: prev?.title ?? "",
      journalStatus: j.status,
      journalError: j.error,
      receipt: prev?.receipt ?? false,
      onChain: prev?.onChain ?? false,
    });
  }
}

function addReceipts(map: Map<string, Draft>, rows: ReceiptRow[]): void {
  for (const r of rows) {
    const k = keyOf(r.token_id, r.tx_hash);
    const prev = map.get(k);
    map.set(k, {
      at: prev?.at ?? r.used_at,
      wallet: prev?.wallet ?? r.wallet,
      contract: prev?.contract ?? STORE_NFT_CONTRACT,
      tokenId: r.token_id,
      txHash: r.tx_hash,
      title: prev?.title ?? "",
      journalStatus: prev?.journalStatus ?? null,
      journalError: prev?.journalError ?? null,
      receipt: true,
      onChain: prev?.onChain ?? false,
    });
  }
}

/** Что круг NFT говорит про этот перевод — человеческими словами. */
function creditLabel(st: CreditStatus | undefined): { delivered: boolean; label: string } {
  if (!st) return { delivered: false, label: "время перевода неизвестно — разобрать руками" };
  if (st.state === "done") return { delivered: true, label: "выдано за этот перевод" };
  if (st.state === "legacy") return { delivered: true, label: "выдано вне кругов (прежним кодом или вручную)" };
  if (st.state === "stale") return { delivered: false, label: "не выдано: круг закрыт другим вводом — разобрать" };
  if (st.state === "old") return { delivered: false, label: `не выдано: ${OLD_TRANSFER_NOTE}` };
  const resuming = st.decision.kind === "already";
  return { delivered: false, label: resuming ? "выдача прервалась — догон доделает" : "выдачи нет" };
}

/** Досыпаем факт выдачи (по кругу NFT) и сортируем свежим вверх. */
async function finish(map: Map<string, Draft>): Promise<NftInputView[]> {
  const drafts = Array.from(map.values());
  const timed = drafts.filter((d) => d.at && d.txHash);
  const statuses = await creditStatuses(
    timed.map((d) => ({
      contract: d.contract,
      tokenId: d.tokenId,
      txHash: d.txHash,
      atMs: Date.parse(d.at as string),
    })),
  );
  return drafts
    .map((d) => {
      const c = creditLabel(d.at && d.txHash ? statuses.get(creditKey(d)) : undefined);
      return { ...d, delivered: c.delivered, deliveredLabel: c.label };
    })
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}

export async function viewByWallet(wallet: string): Promise<NftInputView[]> {
  const map = new Map<string, Draft>();
  const [chain, journal, rec] = await Promise.all([
    // includeFresh: жалоба приходит через минуту после отправки — перевод обязан
    // быть виден сразу, даже если догонять его ещё рано.
    scanWalletOutgoing(wallet, { includeFresh: true }).catch(() => [] as InputCandidate[]),
    journalByWallet(wallet),
    receipts(`wallet=${sqlStr(wallet)}`),
  ]);
  addChain(map, chain);
  addJournal(map, journal);
  addReceipts(map, rec);
  return finish(map);
}

export async function viewByToken(tokenId: string): Promise<NftInputView[]> {
  const map = new Map<string, Draft>();
  const [journal, rec, store] = await Promise.all([
    journalByToken(tokenId),
    receipts(`token_id=${sqlStr(tokenId)}`),
    scanStoreIncoming({ includeFresh: true }).catch(() => [] as InputCandidate[]),
  ]);
  addChain(
    map,
    store.filter((c) => c.tokenId === tokenId),
  );
  addJournal(map, journal);
  addReceipts(map, rec);
  if (map.size === 0) {
    // Следов нет вовсе — всё равно показываем строку с фактом выдачи: владельцу
    // важно отличить «не приходило» от «пришло и выдано».
    map.set(keyOf(tokenId, ""), {
      at: null,
      wallet: "",
      contract: STORE_NFT_CONTRACT,
      tokenId,
      txHash: "",
      title: "",
      journalStatus: null,
      journalError: null,
      receipt: false,
      onChain: false,
    });
  }
  return finish(map);
}

export async function viewByTx(txHash: string): Promise<NftInputView[]> {
  const map = new Map<string, Draft>();
  const [journal, rec, store] = await Promise.all([
    journalByTx(txHash),
    receipts(`tx_hash=${sqlStr(txHash)}`),
    scanStoreIncoming({ includeFresh: true }).catch(() => [] as InputCandidate[]),
  ]);
  addChain(
    map,
    store.filter((c) => c.txHash === txHash),
  );
  addJournal(map, journal);
  addReceipts(map, rec);
  return finish(map);
}

export async function viewBySearch(query: string): Promise<{
  kind: SearchKind;
  query: string;
  rows: NftInputView[];
}> {
  const q = query.trim();
  const kind = detectSearchKind(q);
  const rows =
    kind === "wallet"
      ? await viewByWallet(q)
      : kind === "token"
        ? await viewByToken(q)
        : await viewByTx(q);
  return { kind, query: q, rows };
}
