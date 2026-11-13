// Место в рюкзаке для сделки «плачу из рюкзака — получаю в рюкзак». Правило
// владельца 23.10: «если у меня одна ячейка, но этот ресурс я трачу — должно
// давать купить». Чистый модуль: одной формулой судят сервер (предпроверка до
// денег — assertBackpackRoomFor) и клиент (кнопка «Макс» в лавке).
//
// Считаем в порядке самой сделки: сначала оплата снимается со стопок
// (опустевшая освобождает ячейку, частичная — по ceil(count / CELL_SIZE)), потом
// выдача кладёт товар. Рюкзак после выдачи — не больше max(ёмкость, занято
// после оплаты): ровно то, что увидит атомарная выдача (depositToBackpack) —
// она идёт уже после списания. Сумка зелий — строго не больше ёмкости.
// Без оплаты из рюкзака формула совпадает с прежней «до сделки + прирост».
import type { MarketPriceResource } from "@/lib/marketItem";
import { stackCells } from "./backpackCells";
import { potionBagFit, type BagCells } from "./potionBag";

/** Сколько единиц вида stackKey кладём или снимаем. */
export type KeyQty = { stackKey: string; qty: number };

/** Стопка рюкзака или сумки зелий: ключ, сколько лежит, зелье ли. */
export type BagStack = { stackKey: string; count: number; potion?: boolean };

/** Строка оплаты сделки: вид, шаблон и сколько всего уходит. */
export type PayLine = { res: MarketPriceResource; token: string | null; amount: number };

/** Предметные цены: со стопки рюкзака или штучно из инвентаря (market-money.spend). */
const ITEM_PRICE: ReadonlySet<MarketPriceResource> = new Set([
  "pack",
  "hero",
  "art",
  "boss",
  "custom",
]);

/** Цена снимается штучно из инвентаря (артефакт, «любой герой редкости»), не с рюкзака. */
export type FromInventory = (res: MarketPriceResource, token: string) => boolean;

/** Обе цены позиции витрины за qty единиц — строками оплаты. */
export function priceLines(
  it: {
    priceResource: MarketPriceResource;
    priceToken: string | null;
    priceAmount: number;
    price2Resource: MarketPriceResource | null;
    price2Token: string | null;
    price2Amount: number | null;
    priceMore?: ReadonlyArray<{
      resource: MarketPriceResource;
      token: string | null;
      amount: number;
    }> | null;
  },
  qty: number,
): PayLine[] {
  const out: PayLine[] = [
    { res: it.priceResource, token: it.priceToken, amount: it.priceAmount * qty },
  ];
  if (it.price2Resource && it.price2Amount) {
    out.push({ res: it.price2Resource, token: it.price2Token, amount: it.price2Amount * qty });
  }
  // Ещё ингредиенты (до трёх; lib/marketPrices) — платят и ими.
  for (const l of it.priceMore ?? []) {
    if (l.amount > 0) out.push({ res: l.resource, token: l.token, amount: l.amount * qty });
  }
  return out;
}

/**
 * Только те строки оплаты, что уйдут со стопок рюкзака: предметная цена с
 * шаблоном (без него spend не платит вовсе), кроме штучных из инвентаря —
 * их отличает вызывающий (сервер — market-inv-pay, клиент — свои регулярки).
 */
export function backpackPaid(lines: readonly PayLine[], fromInventory: FromInventory): PayLine[] {
  return lines.filter(
    (l) => l.amount > 0 && !!l.token && ITEM_PRICE.has(l.res) && !fromInventory(l.res, l.token),
  );
}

/** Сумма по ключу; ноль, минус и мусор места не меняют. */
function sumByKey(list: readonly KeyQty[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of list) {
    if (!(w.qty > 0) || !Number.isFinite(w.qty)) continue;
    m.set(w.stackKey, (m.get(w.stackKey) ?? 0) + w.qty);
  }
  return m;
}

/**
 * Сколько останется в стопке после списания paid. Списание режет до тысячных
 * (takeFromBackpackStack), и остаток считаем так же: иначе 0,30000000000000004
 * у нас и 0,3 в базе разошлись бы на целую ячейку.
 */
const leftAfter = (cur: number, paid: number): number =>
  Math.max(0, cur - Math.round(paid * 1000) / 1000);

/**
 * Ключ отказа «нужно N яч., свободно M» (market.backpack_need /
 * market.potion_bag_need) или null — сделка влезает.
 *
 * stacks — ВЕСЬ рюкзак и сумка героя сейчас (занятое считается по всем
 * стопкам). want — что выдача положит, pay — что оплата снимет со стопок этого
 * же героя в этой же сделке. Один и тот же вид в обоих списках (меняю X на X)
 * считается одной стопкой: сначала минус, потом плюс. isPotion — галочка
 * «зелье» у вида, которого в рюкзаке ещё нет.
 */
export function tradeRoomError(o: {
  stacks: readonly BagStack[];
  want: readonly KeyQty[];
  pay?: readonly KeyQty[];
  capacity: number;
  potionCapacity: number;
  isPotion?: (stackKey: string) => boolean;
}): string | null {
  const need = sumByKey(o.want);
  if (need.size === 0) return null;
  const paid = sumByKey(o.pay ?? []);
  const have = new Map<string, BagStack>();
  for (const s of o.stacks) if (s.count > 0) have.set(s.stackKey, s);
  const potionOf = (k: string): boolean => have.get(k)?.potion ?? o.isPotion?.(k) ?? false;

  // mid — после оплаты, after — после оплаты и выдачи.
  const mid: BagCells = { itemCells: 0, potionCells: 0 };
  const after: BagCells = { itemCells: 0, potionCells: 0 };
  for (const k of new Set([...have.keys(), ...need.keys()])) {
    const left = leftAfter(have.get(k)?.count ?? 0, paid.get(k) ?? 0);
    const cell = potionOf(k) ? "potionCells" : "itemCells";
    mid[cell] += stackCells(left);
    after[cell] += stackCells(left + (need.get(k) ?? 0));
  }

  // Сумка — строго: зелья в рюкзак не переливаются, переполненная не берёт и долив.
  if ([...need.keys()].some(potionOf)) {
    const bag = potionBagFit({
      before: mid.potionCells,
      after: after.potionCells,
      capacity: o.potionCapacity,
    });
    if (!bag.fits) return `market.potion_bag_need:${bag.need}:${bag.free}`;
  }
  // Рюкзак бывает НАД ёмкостью (склад, снятый артефакт): запрещены лишь НОВЫЕ
  // ячейки сверх max(ёмкость, занято после оплаты).
  if (after.itemCells <= Math.max(o.capacity, mid.itemCells)) return null;
  const free = Math.max(0, o.capacity - mid.itemCells);
  return `market.backpack_need:${after.itemCells - mid.itemCells}:${free}`;
}

/**
 * Наибольшее целое u ≤ upTo, при котором сделка на u единиц влезает (fits).
 * Перебор сверху: с оплатой из рюкзака место не монотонно по u, а u ≤ 99.
 */
export function maxFitUnits(upTo: number, fits: (u: number) => boolean): number {
  for (let u = Math.floor(Math.max(0, upTo)); u > 0; u--) if (fits(u)) return u;
  return 0;
}
