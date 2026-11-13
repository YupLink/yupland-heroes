// Что стоит на острове новичка: только существующие товары, декор и постройки
// игры (ПРАВИЛА §8.14 — генератор не выдумывает ассеты). Цепочка задания:
// сундук → доски, паки, лайки, золото, энергия; доска → топор → дуб → бревна;
// слизень → руда → кирка → камень; руда + бревна → лопата → клады → слиток →
// золото на починку лесопилки. Ресурсы портала (дерево, камень, золото,
// алмазы) — с четырёх шахт и скупки мастерской. Энергия на острове — в 10 раз
// меньше на все действия (владелец, 20.10.2026; energy.ts — при списании).

/** Свои товары (raid_custom_item), из которых собрано задание. */
export const ISLAND_ITEMS = {
  plank: "cst_pykrpujitzq0", // Доска
  log: "cst_wtza7b6iq7va", // Бревна Дуба
  ore: "cst_izilsngrki5v", // Горная Руда
  dust: "cst_plnb53k8v5dm", // Магическая пыльца
  iron: "cst_64csav5sczbu", // Слиток Железа
  stone: "cst_n9rwfkf1nagh", // Камень (с декора «Камень» киркой)
  goldIngot: "cst_0chsk0wpqt2b", // Слиток золота
  axe: "cst_frxf3xh6mq6g", // Деревянный Топор
  pickaxe: "cst_yhb7xhrdp1dq", // Каменная Кирка
  shovel: "cst_aosknovigzpu", // Каменная Лопата
  rod: "cst_rew3z8sxs897", // Удочка (is_rod)
} as const;

export type IslandItem = keyof typeof ISLAND_ITEMS;

/**
 * Декор: дуб рубят деревянным топором, камень добывают киркой (владелец,
 * 20.10.2026: «нужны камни — вот их и надо добывать»; до того — синий кристалл
 * с пыльцой). Роль клеток в местах острова по-прежнему зовётся crystals.
 */
export const ISLAND_DECOR = {
  oak: "decoration_wnfmRe6dly",
  stone: "decoration_nVZxWlASdo",
} as const;

/** Объекты карты: обычный сундук и слабейший моб игры (Болотный Слизень, 1 ур.). */
export const ISLAND_OBJECTS = {
  chest: "chest:chest_YoMC-Ks1pX",
  slime: "boss:rbt_j5-gWHAk",
} as const;

/**
 * Слабые боссы острова (1 ур., бьют слабо, без оглушения и побега). Первый
 * босс — всегда слизень задания, вид остальных — от сида (владелец, 14.10:
 * «более рандомно по слабым боссам»). HP — своё на клетке.
 */
export const WEAK_BOSSES = [
  { id: "boss:rbt_j5-gWHAk", hp: 150 }, // Болотный Слизень
  { id: "boss:rbt_9EQ7GoCm", hp: 250 }, // Горный Хомяк
  { id: "boss:rbt_BOxy9qgC", hp: 150 }, // Лесной Ёж
] as const;

/** Боссов на острове (вместе с первым слизнем) — владелец, 20.10: «около 50». */
export const BOSS_COUNT = { min: 50, max: 50 } as const;

/**
 * Боссы встают снова через столько минут — точка возрождения (§8.49) на своей
 * клетке, не бродят: «Показать» не врёт.
 */
export const ISLAND_BOSS_RESPAWN_MIN = 20;

/**
 * Сколько чего на острове (17.10: «чтобы человек поисследовал, ресурсы со
 * временем спавнились»): дубы и кристаллы отрастают сами (декор, 15 и 60 мин).
 * Первые дубы — у старта, первые кристаллы — у шахты, остальные — врозь.
 */
export const ISLAND_COUNTS = {
  trees: 60,
  treesNearStart: 4,
  /** Камни (роль crystals): добываются киркой, отрастают за час. */
  crystals: 40,
  crystalsNearMine: 2,
  /** Кладов сверх главного (у портала): всего 40 (владелец, 20.10). */
  digs: 39,
  /** Из них — под дубами и камнями: откопать после рубки или добычи. */
  digsUnderDecor: 10,
} as const;

/**
 * Артефакт, что до 20.10 лежал призом у одного босса (Axe, +1 Attack). Теперь
 * с босса падает случайный обычный артефакт (drops.ts); id остаётся для шагов
 * «забери/надень» у островов, созданных раньше.
 */
export const ISLAND_ARTIFACT = "art_iGIzIWqLYO";

/**
 * Тренировочный пак: три — в первом сундуке, ещё — с босса с шансом (drops.ts).
 * Открывается в «Паки» как любой пак, но даёт тренировочные фишки
 * (chips-pack-open → island-pack). Пак скрыт и не продаётся.
 */
export const ISLAND_TRAINING_PACK = "cp_island_training";
/** Фишек в тренировочном паке. */
export const TRAINING_PACK_CHIPS = 3;

/**
 * Шахты острова (владелец, 20.10.2026): по одной каждого вида, у каждого
 * шаблона один тир. Стоят сломанными и ничьими — берёт тот, кто починит.
 */
export const ISLAND_MINES = {
  wood: "building_yYIdx793rM", // Лесопилка — цель шага «Шахта»
  stone: "building_IbP4EseH2O", // Каменная Шахта
  gold: "building_UbJz0SbcXB", // Золотая шахта
  diamonds: "building_JTzVEXzUQH", // Алмазная шахта
} as const;

export type IslandMineRes = keyof typeof ISLAND_MINES;

/** Шахты сверх лесопилки — в этом порядке в places.mines. */
export const ISLAND_EXTRA_MINES: readonly IslandMineRes[] = ["stone", "gold", "diamonds"];

/**
 * Настройка клетки шахты острова — движок «Шахт v2» (§8.59), без maxHours.
 * Флаг island: цены починки острова, только «База», ровно 7 дней и одна
 * починка навсегда; дерево, камень, золото — 1 в час, алмазы — 1 в сутки
 * (SQL смотрит на флаг, сервер — ещё и на id карты `isle_`). Строку владения
 * генератор не пишет — шахта стоит сломанной.
 */
export const islandMineConfig = (res: IslandMineRes) => ({
  effect: "mine",
  resource: res,
  island: true,
  yield: 1,
  captureCost: 0,
});

/** Постройки: мастерская (облик кузницы, работает лавкой), лесопилка, портал острова. */
export const ISLAND_BUILDINGS = {
  workshop: "building_XOq7FN2NdQ",
  mine: ISLAND_MINES.wood,
  portal: "building_island_portal",
  /** Верфь: игрок строит себе корабль сам (владелец, 17.10.2026). */
  shipyard: "building_GvejiPrkBV",
} as const;

/** Последний тир кузницы: мастерская стоит достроенной. */
export const WORKSHOP_TIER = 1;

export type Amount = { item: IslandItem; n: number };

/** Сколько чего в находках острова. */
export const ISLAND_LOOT = {
  chest: [{ item: "plank", n: 3 }] as Amount[],
  /** Первый слизень: руда на кирку и лопату. */
  slime: [{ item: "ore", n: 2 }] as Amount[],
  /** Прочие боссы. */
  boss: [{ item: "ore", n: 1 }] as Amount[],
  /** Главный клад у портала (начинка прочих — loot.ts). */
  treasure: [{ item: "goldIngot", n: 1 }] as Amount[],
};

/** Рецепты мастерской: что даёт и чем платят (у лавки — не больше двух цен). */
export type IslandRecipe = {
  id: "axe" | "pickaxe" | "shovel" | "rod";
  give: IslandItem;
  cost: Amount[];
};

/**
 * Покупок рецепта в сутки на аккаунт — у каждой лавки свой счёт: с запасом на
 * сломанные топоры, но не ферма инструментов. Удочки — тоже 10 (владелец,
 * 21.10.2026: «если много мастерских — верни лимит на 10»: удочки продают
 * мастерская и магазины трёх городов — 40 в сутки на всех).
 */
export const ISLAND_RECIPE_DAY_LIMIT = 10;

export const ISLAND_RECIPES: readonly IslandRecipe[] = [
  { id: "axe", give: "axe", cost: [{ item: "plank", n: 1 }] },
  {
    id: "pickaxe",
    give: "pickaxe",
    cost: [
      { item: "log", n: 1 },
      { item: "ore", n: 1 },
    ],
  },
  {
    id: "shovel",
    give: "shovel",
    cost: [
      { item: "log", n: 1 },
      { item: "ore", n: 1 },
    ],
  },
  // Удочка — за бревна: дубы отрастают, доски нужны на топоры (их всего 3 + клады).
  { id: "rod", give: "rod", cost: [{ item: "log", n: 2 }] },
];

// Починка портала (руины → портал: бревна ×2, пыльца ×2, слиток ×1) — цена
// тира в шаблоне building_island_portal (migrations/island-01-newbie-island.sql).

/**
 * Сундук — 1 энергия, как у таких сундуков в мире; боссы — по шаблону. Скидку
 * острова (×0,1 на всё) даёт сервер при списании (energy.ts), не клетка.
 */
export const ISLAND_HIT_COST = { chest: 1 } as const;
