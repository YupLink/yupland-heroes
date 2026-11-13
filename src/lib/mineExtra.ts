// Что окно постройки узнаёт про ШАХТУ (сервер → окно).
//
// Отдельным модулем, как столб заклинаний (spellbookExtra.ts): общий союз
// BuildingExtra (buildingEffect.types.ts) упирается в лимит 250 строк на файл.
// Потребители берут типы оттуда же, где и раньше (`@/lib/buildingEffect`).
import type { MineMode, MineV2Resource } from "./mineV2";
import type { MineWeather } from "./mineWeather";

/** Ресурсы, которые может добывать шахта. */
export type MineResource =
  | "likes"
  | "tickets"
  | "energy"
  | "gold"
  | "stone"
  | "diamonds"
  | "wood"
  | "token"
  | "custom";

/**
 * Шахта v2 (§8.59) в окне: режим, запас службы, поломка, цена починки.
 * Ничья v2 (сломалась, строки владения нет) — broken: true, lifeLeft 0,
 * mode 'base' (режим по умолчанию для починки).
 */
export type MineV2View = {
  mode: MineMode;
  /** Доля запаса (0..1) на момент lifeAt. */
  lifeLeft: number;
  /** ISO-время записи lifeLeft (для mineLifeNow / mineBreakAt). */
  lifeAt: string;
  /** Когда сломается (мс). */
  breakAt: number;
  broken: boolean;
  /** Стандарт добычи в час (без множителя режима). */
  stdYield: number;
  /** Множитель текущего режима. */
  mult: number;
  /** Полная цена починки. */
  repairCost: Partial<Record<MineV2Resource, number>>;
  /** Шахта острова новичка: только «База», без починки своей и без охраны. */
  island?: boolean;
  /** Остров: клетку уже чинили — ничья больше не чинится («Шахта истощена»). */
  spent?: boolean;
  /** Шаг выплаты, часов: алмаз острова — 24 («1 в день»), остальное — 1. */
  stepHours?: number;
  /** Уровень шахты (§8.74); старые ответы без поля — 1. */
  level?: number;
  /** Деревьев (гор) рядом у лесопилки (каменоломни), §8.80; нет — не считается. */
  nature?: number | null;
  /** Хозяину: выбранный герой — Строитель (улучшать может только он). */
  builder?: boolean;
  /** Слоты погоды несобранной части (lib/mineWeather); нет — погода не влияет. */
  weather?: MineWeather | null;
  /**
   * Чужая шахта дальше «второго обзора» (mine-life-see.ts): запас спрятан,
   * lifeLeft/lifeAt/breakAt — заглушки, полосы в окне нет.
   */
  far?: boolean;
};

export type MineExtra = {
  kind: "mine";
  /** Что добывает шахта и сколько за час (v2 — стандарт × множитель режима). */
  resource: MineResource;
  token: string | null;
  yieldAmount: number;
  /** Сколько энергии стоит захват. */
  captureCost: number;
  /** Чья шахта сейчас: моя / чужая / свободна. */
  mine: "own" | "enemy" | "free";
  /**
   * Секундомер: когда шахту захватили (мс) — клиент считает часы сам. У v2 —
   * начало текущего отрезка добычи (accrue_from): от него и идут часы.
   */
  capturedAt: number | null;
  /** Сколько целых часов текущий владелец уже забрал. */
  claimedHours: number;
  /**
   * Предел часов добычи от захвата (лесопилка острова — неделя); null — без
   * предела. У v2 — часы от начала отрезка до поломки.
   */
  maxHours?: number | null;
  /** Готовая к сбору добыча на момент ответа (снимок). */
  pending: number;
  /**
   * Босс-охранник шахты, если ЖИВ. Владелец видит поставленного босса,
   * чужой — «сначала бой». null — охраны нет / повержен.
   */
  guardian: {
    templateId: string;
    name: string;
    image: string | null;
    background: string | null;
    maxHp: number;
    currentHp: number;
    damage: string | null;
    /** Способности охранника — для блока «Опасности»; «10-20» едет строкой. */
    abilities: Array<{
      kind: string;
      chance: number;
      value: string | number;
      duration: string | number;
    }>;
  } | null;
  /** Шахта v2 — режим, запас, починка; null — шахта старого образца. */
  v2: MineV2View | null;
  /** Гриб (lib/mushroomKinds): вид; не гриб — null. */
  mushroom?: "darai" | "gold" | "diamonds" | null;
  /** Гриб созревает (защита на час, lib/mushroomRipe) до этой минуты, мс; нет — null. */
  ripeAt?: number | null;
  /** Замок шахтёра (§8.123): сколько ещё держит, мс; нет — 0 или пусто. */
  wardLeftMs?: number;
  /** Своя шахта и выбранный герой — Шахтёр: можно поставить замок (энергия — wardEnergy). */
  wardEnergy?: number | null;
  can: boolean;
  reasonKey: string | null;
  reasonParams?: Record<string, string | number>;
};
