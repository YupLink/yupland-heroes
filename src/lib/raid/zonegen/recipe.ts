// Рецепт генерации зоны — общий контракт клиента и сервера.
//
// «Полу-ИИ»: ИИ (или админ руками) составляет РЕЦЕПТ — какие местности и в
// каких долях, насколько крупные пятна, сколько декора. Сами клетки рисует
// детерминированный генератор (generate.ts) по сиду: тот же рецепт + тот же
// сид = та же зона, «Перегенерировать» = новый сид. Клетки ИИ не рисует —
// на 5 000 координат он геометрию не держит, а рецепт весит 2 КБ.
import { z } from "zod";
import {
  defaultSettlement,
  settlementRecipeSchema,
  type SettlementReport,
  type ZoneStructure,
} from "./settlement-types";

/** Потолок клеток за один вызов генератора: 8 000 ≈ кисть радиуса 20 × 7 тапов. */
export const ZONE_MAX_CELLS = 8000;
/** Верхняя граница сида — Int32, чтобы влезать в любой JSON/БД без сюрпризов. */
export const SEED_MAX = 2_147_483_647;
/** Варп по умолчанию: кромка заметно гуляет, но пятна ещё узнаваемы. */
export const DEFAULT_WARP = 0.35;

export const zoneLayerSchema = z.object({
  terrainId: z.string().min(1).max(64),
  /** Доля зоны в процентах; нормируется по сумме, так что «60 и 20» = 75/25. */
  weight: z.number().min(0).max(100),
});

export const zoneRecipeSchema = z.object({
  seed: z.number().int().min(0).max(SEED_MAX),
  /** Слои местности. Порядок = «от низин к высотам»: вода уходит вниз сама. */
  layers: z.array(zoneLayerSchema).min(1).max(12),
  /** Характерный размер пятна в клетках (масштаб шума): 4 — рябь, 30 — материки. */
  scale: z.number().min(2).max(80),
  /**
   * Множитель плотности декора относительно «как админ ставил на этой
   * местности»: 1 = как на карте, 0 = без декора, 2 = вдвое гуще.
   */
  decorRate: z.number().min(0).max(3),
  /**
   * true — декор берётся ТОЛЬКО из того, что админ ставил на этой местности
   * (нет опыта — нет декора); false — местность без опыта берёт из общего пула.
   */
  decorStrict: z.boolean(),
  /** Зона меньше N клеток — один тип местности (жребий по весам), без пятен. */
  smallSingle: z.number().int().min(0).max(500),
  /**
   * Извилистость границ: 0 — пятна круглые, как от циркуля, 1 — берег рваный,
   * с заливами и косами. Технически — сила смещения координат вторым шумом.
   * С default прежние рецепты (локалка, ответ ИИ) читаются без правок.
   */
  warp: z.number().min(0).max(1).default(DEFAULT_WARP),
  /**
   * Фраза, из которой посчитан сид («Северный архипелаг»). Нужна только
   * человеку: вернуть ту же зону, не переписывая девятизначное число.
   */
  seedText: z.string().max(80).optional(),
  /** Поселения: постройки из справочника поверх местности. */
  settlement: settlementRecipeSchema.default(() => defaultSettlement()),
});

export type ZoneLayer = z.infer<typeof zoneLayerSchema>;
export type ZoneRecipe = z.infer<typeof zoneRecipeSchema>;

export type ZoneCell = { q: number; r: number };

/** Что положить на клетку. Дорогу и всё остальное генератор не трогает. */
export type ZonePatch = { q: number; r: number; terrainId: string; decorationId: string | null };

export type ZoneReport = {
  /** Клеток получили патч. */
  cells: number;
  /** Пропущено как занятые (объект/постройка/блок/купол/игрок/беглец). */
  skipped: number;
  byTerrain: Record<string, number>;
  decor: number;
  /** Сработало правило маленькой зоны — один тип местности. */
  single: boolean;
  /** Итог поселений; нет блока в рецепте — нет и раздела в отчёте. */
  settlement?: SettlementReport;
};

/** Опыт карты: на какой местности админ какой декор ставил и как часто. */
export type TerrainAffinity = {
  /** Клеток этой местности на карте. */
  total: number;
  /** Из них с декором. rate = decorated / total. */
  decorated: number;
  pool: Array<{ decorationId: string; n: number }>;
};
export type Affinity = {
  byTerrain: Record<string, TerrainAffinity>;
  /** Весь декор карты по частоте — запасной пул при decorStrict=false. */
  global: Array<{ decorationId: string; n: number }>;
  /** Метки декора: id → местности, на которые его можно ставить (нет — всюду). */
  decorTerrains?: Record<string, string[]>;
};

// ─── Контракты server fn ───
export type ZoneGenerateInput = {
  cells: ZoneCell[];
  recipe: ZoneRecipe;
  /**
   * Клетки, уже занятые НЕВЫГРУЖЕННЫМИ правками админа (постройки в очереди
   * кисти). База их не видит, и без этого второй прогон ставил дома поверх
   * домов первого (владелец, 24.09).
   */
  busy?: ZoneCell[];
};
export type ZoneGenerateOutput = {
  mapId: string;
  patches: ZonePatch[];
  /** Постройки, дороги и краска города — отдельно от местности. */
  structures?: ZoneStructure[];
  report: ZoneReport;
};

export type ZoneAiInput = { text: string; cellCount: number };
/** Сид ИИ не назначает — его крутит клиент кнопкой «Перегенерировать». */
export type ZoneAiOutput = { recipe: Omit<ZoneRecipe, "seed">; note: string };

export const newSeed = (): number => Math.floor(Math.random() * SEED_MAX);

export const defaultRecipe = (terrainId: string, seed = newSeed()): ZoneRecipe => ({
  seed,
  layers: [{ terrainId, weight: 100 }],
  scale: 12,
  warp: DEFAULT_WARP,
  decorRate: 1,
  decorStrict: true,
  smallSingle: 12,
  settlement: defaultSettlement(),
});

/** Доли слоёв, нормированные к 1; нулевая сумма → поровну. */
export function normalizeWeights(layers: ZoneLayer[]): number[] {
  const sum = layers.reduce((s, l) => s + Math.max(0, l.weight), 0);
  if (sum <= 0) return layers.map(() => 1 / layers.length);
  return layers.map((l) => Math.max(0, l.weight) / sum);
}
