// Энергия за «Закопать» и «Выкопать» (владелец, 29.09.2026; ПРАВИЛА §8.23):
// 2 энергии — одинаково у мешочка, обычного и магического сундука, плюс износ
// лопаты. Порядок у всех трёх: проверки → энергия → износ → переворот; не
// перевернулось — энергия и износ назад. Списание и возврат — как у рубки
// декора (payForHit + refund), причина в суточном агрегате — «dig».
import { payForHit, type HitPayment } from "@/server/api/beta-raid/encounter-pay";
import { DIG_ENERGY } from "@/lib/lootBag";

/** Сколько энергии стоит закопать, выкопать или копать (число — в lib/lootBag). */
export { DIG_ENERGY };

/** Снять энергию за переворот. Нехватка — ключом «Нужно N энергии». */
export async function payDig(wallet: string): Promise<HitPayment> {
  try {
    return await payForHit(wallet, DIG_ENERGY, "dig");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "");
    if (/not_enough_energy|Нужно \d+ энергии/.test(msg)) {
      throw new Error(`braid.need_energy|${JSON.stringify({ n: DIG_ENERGY })}`);
    }
    throw e;
  }
}
