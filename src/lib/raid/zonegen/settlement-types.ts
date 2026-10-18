// Поселения в генераторе зон: расставить ГОТОВЫЕ постройки из справочника и
// связать их дорогой.
//
// Владелец, 22.09.2026: «нужно чтобы была возможность генерировать и города из
// уже имеющихся предзагруженных моделек построек». До этого генератор клал
// только местность и декор, а постройки админ ставил кистью по одной.
//
// Новые картинки генератор НЕ рисует (в проекте нет ни одного генератора
// изображений) — он расставляет то, что уже заведено в mystic_item_template.
import { z } from "zod";

/**
 * Планировка: КАК стоят дома. Раньше была одна — «пятно», и город выходил
 * россыпью (владелец, 24.09: «хаотично раскидывает, здание на здание»).
 * Планировка задаёт скелет: где площадь, где улицы, где дворы.
 */
export const SETTLEMENT_LAYOUTS = ["organic", "ring", "cross", "grid", "free"] as const;
export type SettlementLayout = (typeof SETTLEMENT_LAYOUTS)[number];

/** Каким бывает поселение: от лагеря в три двора до города с ратушей. */
export const SETTLEMENT_PRESETS = ["camp", "village", "town", "port"] as const;
export type SettlementPreset = (typeof SETTLEMENT_PRESETS)[number];

/**
 * Заказ живого роста: ЧТО должно быть в поселении (владелец, 24.09: «что
 * должно быть в городе»), а не как оно ляжет. Заказ правит состав — у лагеря
 * найм, у хутора нет центральных служб (Weiler), у порта верфь и склад и центр
 * у воды, — а форму всё так же выводит дерево решений из состава и места.
 * auto — всё решают число построек и вода рядом с местом.
 */
export const TOWN_KINDS = ["auto", "camp", "hamlet", "village", "town", "port"] as const;
export type TownKind = (typeof TOWN_KINDS)[number];

/**
 * Строка состава: СКОЛЬКО этой постройки в поселении.
 *
 * Было «вес жребия + потолок» — владелец справедливо не понял, что значит
 * «40 и 2» (22.09). В настоящей деревне не тянут жребий: ратуша одна, таверна
 * одна, склад один, а остальное — дворы. Поэтому здесь ровно два вида строк:
 * точное количество (count) и «фон» (fill) — им добивается остаток пятна.
 */
export const settlementSlotSchema = z.object({
  buildingId: z.string().min(1).max(64),
  /** Сколько штук ставить на одно поселение. 0 + fill = только в фон. */
  count: z.number().int().min(0).max(50),
  /** Добивать остаток пятна этой постройкой (дворы, лавки). */
  fill: z.boolean().optional(),
});

export type SettlementSlot = z.infer<typeof settlementSlotSchema>;

export const settlementRecipeSchema = z.object({
  enabled: z.boolean(),
  preset: z.enum(SETTLEMENT_PRESETS),
  /** Сколько поселений разложить по зоне. */
  count: z.number().int().min(1).max(12),
  /** Поперечник застройки в клетках. */
  size: z.number().int().min(2).max(25),
  /**
   * Доля клеток пятна под постройки. Выше 1/3 не бывает: между дворами по
   * правилу расстановки всегда пустая клетка, и плотнее гекс не набивается.
   */
  density: z.number().min(0.05).max(0.8),
  slots: z.array(settlementSlotSchema).max(60),
  /**
   * Планировка застройки. ring — площадь с ратушей, кольцо служб, дворы по
   * краю, улицы-спицы; cross — две улицы через центр; grid — кварталы;
   * free — прежнее пятно без плана.
   */
  layout: z.enum(SETTLEMENT_LAYOUTS).default("organic"),
  /**
   * Автоподбор состава от сида (владелец, 25.09: «рандомно делай подборки»):
   * службы по канону разблокировки, модель внутри роли — жребий без повторов.
   * false — ставится ручной состав из slots.
   */
  auto: z.boolean().default(true),
  /** Сколько построек в поселении при автоподборе (форма выводится из числа). */
  buildings: z.number().int().min(3).max(40).default(12),
  /** Заказ: лагерь, хутор, деревня, городок, порт или auto (см. TOWN_KINDS). */
  kind: z.enum(TOWN_KINDS).default("auto"),
  /**
   * Тема обликов: слово из имён обликов («Юпик», «Кабан», «Дракон»…). Пусто —
   * тема выбирается жребием от сида среди хорошо покрытых.
   */
  theme: z.string().max(40).default(""),
  /** Дорога между постройками; null — не прокладывать. */
  roadId: z.string().min(1).max(64).nullable(),
  /** Ставить сразу достроенной (тир = последний у шаблона). */
  built: z.boolean(),
});
export type SettlementRecipe = z.infer<typeof settlementRecipeSchema>;

/**
 * Постройка из справочника глазами генератора. Тиры нужны, чтобы поставить
 * достроенной; needsConfig — чтобы не ставить в город шахту без настройки
 * (она будет «не настроена» и не заработает).
 */
export type BuildingOption = {
  id: string;
  name: string;
  /** Эффект из meta.effect (или угаданный по имени); null — просто декорация-дом. */
  effect: string | null;
  /** Сколько тиров у шаблона (0 — тиров нет). */
  tiers: number;
  /** Постройка без своего building_config работать не будет (шахта, поле, портал). */
  needsConfig: boolean;
  /**
   * Облики этой постройки из групп обликов (raid_building_group.template_id):
   * по их именам узнаётся тема — «Кабан», «Дракон», «Юпик». Пусто — облика нет.
   */
  skins?: Array<{ id: string; name: string; races?: string[] }>;
  /** Метки (assetTags): расы — только в город своей расы; местности — только на них. */
  races?: string[];
  terrains?: string[];
};

/** Что генератор кладёт на клетку сверх местности: постройка и дорога. */
export type ZoneStructure = {
  q: number;
  r: number;
  buildingId?: string | null;
  /** Под домом декора быть не должно: ставим дом — стираем ёлку. */
  decorationId?: string | null;
  /** Облик темы (id без префикса skin:); едет в одном патче с buildingId. */
  buildingSkinId?: string | null;
  /** Тир (достроенность); ставится только вместе с buildingId. */
  tier?: number;
  roadId?: string | null;
};

export type SettlementReport = {
  /** Сколько поселений реально встало. */
  places: number;
  buildings: number;
  roadCells: number;
  /** Что именно поставили: имя → сколько. */
  byBuilding: Record<string, number>;
  /** Не нашлось места под столько построек (тесно/занято). */
  shortfall: number;
  /** Органический рост: какая форма вышла (из числа построек, въездов, воды). */
  form?: string;
  /** Какая тема обликов досталась (после жребия), null — без обликов. */
  theme?: string | null;
  /** Сколько въездов у поселения. */
  gates?: number;
};

export const defaultSettlement = (): SettlementRecipe => ({
  enabled: false,
  preset: "village",
  count: 1,
  size: 7,
  density: 0.26,
  slots: [],
  layout: "organic",
  auto: true,
  buildings: 12,
  kind: "auto",
  theme: "",
  roadId: null,
  built: true,
});

/** Пресеты — только рамка размера и плотности; набор построек выбирает админ. */
export const PRESET_SHAPE: Record<SettlementPreset, { size: number; density: number }> = {
  camp: { size: 4, density: 0.22 },
  village: { size: 7, density: 0.26 },
  town: { size: 12, density: 0.3 },
  port: { size: 9, density: 0.26 },
};
