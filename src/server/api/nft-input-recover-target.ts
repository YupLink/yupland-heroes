// Адресный догон: один игрок или один токен.
//
// Отдельно от общего прогона (nft-input-recover) по двум причинам: сюда ходят
// экран владельца и самолечение при открытии игры, и им нужен не скан ленты
// склада, а короткий путь «вот этот случай».
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";
import { latestCycle } from "@/lib/nftCycle";
import { loadCycles } from "./nft-cycle";
import { recoverCandidates, emptySummary, type RecoverResult } from "./nft-input-recover";
import { scanStoreIncoming, scanWalletOutgoing, type InputCandidate } from "./nft-input-scan";

/** Личная история игрока — путь жалобы и самолечения. */
export async function recoverWallet(
  wallet: string,
  opts?: { dryRun?: boolean; maxAgeMs?: number },
): Promise<RecoverResult> {
  const list = await scanWalletOutgoing(wallet, { maxAgeMs: opts?.maxAgeMs });
  return recoverCandidates(list, { dryRun: opts?.dryRun, max: 30 });
}

/**
 * Один конкретный случай — кнопка «догнать сейчас». Отправителя и квитанцию, если
 * их не передали, достаём из истории склада, а затем из своих квитанций.
 */
export async function recoverToken(
  key: { contract: string; tokenId: string; txHash?: string; wallet?: string },
  opts?: { dryRun?: boolean },
): Promise<RecoverResult> {
  let candidate: InputCandidate | null = null;
  // Тот ли это перевод: номер совпал, а хэш — если его назвали — тоже.
  const same = (c: InputCandidate) =>
    c.contract === key.contract &&
    c.tokenId === key.tokenId &&
    (!key.txHash || c.txHash === key.txHash);
  const fromStore = (await scanStoreIncoming()).find(same);
  if (fromStore) candidate = fromStore;

  if (!candidate && key.wallet) {
    candidate = (await scanWalletOutgoing(key.wallet)).find(same) ?? null;
  }
  if (!candidate) {
    // Своя квитанция даёт кошелёк и хэш, но НЕ время: used_at — момент нажатия
    // «Ввести», он позже перевода и мог бы приклеить старый перевод к более
    // свежему кругу. Время — только из сети, по личной истории отправителя.
    const rows = (await mcpExec(
      `SELECT wallet, tx_hash FROM yuplink.nft_input_used
        WHERE token_id=${sqlStr(key.tokenId)}
          ${key.wallet ? `AND wallet=${sqlStr(key.wallet)}` : ""}
          ${key.txHash ? `AND tx_hash=${sqlStr(key.txHash)}` : ""}
        ORDER BY used_at DESC LIMIT 1;`,
      { wrapJson: true },
    )) as Array<{ wallet: string; tx_hash: string }>;
    const r = rows[0];
    if (r) {
      const onChain =
        r.wallet === key.wallet
          ? null // эту историю уже смотрели выше
          : ((await scanWalletOutgoing(r.wallet, { includeFresh: true })).find(
              (c) => c.contract === key.contract && c.tokenId === key.tokenId && c.txHash === r.tx_hash,
            ) ?? null);
      candidate = onChain ?? {
        contract: key.contract,
        tokenId: key.tokenId,
        txHash: r.tx_hash,
        wallet: r.wallet,
        title: "",
        atMs: null,
      };
    }
  }
  if (!candidate && key.wallet && key.txHash) {
    candidate = {
      contract: key.contract,
      tokenId: key.tokenId,
      txHash: key.txHash,
      wallet: key.wallet,
      title: "",
      atMs: null,
    };
  }
  if (!candidate) {
    const summary = emptySummary();
    return {
      summary,
      rows: [
        {
          contract: key.contract,
          tokenId: key.tokenId,
          txHash: key.txHash ?? "",
          wallet: key.wallet ?? "",
          title: "",
          at: null,
          kind: null,
          plan: "перевод не найден: ни в истории склада, ни в квитанциях",
          status: "skipped",
          detail: "нужен кошелёк отправителя и хэш перевода",
          items: 0,
        },
      ],
    };
  }
  return recoverCandidates([candidate], { dryRun: opts?.dryRun, max: 1 });
}

/**
 * Где сейчас номер — для карточки жалобы. По кругу NFT: последний круг открыт —
 * NFT снаружи и ждёт ввода; закрыт — введена, и за неё выдано.
 */
export async function deliveryStatusFor(
  contract: string,
  tokenId: string,
): Promise<{ delivered: boolean; label: string }> {
  const list = (await loadCycles(contract, [tokenId])).get(tokenId) ?? [];
  const last = latestCycle(list);
  if (!last) return { delivered: false, label: "кругов нет — NFT ещё не вводилась" };
  if (last.closedAt == null) return { delivered: false, label: "NFT снаружи — ждёт ввода" };
  const when = new Date(last.closedAt).toISOString().slice(0, 16);
  if (last.granted === false) return { delivered: false, label: `введена ${when}, выдача прервалась — догон доделает` };
  return { delivered: true, label: `введена ${when}, выдано` };
}
