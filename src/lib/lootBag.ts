// Мешочки на карте рейда — общий контракт сервера и окна (владелец, 29.09.2026).
//
// Что не влезло в рюкзак — мешочком на клетке. Мешочек и бугорок видно во
// «втором обзоре»: в круге активной зоны тумана (FOG_ACTIVE_RADIUS) на
// разведанных клетках не под куполом. Мешочек открывается как склад: любой
// вплотную забирает в рюкзак и кладёт из рюкзака. Каждая порция живёт 24 часа
// с попадания в мешочек, забирается сначала то, что сгорит раньше; пустой
// мешочек исчезает. С лопатой мешочек закапывают — бугорок сгорает целиком
// через 24 часа после закапывания — и выкапывают обратно.
//
// Таблицы — migrations/bag-01-loot-bags.sql, сервер —
// server/api/beta-raid/loot-bag/, правило целиком — ПРАВИЛА §8.21. Ресурсы
// счёта в мешочке (разборка шахты) — §8.70.
import { FOG_ACTIVE_RADIUS } from "@/lib/raid/fogRadius";
import { isMineV2, type MineV2Resource } from "@/lib/mineV2";

/** Сколько живёт порция с попадания в мешочек; у бугорка — с закапывания. */
export const LOOT_BAG_TTL_HOURS = 24;

/**
 * Ресурс счёта в мешочке (разборка шахты, ПРАВИЛА §8.70): стопка
 * «resource:<вид>» — тот же ключ, что у ресурса на полке склада. Забранное
 * уходит на счёт (res_move), а не в рюкзак; положить ресурс в мешочек нельзя.
 */
export const BAG_RES_PREFIX = "resource:";

export const bagResKey = (res: MineV2Resource): string => `${BAG_RES_PREFIX}${res}`;

/**
 * Артефакт в мешочке (ПРАВИЛА §8.73 п. 4: надетое на проданном в ломбард герое): стопка
 * «art:<id предмета>», одна штука. Забранное — в инвентарь (не в рюкзак), с прежним износом.
 */
export const BAG_ART_PREFIX = "art:";

/** id предмета-артефакта стопки мешочка; не артефакт — null. */
export function bagArtOf(stackKey: string | null | undefined): string | null {
  const key = String(stackKey ?? "");
  return key.startsWith(BAG_ART_PREFIX) && key.length > BAG_ART_PREFIX.length
    ? key.slice(BAG_ART_PREFIX.length)
    : null;
}

/** Вид ресурса стопки мешочка; не ресурс (или чужой ресурс) — null. */
export function bagResOf(stackKey: string | null | undefined): MineV2Resource | null {
  const key = String(stackKey ?? "");
  if (!key.startsWith(BAG_RES_PREFIX)) return null;
  const res = key.slice(BAG_RES_PREFIX.length);
  return isMineV2(res) ? res : null;
}

/** Ресурс в мешочке не сгорает: срок — десять лет (как бугорок сундука, lib/plainChest). */
export const LOOT_BAG_KEEP_HOURS = 87_600;

/** Срок дальше года — порция не сгорает: «осталось N ч» у неё не пишем. */
export const bagNeverBurns = (leftMs: number): boolean => Number(leftMs) > 365 * 24 * 3_600_000;

/** Мешочки видно во «втором обзоре» — в круге активной зоны тумана. */
export const LOOT_BAG_SEE = FOG_ACTIVE_RADIUS;

/**
 * Энергия за одно дело лопатой (§8.23, §8.24): закопать, выкопать, копать. Здесь,
 * а не у сервера (loot-bag/bag-dig-pay): цену показывает и плашка маршрута.
 */
export const DIG_ENERGY = 2;

/** Мешочек или бугорок во «втором обзоре» — строка слоя карты. */
export type LootBagSpot = {
  id: string;
  q: number;
  r: number;
  buried: boolean;
  /** Сколько жить последней порции, мс — на момент ответа сервера. */
  leftMs: number;
  /** Закопал я (02.10): виден с любого расстояния, вокруг — первый обзор. */
  mine?: boolean;
  /** Рыба, всплывшая от красного динамита (30.10.2026): тот же мешочек, рисуется рыбой. */
  fish?: true;
};

/**
 * Клетка слоя: сколько там мешочков и бугорков и закопаны ли все; fish — всё, что
 * лежит сверху (не закопано), — рыба: рисуем рыбу, а не мешочек.
 */
export type LootBagCell = { n: number; buried: boolean; fish?: true };
/** Слой карты: «q,r» → клетка. */
export type LootBagMarks = Record<string, LootBagCell>;

/** Позиция мешочка — все живые порции одного вида (у бугорка не видно). */
export type LootBagItem = {
  stackKey: string;
  kind: string;
  refId: string | null;
  name: string;
  image: string | null;
  count: number;
  /** До ближайшего сгорания порции этого вида, мс — на момент ответа. */
  leftMs: number;
  /** Артефакт (art:<id>) зачарован, % (§8.87); нет поля — нет. */
  enchantPct?: number;
};

/** Мешочек в окне: leftMs — до сгорания последней порции (бугорка — целиком). */
export type LootBagView = {
  id: string;
  buried: boolean;
  leftMs: number;
  items: LootBagItem[];
  /**
   * Мой вход в мешочек жив (29.09, ПРАВИЛА §8.23): содержимое приходит только
   * тогда. Нет поля (ответ прошлой версии) — как прежде, содержимое видно.
   */
  open?: boolean;
  /** Цена «Открыть», энергия. */
  price?: number;
  /** Рыба от красного динамита (30.10.2026): окно зовёт её рыбой. */
  fish?: boolean;
  /** Находка лопатой (31.10.2026): «Открыть» говорит «Выкопано: …». */
  dig?: boolean;
};

/** Окно клетки: все мешочки и бугорки на ней и есть ли у героя лопата. */
export type LootBagCellView = {
  q: number;
  r: number;
  shovel: boolean;
  bags: LootBagView[];
};

/** Ответ «забрать»: сколько чего легло в рюкзак (сумку зелий) или на счёт. */
export type LootBagTaken = {
  taken: Array<{ stackKey: string; qty: number }>;
  /** «Забрать всё» унесло не всё: что осталось в мешочке (имя — как у позиции). */
  left?: Array<{ stackKey: string; name: string; qty: number }>;
};

/** Ответ «положить»: сколько ушло из рюкзака в мешочек. */
export type LootBagPut = { qty: number };

export const bagCellKey = (q: number, r: number): string => `${q},${r}`;

/**
 * Слой карты из списка: один значок на клетку. Мешочек сверху бугорка —
 * значит, на клетке есть что забрать без лопаты; число — если их больше одного.
 */
export function bagMarksOf(spots: readonly LootBagSpot[] | undefined): LootBagMarks {
  const out: LootBagMarks = {};
  const top = new Map<string, { fish: number; bag: number }>();
  for (const s of Array.isArray(spots) ? spots : []) {
    const key = bagCellKey(Number(s.q), Number(s.r));
    const cur = out[key];
    out[key] = { n: (cur?.n ?? 0) + 1, buried: (cur?.buried ?? true) && s.buried === true };
    if (s.buried === true) continue;
    const t = top.get(key) ?? { fish: 0, bag: 0 };
    if (s.fish === true) t.fish += 1;
    else t.bag += 1;
    top.set(key, t);
  }
  for (const [key, t] of top) if (t.fish > 0 && t.bag === 0) out[key].fish = true;
  return out;
}

/**
 * Тап по клетке берёт корабль, а не мешочек: корабль важнее (окно посадки). Кроме рыбы
 * от красного динамита под моим кораблём — я в экипаже, стою на этой клетке, и иначе
 * рыбу с борта не открыть (30.10.2026).
 */
export const shipTakesTap = (
  cell: LootBagCell | undefined,
  ship: { mine: boolean } | undefined,
): boolean => !!ship && !(ship.mine && cell?.fish === true);

/**
 * Мешочки и бугорки, не накрытые декором. Дерево, выросшее поверх (дополнение
 * №5 владельца, 29.09), перекрывает их до рубки: не рисуем и тап не ловим — он
 * уходит декору. decorAt — живая карта клиента (рубка и респавн приходят
 * дельтой), поэтому после рубки мешочек виден сразу, без F5.
 */
export function notUnderDecor<T extends { q: number; r: number }>(
  spots: readonly T[],
  decorAt: (q: number, r: number) => boolean,
): T[] {
  return spots.filter((s) => !decorAt(Number(s.q), Number(s.r)));
}

const MIN_MS = 60_000;

/**
 * Остаток срока целыми часами и минутами, ВНИЗ. leftMs — с сервера на момент
 * ответа, gotAt — когда ответ пришёл (часы телефона), now — сейчас. null —
 * срок вышел.
 */
export function bagTimeLeft(
  leftMs: number,
  gotAt: number,
  now: number,
): { h: number; m: number } | null {
  const left = Number(leftMs) - Math.max(0, now - gotAt);
  if (!(left > 0)) return null;
  const min = Math.floor(left / MIN_MS);
  return { h: Math.floor(min / 60), m: min % 60 };
}
