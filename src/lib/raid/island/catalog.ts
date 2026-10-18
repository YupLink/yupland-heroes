// Что стоит на острове новичка: только существующие товары, декор и постройки
// игры (ПРАВИЛА §8.14 — генератор не выдумывает ассеты). Цепочка задания:
// сундук → доски → топор → дуб → бревна; слизень → руда → кирка → кристалл →
// пыльца; руда + бревна → лопата → клад → слиток; бревна + пыльца + слиток →
// портал в основной мир.

/** Свои товары (raid_custom_item), из которых собрано задание. */
export const ISLAND_ITEMS = {
  plank: "cst_pykrpujitzq0", // Доска
  log: "cst_wtza7b6iq7va", // Бревна Дуба
  ore: "cst_izilsngrki5v", // Горная Руда
  dust: "cst_plnb53k8v5dm", // Магическая пыльца
  iron: "cst_64csav5sczbu", // Слиток Железа
  axe: "cst_frxf3xh6mq6g", // Деревянный Топор
  pickaxe: "cst_yhb7xhrdp1dq", // Каменная Кирка
  shovel: "cst_aosknovigzpu", // Каменная Лопата
  rod: "cst_rew3z8sxs897", // Удочка (is_rod)
} as const;

export type IslandItem = keyof typeof ISLAND_ITEMS;

/** Декор: дуб рубят деревянным топором, синий кристалл добывают киркой. */
export const ISLAND_DECOR = {
  oak: "decoration_wnfmRe6dly",
  crystal: "decoration_E8ZPo0MFHl",
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

/** Боссов на острове (вместе с первым слизнем): не мало и не много. */
export const BOSS_COUNT = { min: 5, max: 7 } as const;

/**
 * Простые боссы (без артефакта и пака) встают снова через столько минут —
 * точка возрождения (§8.49) на своей клетке, не бродят: «Показать» не врёт.
 */
export const ISLAND_BOSS_RESPAWN_MIN = 20;

/**
 * Сколько чего на острове (17.10: «чтобы человек поисследовал, ресурсы со
 * временем спавнились»): дубы и кристаллы отрастают сами (декор, 15 и 60 мин).
 * Первые дубы — у старта, первые кристаллы — у шахты, остальные — врозь.
 */
export const ISLAND_COUNTS = {
  trees: 12,
  treesNearStart: 4,
  crystals: 8,
  crystalsNearMine: 2,
  /** Кладов сверх главного (со слитком у портала). */
  digs: 4,
} as const;

/**
 * Коммон-артефакт за одного из боссов, только не за первого (владелец, 14.10):
 * Axe (+1 Attack), правая рука. Кому — от сида.
 */
export const ISLAND_ARTIFACT = "art_iGIzIWqLYO";

/**
 * Тренировочный пак за другого случайного босса (не первого): открывается в
 * «Паки» как любой пак, но даёт тренировочные фишки (chips-pack-open →
 * island-pack). Пак скрыт и не продаётся — только награда острова.
 */
export const ISLAND_TRAINING_PACK = "cp_island_training";
/** Фишек в тренировочном паке. */
export const TRAINING_PACK_CHIPS = 3;

/** Постройки: мастерская (облик кузницы, работает лавкой), лесопилка, портал острова. */
export const ISLAND_BUILDINGS = {
  workshop: "building_XOq7FN2NdQ",
  mine: "building_yYIdx793rM",
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
  treasure: [{ item: "iron", n: 1 }] as Amount[],
  /** Прочие клады по очереди: доска (на топор), руда (на кирку и лопату). */
  digs: [[{ item: "plank", n: 1 }], [{ item: "ore", n: 1 }]] as Amount[][],
};

/** Рецепты мастерской: что даёт и чем платят (у лавки — не больше двух цен). */
export type IslandRecipe = {
  id: "axe" | "pickaxe" | "shovel" | "rod";
  give: IslandItem;
  cost: Amount[];
};

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
 * Лесопилка острова (владелец, 17.10.2026): 1 дерево в час, захват за 10 —
 * как у лесопилок мира с той же добычей; работает не дольше недели от захвата
 * (maxHours — учёт в SQL raid_mine_pending/claim/capture, только на острове).
 */
export const ISLAND_MINE_CONFIG = {
  resource: "wood",
  yield: 1,
  captureCost: 10,
  maxHours: 168,
} as const;

/** Сундук — 1 энергия, как у таких сундуков в мире (боссы — по шаблону, без скидок). */
export const ISLAND_HIT_COST = { chest: 1 } as const;
