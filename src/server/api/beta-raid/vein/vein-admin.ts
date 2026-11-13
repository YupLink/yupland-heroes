// Товар «Жила» в лавке (lib/veinPlace): проверка позиции при сохранении и перед
// покупкой. Цену и «Клеток в пачке» задаёт админ в той же форме, что у любого
// товара лавки (MarketItemForm), вид — выбором из двух (MarketGoodFields).
//
//  · вид — золото или алмазы (ref позиции = raid_map_vein.kind);
//  · позиция — только витрина покупки; имя — имя вида (по нему стопка в
//    рюкзаке), картинка — своя, если админ задал замену, иначе та же, что на карте;
//  · пачка — целое число клеток, не меньше одной.
// Лавка — любая, в любом мире: жила — товар, как земля, только без привязки к миру.
import { VEIN_IMAGE, VEIN_KIND, VEIN_NAME_RU, isVeinKind } from "@/lib/veinPlace";

/** Позиция формы — ровно то, что читает проверка. */
type VeinGoodInput = {
  kind: string;
  side: string;
  refId: string | null;
  giveAmount: number;
  name: string;
  image: string | null;
};

/**
 * Позиция-жила: отказ админу до записи, если её нельзя исполнить; иначе имя
 * (и картинка, если своей нет) — от вида. Прочие виды товара не трогает.
 */
export function applyVeinGood(data: VeinGoodInput): void {
  if (data.kind !== VEIN_KIND) return;
  if (data.side !== "buy") throw new Error("Жила ставится только в витрину покупки");
  if (!Number.isInteger(data.giveAmount) || data.giveAmount < 1) {
    throw new Error("Клеток в пачке — целое число, не меньше 1");
  }
  const kind = data.refId;
  if (!isVeinKind(kind)) throw new Error("Выбери вид жилы: золото или алмазы");
  data.name = VEIN_NAME_RU[kind];
  data.image = data.image || VEIN_IMAGE[kind];
}

/** Покупка жилы — до денег: у позиции настоящий вид (старую строку могли испортить руками). */
export function assertVeinForSale(refId: string | null): void {
  if (!isVeinKind(refId)) throw new Error("market.bad_item");
}
