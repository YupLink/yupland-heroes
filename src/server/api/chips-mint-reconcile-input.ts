// Реконсиляция «NFT-фишка вернулась на склад, а фишку не выдали».
//
// Штатный путь — кнопка «Ввести NFT» в игре (depositNftAsChip/depositManyAsChip).
// Но NFT можно отправить на склад и мимо игры (напрямую из Sendler/кошелька) —
// тогда серверный код не вызывается и фишка не появляется.
//
// Механика общая с пак-догоном и живёт в nft-input-scan → nft-input-recover:
// один скан на оба вида, идемпотентность по факту ВЫДАЧИ (фишка в инвентаре с
// `nftdep:{token}`), а не по отметке квитанции. Отдельная тонкость фишек —
// открытая запись чеканки: пока NFT «на руках», старый след ввода не считается
// выдачей, иначе повторный ввод отбивался бы вечно (потеря пяти фишек 26.08).
//
// Здесь остался переходник ради прежней подписи — на неё ссылается крон.
import { recoverStore } from "./nft-input-recover";

export async function runChipInputOrphanReconcile(): Promise<{
  scanned: number;
  delivered: number;
  skippedAlreadyDone: number;
  skippedPack: number;
  skippedNoMapping: number;
  skippedUnknownUser: number;
  skippedTooOld: number;
  errors: number;
}> {
  const { summary, rows } = await recoverStore({ only: "chip" });
  const unknownUser = rows.filter((r) => r.detail.includes("не наш игрок")).length;
  const tooOld = rows.filter((r) => r.detail.includes("старее эпохи")).length;
  const packs = rows.filter((r) => r.status === "candidate" && r.kind === "pack").length;
  return {
    scanned: summary.scanned,
    delivered: summary.chips,
    skippedAlreadyDone: summary.alreadyDelivered,
    skippedPack: packs,
    skippedNoMapping: Math.max(0, summary.skipped - unknownUser - tooOld),
    skippedUnknownUser: unknownUser,
    skippedTooOld: tooOld,
    errors: summary.failed,
  };
}
