// Подарок «босс» (вид boss): охранник, снятый с DARAI-шахты (владелец,
// 22.10.2026: «боссы с охраны должны вернуться и забираться как подарок — без
// срока годности»; migrations/minebag-02). Кладём в рюкзак ВЫБРАННОГО героя
// тем же предметом, что из лавки и из «Забрать охрану»: стопка boss:<шаблон>,
// вид boss — такого босса снова можно поставить охраной (не на DARAI-шахту).
//
// Нет героя или места — бытовой отказ (market.need_hero / market.backpack_need),
// gifts.ts возвращает строку в pending, подарок ждёт (он бессрочный). Ключ
// повтора — id подарка (raid_backpack_op `bp:gift:<id>` в depositToBackpack):
// слепой повтор моста и повторный клейм после обрыва второго босса не положат.
import type { GiftRow } from "./gifts-deliver";

/** Ключ выдачи подарка в рюкзак: один на подарок, стабилен между попытками. */
export const bossGiftNonce = (giftId: string): string => `gift:${giftId}`;

export async function deliverBossGift(wallet: string, gift: GiftRow): Promise<void> {
  const templateId = (gift.ref_id ?? "").trim();
  if (!templateId) throw new Error("У подарка не указан босс");
  const { resolveBackpack, depositToBackpack } = await import("./beta-raid/market-backpack");
  const bp = await resolveBackpack(wallet);
  if (!bp) throw new Error("market.need_hero");
  await depositToBackpack({
    heroId: bp.heroId,
    account: gift.account_id,
    item: {
      kind: "boss",
      refId: templateId,
      id: `boss:${templateId}`,
      name: (gift.title ?? "").trim() || templateId,
      image: gift.image,
    },
    qty: Math.max(1, Math.floor(Number(gift.amount) || 1)),
    nonce: bossGiftNonce(gift.id),
    capacity: bp.capacity,
    potionCapacity: bp.potionCapacity,
  });
}
