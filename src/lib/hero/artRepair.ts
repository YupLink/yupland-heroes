// Ремонт артефактов в кузнице (владелец, 23.10.2026; ПРАВИЛА §8.72): «Во-первых,
// это кузница. Во-вторых, удобно: чтобы можно было починить все артефакты —
// такая кнопка. И чтобы можно было выбрать, какие именно починить, и они разом
// чинились. Стоимость: Common-артефакт 5 золота, Rare 20 золота, Epic 50 золота,
// Legendary — 1 алмаз. … Починить можно любой артефакт, не только в ноль битый».
//
// Ремонт — износ в ноль целиком (user_game_item.wear = 0, lib/hero/artWear.ts);
// цена от величины износа НЕ зависит, только от редкости шаблона
// (mystic_item_template.rarity — та же колонка, по которой считается срок службы).
// Незнакомая редкость — как обычный, как и у срока службы (artLifeOf).
//
// Таблица цен одна: её же сервер передаёт функции базы art_repair
// (migrations/art-repair-01.sql), а база считает сумму по редкостям строк под
// замком — клиентской сумме не верим, она лишь сверка «платишь показанное».

/** Шаблон постройки «Кузница» на карте рейда — окно ремонта у его клеток. */
export const FORGE_TEMPLATE_ID = "building_XOq7FN2NdQ";

/**
 * Ремонт открыт всем: строка settings с этим ключом и значением true. Нет
 * строки — видят и чинят только админы (до слова владельца «запускаем»).
 */
export const ART_REPAIR_OPEN_KEY = "art_repair_open";

/** Цена ремонта одного артефакта по редкости: золото и алмазы. */
export type RepairCost = { gold: number; diamonds: number };

export const ART_REPAIR_PRICE = {
  common: { gold: 5, diamonds: 0 },
  rare: { gold: 20, diamonds: 0 },
  epic: { gold: 50, diamonds: 0 },
  legendary: { gold: 0, diamonds: 1 },
} as const satisfies Record<string, RepairCost>;

export type RepairRarity = keyof typeof ART_REPAIR_PRICE;

/** Редкость для цены: регистр и пробелы не важны, незнакомая — обычная. */
export function repairRarity(rarity: unknown): RepairRarity {
  const r = String(rarity ?? "")
    .trim()
    .toLowerCase();
  return r in ART_REPAIR_PRICE ? (r as RepairRarity) : "common";
}

/** Цена ремонта одного артефакта (износ → 0) — по редкости, не по износу. */
export function artRepairPrice(rarity: unknown): RepairCost {
  const p = ART_REPAIR_PRICE[repairRarity(rarity)];
  return { gold: p.gold, diamonds: p.diamonds };
}

/** Сумма за набор артефактов: золото и алмазы отдельно. */
export function repairTotal(items: ReadonlyArray<{ rarity: unknown }>): RepairCost {
  let gold = 0;
  let diamonds = 0;
  for (const it of items) {
    const p = artRepairPrice(it.rarity);
    gold += p.gold;
    diamonds += p.diamonds;
  }
  return { gold, diamonds };
}

/** Чего не хватает на ремонт: по каждому ресурсу отдельно. */
export function repairShort(
  total: RepairCost,
  have: { gold?: number | null; diamonds?: number | null } | null | undefined,
): { gold: boolean; diamonds: boolean } {
  return {
    gold: total.gold > Number(have?.gold ?? 0),
    diamonds: total.diamonds > Number(have?.diamonds ?? 0),
  };
}

/** Строка окна ремонта: изношенный артефакт аккаунта. */
export type ArtRepairItem = {
  id: string;
  name: string;
  imageUrl: string | null;
  rarity: RepairRarity;
  /** Прочность, % (100 − износ): 0 — сломан. */
  durability: number;
  /** Имя героя, на котором надет; null — лежит в инвентаре. */
  heroName: string | null;
  price: RepairCost;
  /** Зачарование экземпляра, % (§8.87); нет поля — не зачарован. */
  enchantPct?: number | null;
};

/** Итог починки: сколько артефактов, чем заплачено, что осталось. */
export type ArtRepairDone = {
  ok: true;
  /** false — повтор того же нажатия: ничего не списано второй раз. */
  fresh: boolean;
  count: number;
  gold: number;
  diamonds: number;
  ids: string[];
};
