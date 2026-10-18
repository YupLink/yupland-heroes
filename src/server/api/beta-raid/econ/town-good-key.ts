// Ключ товара ратуши — тот же, что у этого товара в маркете, рюкзаке и складе.
//
// У товара ратуши свой id (tg_…, у каждого города свой) и шаблон справочника
// (refId = cst_…). Ключ собирался из id: продажа огурцов ратуше писалась
// «custom:name:tg_xxvv4a2m31», а их покупка в маркете — «custom:name:зимние
// огурцы». Журнал не сводил покупку с продажей, и турнир «Золото» засчитывал
// всю выручку прибылью (дыра, найдена 06.10.2026); «купил в ратуше А — продал
// в ратушу Б» не сводилось тоже.
//
// Теперь у товара с шаблоном имя — у КАНОНА шаблона (item-alias): под этим
// именем товар лежит в рюкзаке и на складе (market-backpack-write), и под ним
// же пишет маркет (canon-key). У старых товаров без шаблона («Помидор», имя =
// id) ключ прежний (keyFromTownGood).
import type { TownGood } from "@/lib/townConfig";
import { goodKey, keyFromTownGood } from "@/server/api/beta-raid/admin-economy-keys";
import { canonCustomNames } from "@/server/api/beta-raid/econ/canon-key";

export type KeyGood = Pick<TownGood, "id" | "kind" | "refId" | "token">;

/** Шаблон справочника своих товаров, если он у товара есть. */
export function templateOf(g: Pick<TownGood, "kind" | "refId">): string | null {
  return g.kind === "custom" && g.refId?.startsWith("cst_") ? g.refId : null;
}

/**
 * Ключ при известных именах шаблонов (refId → имя канона). Имени нет —
 * прежний ключ по id: строка журнала лучше пропавшей.
 */
export function townGoodKeyWith(g: KeyGood, names: ReadonlyMap<string, string>): string | null {
  const tpl = templateOf(g);
  const name = tpl ? names.get(tpl) : undefined;
  if (name) {
    const key = goodKey("custom", tpl, name, null);
    if (key) return key;
  }
  return keyFromTownGood(g);
}

/** Подпись товара в отчётах: имя шаблона, у старых товаров — их id. */
export function townGoodName(g: KeyGood, names: ReadonlyMap<string, string>): string {
  const tpl = templateOf(g);
  return (tpl && names.get(tpl)) || g.id;
}

/**
 * Имена канонов шаблонов для пачки товаров — одним заходом в справочник
 * (canon-key, минутный кэш; окно лавки его обычно уже прогрело). Сбой
 * справочника — пустая карта, а не бросок: зовут и best-effort хуки журнала.
 */
export async function townGoodNames(goods: readonly KeyGood[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const tpls = [...new Set(goods.map(templateOf).filter((t): t is string => !!t))];
  if (tpls.length === 0) return out;
  const names = await canonCustomNames(tpls.map((ref) => ({ ref })));
  tpls.forEach((tpl, i) => {
    const name = names[i];
    if (name) out.set(tpl, name);
  });
  return out;
}
