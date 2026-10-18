import { normalizePackQty } from "../random";

/**
 * Выдача пак-награды за один клейм.
 *
 * Ярус kind='pack' может отдавать НЕСКОЛЬКО паков за клейм (`packQty`) —
 * админ задаёт число в форме дропа вместо создания N одинаковых дропов.
 * Пустой/битый packQty = 1 (поведение до появления поля).
 *
 * Возвращает СКОЛЬКО паков реально выдано. Если 0 — caller не должен
 * писать redemption и списывать билет: юзер ничего не получил.
 * Частичная выдача (упали не на первом) считается успехом — паки уже в
 * инвентаре, откатывать нечего.
 */
export async function grantPacksForTier(opts: {
  wallet: string;
  packId: string;
  qty?: number;
  sourceRef: string;
  logTag: string;
}): Promise<number> {
  const qty = normalizePackQty(opts.qty);
  const { grantPackToUser } = await import("./packs");
  let granted = 0;
  for (let i = 0; i < qty; i++) {
    try {
      await grantPackToUser({
        wallet: opts.wallet,
        packId: opts.packId,
        source: "drop",
        sourceRef: opts.sourceRef,
      });
      granted++;
    } catch (err) {
      console.warn(`[${opts.logTag}] grantPack failed (${granted}/${qty} выдано):`, err);
      break;
    }
  }
  return granted;
}
