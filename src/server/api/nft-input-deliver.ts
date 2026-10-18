// Выдача за сиротскую NFT (догон): бокс или фишка, ровно один раз.
//
// Замок — круг NFT (nft-cycle.ts): перевод закрывает свой круг один раз, и
// повтор догона, кнопка «Ввести» в ту же секунду или старый перевод из прошлого
// круга выдачи не получат. Прежние замки — квитанция с «перехватом» брошенной
// отметки и «свежее последней чеканки» — именно в углах давали двойные выдачи
// (26.08: чужой старый перевод закрыл свежий вывод) и пропажи.
import { pg } from "../db/pg";
import {
  claimNftInputTx,
  journalStart,
  journalGranted,
  journalFailed,
} from "./chips-mint-deposit-receipt";
import { closeMintedChipForPackSwap } from "./chips-mint-deposit-issue";
import { creditChip, creditPacks, OLD_TRANSFER_NOTE, type Transfer } from "./nft-cycle-credit";
import { cycleGrant } from "./nft-cycle-read";
import type { InputCandidate } from "./nft-input-scan";
import type { Classification } from "./nft-input-classify";

export type DeliverGranted = {
  status: "granted";
  kind: "pack" | "chip";
  detail: string;
  ids: string[];
};

export type DeliverOutcome =
  | DeliverGranted
  | { status: "already"; detail: string }
  | { status: "skipped"; detail: string }
  | { status: "busy"; detail: string }
  | { status: "failed"; detail: string };

/** Одна операция на токен внутри процесса: два прогона в одном инстансе не пересекутся. */
const inFlight = new Map<string, Promise<DeliverOutcome>>();

export async function deliverCandidate(
  c: InputCandidate,
  cls: Classification,
): Promise<DeliverOutcome> {
  const key = `${c.contract}|${c.tokenId}`;
  const running = inFlight.get(key);
  if (running) return running;
  const task = deliverInner(c, cls).finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}

async function deliverInner(c: InputCandidate, cls: Classification): Promise<DeliverOutcome> {
  if (cls.kind === "none") return { status: "skipped", detail: cls.reason };

  // Отправитель должен быть нашим игроком: на склад может прилететь что угодно.
  const user = await pg.users.findOne({ wallet: c.wallet });
  if (!user) return { status: "skipped", detail: `отправитель ${c.wallet} не наш игрок` };

  // Без времени перевода круг не найти, а «сейчас» вместо него могло бы зачесть
  // старый перевод в новом круге — такие разбираются руками.
  if (c.atMs == null || !c.txHash) {
    return { status: "skipped", detail: "у перевода нет времени или хэша — разобрать руками" };
  }
  const transfer = {
    wallet: c.wallet,
    contract: c.contract,
    tokenId: c.tokenId,
    txHash: c.txHash,
    atMs: c.atMs,
    source: "recover",
  };

  await journalStart({ ...transfer, kind: cls.kind });
  // Квитанция — для журнала и самолечения; выдачу стережёт круг.
  await claimNftInputTx(c.wallet, c.txHash, c.tokenId).catch(() => false);

  try {
    if (cls.kind === "pack") {
      const out = await creditPacks(transfer, { packId: cls.packId, count: cls.grantCount });
      if (out.kind !== "granted") return settle(transfer, out);
      // Обмен выведенной фишки на пак — снимаем её с учёта выведенных.
      if (cls.chipSwap) await closeMintedChipForPackSwap(c.contract, c.tokenId, c.wallet);
      await journalGranted({ ...transfer, grantIds: out.grantIds });
      console.log(
        `[nft-input-recover] выдано ${cls.grantCount}× «${cls.packName}» → ${c.wallet} ` +
          `(token ${c.tokenId}, tx ${c.txHash.slice(0, 10)}…)`,
      );
      return {
        status: "granted",
        kind: "pack",
        detail: `${cls.grantCount}× ${cls.packName}`,
        ids: out.grantIds,
      };
    }

    const out = await creditChip(transfer, async () => cls.identity);
    if (out.kind !== "granted") return settle(transfer, out);
    await journalGranted({ ...transfer, grantIds: [out.chipId] });
    console.log(
      `[nft-input-recover] выдана фишка ${out.chipId} (#${out.serial}${out.ownSerial ? ", тот же номер" : ""}) ` +
        `→ ${c.wallet} за NFT ${c.tokenId}`,
    );
    return {
      status: "granted",
      kind: "chip",
      detail: `фишка #${out.serial}${out.ownSerial ? " (тот же номер)" : ""}`,
      ids: [out.chipId],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await journalFailed({ ...transfer, error: msg }).catch(() => {});
    console.warn(`[nft-input-recover] token ${c.tokenId}: выдача сорвалась — ${msg}`);
    return { status: "failed", detail: msg };
  }
}

/**
 * Невыдача тоже закрывает строку журнала: иначе она висит «started», и разбор
 * зависших пересканирует кошелёк месяц подряд.
 */
async function settle(
  t: Transfer,
  out:
    | { kind: "already"; cycleId: string }
    | { kind: "legacy" }
    | { kind: "old" }
    | { kind: "stale"; cycleId: string }
    | { kind: "none"; reason: string },
): Promise<DeliverOutcome> {
  if (out.kind === "already") {
    const got = await cycleGrant(out.cycleId).catch(() => null);
    await journalGranted({ ...t, grantIds: got?.ids ?? [] }).catch(() => {});
    return { status: "already", detail: "уже зачтено" };
  }
  if (out.kind === "legacy") {
    // Перевод зачтён — журнал «выдано», иначе строка failed месяц гоняла бы
    // пересканы кошелька (nft-input-stuck берёт всё, что не granted).
    await journalGranted({ ...t, grantIds: [], keepGranted: true }).catch(() => {});
    return { status: "already", detail: "выдано вне кругов (прежним кодом или вручную)" };
  }
  const detail =
    out.kind === "stale"
      ? "перевод из закрытого круга — уже зачтён другим вводом"
      : out.kind === "old"
        ? OLD_TRANSFER_NOTE
        : out.reason;
  await journalFailed({ ...t, error: detail }).catch(() => {});
  return { status: "skipped", detail };
}
