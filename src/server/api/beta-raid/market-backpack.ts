// Рюкзак и сумка зелий ВЫБРАННОГО героя: чтение героя и проверка места.
//
// Владелец — hero_instance.id выбранного героя (он всегда «разбужен»,
// selected_at IS NOT NULL, значит его строка уже есть). Нет выбранного героя →
// рюкзака нет (market.need_hero). Хранение — стек по ВИДУ товара:
//   stack_key = kind ':' COALESCE(ref_id, item_id)
// art/boss стакаются по шаблону, custom — по id товара витрины. Ячейка вмещает
// CELL_SIZE единиц; занятые ячейки стека = ceil(count / CELL_SIZE).
//
// Зелья (товар с галочкой is_potion) лежат в той же таблице, но живут ТОЛЬКО в
// СУМКЕ ЗЕЛИЙ (правило владельца 29.09): в рюкзак не переливаются, рюкзак
// считает лишь обычные товары (см. potion-bag.ts, lib/hero/potionBag.ts).
//
// Сама запись (положить/забрать/вернуть) и ключ стека живут в
// market-backpack-write.ts — разделено ради лимита ≤250 строк. Здесь же они
// переизданы, чтобы вызывающим не пришлось знать про два модуля.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { loadSelectedHero, type LoadedHero } from "./hero-load";
import { normalizeHeroRarity, type HeroRarity } from "@/lib/hero/heroSlots";
import { heroAlchemy, heroTrade } from "@/lib/hero/heroExtraStats";
import { backpackCapacity } from "@/lib/hero/backpackCells";
import { potionBagCapacity } from "@/lib/hero/potionBag";
import { backpackPaid, tradeRoomError, type KeyQty, type PayLine } from "@/lib/hero/backpackTrade";
import { canonStackKey } from "./item-alias";
import { paysFromInventory } from "./market-inv-pay";
import type { BoostConfig, HeroBoosts } from "@/lib/hero/boost";
import { loadBuffsFor } from "./hero-buff";
import { IS_POTION_SQL, POTION_JOIN, potionKeysOf } from "./potion-bag";

export {
  stackKeyFor,
  depositToBackpack,
  takeFromBackpackStack,
  returnToBackpackStack,
} from "./market-backpack-write";

/** Ёмкости героя: рюкзак и сумка зелий. Этого хватает любой проверке места. */
export type BagCaps = { heroId: string; capacity: number; potionCapacity: number };

/** Выбранный герой глазами рюкзака: id владельца + всё для расчёта ёмкости. */
export type BackpackHero = BagCaps & {
  heroName: string;
  spec: string | null;
  rarity: HeroRarity;
  trade: number;
  alchemy: number;
};

/** Одна ячейка-стек: вид товара, сколько единиц и сколько ячеек занял. */
export type BackpackStack = {
  stackKey: string;
  kind: string;
  name: string;
  image: string | null;
  count: number;
  cells: number;
  /** Товар-буст: что даст герою. null — обычный товар, и о бустах молчим. */
  boost?: BoostConfig | null;
  /** Зелье (галочка у товара): лежит в сумке зелий, а не в рюкзаке. */
  potion: boolean;
  /** Штук собрано (не больше count; stack-origin): только их можно положить в сундук. */
  collected: number;
  /** Магический сундук (галочка у товара): его можно поставить на карту. */
  chest: boolean;
  /** Обычный сундук (галочка «Сундук», 29.09): ставится на свою или соседнюю клетку. */
  plainChest?: boolean;
  /** Лопата (галочка у товара): закопать и выкопать мешочек или сундук. */
  shovel?: boolean;
  /** Удочка (галочка у товара, §8.35): рыбачить у воды. */
  rod?: boolean;
  /** Карта (галочка у товара, §8.32): целая штука открывает карту мира. */
  map?: boolean;
  /** Бинокль (08.11): «Применить» — обзор 40 клеток на 3 минуты за штуку. */
  binocular?: boolean;
  /** Лестница (08.11): «Применить» — перелезть через непроходимую клетку. */
  ladder?: boolean;
  /**
   * Прочность текущей штуки инструмента, % (lib/raid/toolWear). null/нет —
   * не инструмент с износом (старый ответ поля не знает — значка нет).
   */
  durability?: number | null;
  /** Инструмент (топор, кирка, лопата, удочка): его можно взять в руки (§8.24). */
  tool?: boolean;
};

/**
 * Рюкзак и сумка целиком. Нет героя → heroId=null, ёмкости и занятое=0.
 * occupied — рюкзак (только обычные товары), potionOccupied — сумка (все
 * зелья; у переполненной бывает больше potionCapacity).
 */
export type BackpackView = {
  heroId: string | null;
  heroName: string | null;
  spec: string | null;
  rarity: HeroRarity;
  trade: number;
  alchemy: number;
  capacity: number;
  occupied: number;
  potionCapacity: number;
  potionOccupied: number;
  stacks: BackpackStack[];
  /** Основной инструмент героя сейчас — ключ стопки (§8.24); нет поля — старый ответ. */
  mainTool?: string | null;
};

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Выбранный герой + его торговля/алхимия и ёмкости. null — героя нет.
 * Временные баффы Торговли/Алхимии (зелья, заклинания) читаются тем же рейсом:
 * ёмкость обязана совпасть с тем, что игрок видит в окне героя.
 */
export async function resolveBackpack(wallet: string): Promise<BackpackHero | null> {
  const [hero, buffs] = await Promise.all([
    loadSelectedHero(wallet).catch(() => null),
    loadBuffsFor(wallet),
  ]);
  if (!hero) return null;
  return backpackHeroOf(hero, buffs);
}

/**
 * Same capacity rules for selected and explicitly viewed heroes.
 * Бафф кончился — ёмкость падает, но ничего не пропадает: рюкзак над ёмкостью
 * доливает свои ячейки (assertBackpackRoomFor), а зелья сверх сумки остаются в
 * ней — новых сумка не примет, пока их не станет не больше ёмкости.
 */
export function backpackHeroOf(hero: LoadedHero, buffs?: HeroBoosts): BackpackHero {
  const rarity = normalizeHeroRarity(hero.rarity);
  // Герой целиком: с редкостью и очками — «+1 за уровень» до обычного потолка,
  // сверх него только вложенные очки (повышенные уровни, 02.10.2026).
  const trade = heroTrade(hero) + Math.max(0, Number(buffs?.trade) || 0);
  const alchemy = heroAlchemy(hero) + Math.max(0, Number(buffs?.alchemy) || 0);
  return {
    heroId: hero.heroId,
    heroName: hero.name,
    spec: hero.spec,
    rarity,
    trade,
    alchemy,
    capacity: backpackCapacity({ spec: hero.spec, rarity, trade }),
    potionCapacity: potionBagCapacity({ rarity, alchemy }),
  };
}

/**
 * Хватит ли места ещё под qty единиц вида stackKey: зелью — в сумке, прочему —
 * в рюкзаке. Полно → бросок; при выдаче (market-deliver) — страховка от гонки
 * уже после списания. Предпроверка ДО денег с ценой — assertTradeRoom.
 */
export async function assertBackpackRoom(
  bp: BagCaps,
  stackKey: string,
  qty: number,
): Promise<void> {
  await assertBackpackRoomFor(bp, [{ stackKey, qty }]);
}

/**
 * То же, но сразу на НЕСКОЛЬКО видов. Плавильня платит двумя выплатами (слитки
 * железа и золота), и раздельные проверки обе проходили: каждая мерила место
 * так, будто соседней выплаты нет.
 *
 * `pay` — что ЭТА ЖЕ сделка снимет со стопок этого героя ДО выдачи (оплата
 * товаром из рюкзака). Рюкзак судим после списания: стопка, ушедшая в ноль,
 * освобождает ячейку (правило владельца 23.10, lib/hero/backpackTrade). Звать
 * с pay — только ДО списания: после него стопки уже честные, и pay посчитал бы
 * оплату дважды.
 *
 * Хранилищ два, и судит каждое своё: зелья — сумка (строго), обычные товары —
 * рюкзак. Бросок содержит числа: игроку надо знать, сколько освободить.
 */
export async function assertBackpackRoomFor(
  bp: BagCaps,
  want: KeyQty[],
  pay: KeyQty[] = [],
): Promise<void> {
  const keys = new Set(want.filter((w) => w.qty > 0).map((w) => w.stackKey));
  if (keys.size === 0) return;

  // Берём ВЕСЬ рюкзак, а не только нужные виды: занятое считается по всем
  // стекам. Пустой ответ базы не глотаем: «не смогли спросить» и «рюкзак пуст»
  // — разные вещи.
  const rows = (await mcpExec(
    `SELECT b.stack_key AS "stackKey", b.count, ${IS_POTION_SQL} AS potion
       FROM yuplink.raid_hero_backpack b
       ${POTION_JOIN}
      WHERE b.hero_id = ${sqlStr(bp.heroId)} AND b.count > 0;`,
    { wrapJson: true },
  )) as Array<{ stackKey: string; count: number | string; potion: boolean }>;

  const stacks = (rows ?? []).map((r) => ({
    stackKey: r.stackKey,
    count: num(r.count),
    potion: r.potion === true,
  }));
  const fresh = await potionKeysOf([...keys].filter((k) => !stacks.some((s) => s.stackKey === k)));
  const why = tradeRoomError({
    stacks,
    want,
    pay,
    capacity: bp.capacity,
    potionCapacity: bp.potionCapacity,
    isPotion: (k) => fresh.has(k),
  });
  if (why) throw new Error(why);
}

/**
 * Предпроверка сделки, которая платит товаром из рюкзака: lines — ВСЕ строки
 * оплаты (не рюкзачные отсеются сами), ключи — к канону, как их снимет
 * market-money.spend. Только ДО списания (см. assertBackpackRoomFor).
 */
export async function assertTradeRoom(
  bp: BagCaps,
  want: KeyQty[],
  lines: readonly PayLine[],
): Promise<void> {
  const pay = await Promise.all(
    backpackPaid(lines, paysFromInventory).map(async (l) => ({
      stackKey: await canonStackKey(l.res, l.token),
      qty: l.amount,
    })),
  );
  await assertBackpackRoomFor(bp, want, pay);
}
