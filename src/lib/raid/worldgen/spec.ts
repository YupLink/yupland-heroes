// Мир по чанкам (владелец, 06.10.2026): «генерировать большие территории
// автоматически … миры бесконечной генерации на основании чанков, как в
// майнкрафте; ратуша, появившись, автономна — её не нужно настраивать».
//
// Мир = сид + СПЕЦИФИКАЦИЯ, снятая с образцовой карты («логика как у Альфы»):
// доли суши и воды, земли с весами, декор и объекты по местности, шаблоны
// городов. Любая клетка — чистая функция (спецификация, q, r): города, дороги и
// проходы лабиринта тоже считаются из мира, а не из того, что уже записано.
// Поэтому чанк, посчитанный сегодня, и соседний, посчитанный через месяц,
// сходятся на стыке клетка в клетку. Спецификация хранится в raid_world.spec
// целиком: правки образца после создания мира его новые чанки не меняют.
//
// v2 (владелец, 06.10.2026: «дороги между местностями; как лабиринт, но ко всем
// участкам земли должен быть проход»): сеть дорог между областями и лабиринт с
// гарантией прохода (maze, maze-fix).
//
// v3 (владелец, 07.10.2026: «постройки в диком разнобое, нет ратуш, нет
// смысловой состыковки; фонари посреди леса»): города по коллекциям рас,
// ратуша в каждом, своя настройка храмов и покоев с образца, городской декор —
// только у улиц, выбор земель мира.
//
// v4 (владелец, 07.10.2026: «у всех рас всё есть — и ратуши свои; города
// названы не просто так, у входа табличка "Город такой-то"; составь списки,
// какие постройки для какого города»): города по НАБОРАМ, снятым с городов
// образца (learn-kits): облик ратуши, постройки её городов, табличка у въезда.
import { z } from "zod";

/** Сторона чанка в клетках (offset odd-r): карта 128 — это 8 × 8 чанков. */
export const CHUNK = 16;
/** Версия формулы мира: другая формула — другой мир, а не тихая правка старого. */
export const WORLD_VERSION = 4;

const weightedId = z.object({ id: z.string().min(1).max(64), w: z.number().min(0) });

/** Что и как часто ставить на местность: шанс клетки и пул с весами. */
const coverSchema = z.object({
  p: z.number().min(0).max(1),
  ids: z.array(z.string().min(1).max(80)).max(200),
  w: z.array(z.number().min(0)).max(200),
});

/** Объект клетки: id («boss:…», «chest:…») и настройка, снятая с образца. */
const objectSchema = z.object({
  id: z.string().min(1).max(80),
  w: z.number().min(0),
  cfg: z.unknown().nullable(),
});

/** Облик постройки набора: шаблон и облик (null — своя картинка шаблона). */
const kitLookSchema = z.object({
  t: z.string().min(1).max(64),
  s: z.string().min(1).max(64).nullable(),
});

/**
 * Набор города — с городов образца с одной ратушей (learn-kits): её облик,
 * раса, подпись с табличек («Город Драконов»), земли под городами и облики
 * построек. n — сколько раз облик стоит в этих городах (0 — из расового
 * набора); own — облик именно этого набора (своей расы или только здесь).
 */
export const townKitSchema = z.object({
  id: z.string().min(1).max(64),
  race: z.string().min(1).max(40).nullable(),
  label: z.string().min(1).max(60).nullable(),
  hall: kitLookSchema,
  sign: kitLookSchema.nullable(),
  terrains: z.array(weightedId).max(8),
  looks: z.array(kitLookSchema.extend({ n: z.number().int().min(0), own: z.boolean() })).max(80),
  towns: z.array(z.string().min(1).max(60)).max(16),
});

/** Шаблон города: жители, правила и товары настроенной ратуши образца. */
export const townTemplateSchema = z.object({
  residents: z.number().int().min(0),
  rules: z.record(z.string(), z.unknown()),
  goods: z.array(z.unknown()).max(200),
});

export const worldSpecSchema = z.object({
  v: z.literal(WORLD_VERSION),
  seed: z.number().int().min(0).max(2_147_483_647),
  /** Вода у берега и океан (глубокая, только большим кораблям). */
  water: z.object({ shallow: z.string().min(1), ocean: z.string().min(1) }),
  /** Земли областей с весами (доли образца). */
  land: z.array(weightedId).min(1).max(64),
  /** Соседка земли (чаще всего рядом на образце): ею идут пятна внутри области. */
  pair: z.record(z.string(), z.string()),
  /** Доли всей площади: суша и вода у берега; остальное — океан. */
  shares: z.object({ land: z.number().min(0.05).max(1), shallow: z.number().min(0).max(0.95) }),
  /** Пороги высоты и пятен, посчитанные один раз от сида (field.computeLevels). */
  levels: z.object({ ocean: z.number(), sea: z.number(), patch: z.number() }),
  /** Декор по местности (только суша). */
  decor: z.record(z.string(), coverSchema),
  /** Объекты по местности: шанс на клетку без декора и пул. */
  objects: z.record(
    z.string(),
    z.object({ p: z.number().min(0).max(1), pool: z.array(objectSchema).max(200) }),
  ),
  /** Декор, сквозь который ходят (meta.walkable): он не стена лабиринта. */
  walk: z.array(z.string().min(1).max(80)).max(400),
  /** Поперечник ячейки лабиринта, клеток: по её краю — тропа без декора. */
  maze: z.number().min(8).max(64),
  towns: z.object({
    /** Шаг сетки мест под города, клеток (≥ 30: зоны роста соседей не налезают). */
    spacing: z.number().min(30).max(200),
    /** Дорога улиц и трактов; null — без дорог. */
    roadId: z.string().nullable(),
    templates: z.array(townTemplateSchema).max(64),
    /**
     * Своя настройка постройки по функции — с образца: храм получает алтарь
     * одного из храмов образца, покои — цены покоев (без неё оба молчат).
     */
    configs: z.record(z.string(), z.array(z.record(z.string(), z.unknown())).max(32)).default({}),
    /** Городской декор (фонари и прочее, что на образце стоит у домов) — только у улиц. */
    decor: coverSchema.nullable().default(null),
    /** Наборы городов с образца; пусто — города по коллекциям рас (v3). */
    kits: z.array(townKitSchema).max(40).default([]),
  }),
  /** Расы декора (метки): расовый декор — только в городах своей расы, в природе — никогда. */
  decorRaces: z.record(z.string(), z.array(z.string().min(1).max(40)).max(12)).default({}),
});

export type WorldSpec = z.infer<typeof worldSpecSchema>;
export type TownTemplate = z.infer<typeof townTemplateSchema>;
export type TownKit = z.infer<typeof townKitSchema>;
export type KitLook = TownKit["looks"][number];

/** Клетка мира — то, что ляжет строкой в raid_map_cells. */
export type WorldCell = {
  q: number;
  r: number;
  terrainId: string;
  decorationId: string | null;
  roadId: string | null;
  buildingId: string | null;
  buildingSkinId: string | null;
  /** Своя настройка постройки (building_config): храм и покои — с образца. */
  buildingConfig: Record<string, unknown> | null;
  /** Тир постройки (достроена); null — тиров нет. */
  tier: number | null;
  objectId: string | null;
  objectConfig: unknown;
  /** Блок клеток (объединение режима бога): у шаблонов городов острова. */
  groupId?: string | null;
  /** Масштаб картинки блока, %. */
  iconScale?: number | null;
  /**
   * Как писать клетку поверх уже лежащей: base — только в пустое место (чанк
   * пишет свои клетки целиком, повтор ничего не меняет); clear — снять декор с
   * лежащей; built — пишется поверх целиком.
   */
  mode: CellMode;
};

export type CellMode = "base" | "clear" | "built";

/** Ратуша города: где стоит и с какой настройкой встаёт (сразу автономна). */
export type WorldHall = { q: number; r: number; config: Record<string, unknown> };

/** Лавка, привязанная к ратуше своего города. */
export type WorldShop = { q: number; r: number; hallQ: number; hallR: number };

export type WorldTownReport = {
  q: number;
  r: number;
  name: string;
  buildings: number;
  hall: boolean;
};

/** Итог генерации участка: клетки, ратуши, лавки и сводка. */
export type WorldArea = {
  cells: WorldCell[];
  halls: WorldHall[];
  shops: WorldShop[];
  towns: WorldTownReport[];
  roads: number;
};
