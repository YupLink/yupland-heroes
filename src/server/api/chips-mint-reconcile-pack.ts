// Крон-догон: пак-NFT пришла на склад мимо игры — выдаём бокс задним числом.
//
// Вся механика переехала в общие модули (nft-input-scan → nft-input-recover):
// скан стал шире (все контракты ввода, окно давности, служебные кошельки мимо),
// а главное — сироты теперь ищутся по факту ВЫДАЧИ, а не по отметке квитанции.
// Прежний код вычитал из кандидатов токены с отметкой в nft_input_used, то есть
// чинил ровно те случаи, где ничего не ломалось, и проходил мимо настоящих:
// отметка встала, бокс не выдался.
//
// Здесь остался переходник ради прежней подписи — на неё ссылается крон и
// ре-экспорты (chips.ts, chips-mint.ts, chips-mint-deposit-list.ts).
import { recoverStore } from "./nft-input-recover";

export async function runNftInputOrphanReconcile(): Promise<{
  scanned: number;
  delivered: number;
  boxes: number;
  skippedAlreadyDone: number;
  skippedNoMapping: number;
  skippedUnknownUser: number;
}> {
  const { summary, rows } = await recoverStore({ only: "pack" });
  const boxes = rows
    .filter((r) => r.status === "granted" && r.kind === "pack")
    .reduce((s, r) => s + r.items, 0);
  const unknownUser = rows.filter((r) => r.detail.includes("не наш игрок")).length;
  return {
    scanned: summary.scanned,
    delivered: summary.packs,
    boxes,
    skippedAlreadyDone: summary.alreadyDelivered,
    skippedNoMapping: Math.max(0, summary.skipped - unknownUser),
    skippedUnknownUser: unknownUser,
  };
}
