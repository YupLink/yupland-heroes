// Общая сцена канваса рейда: что рисуем (клетки) и чем (палитра).
// Разделено на два модуля отрисовки — местность и фигуры поверх неё.
import type { WorldView } from "./mapIndex";
import type { HexTileCache } from "./hexTileCache";
import type { RoadRibbonCache } from "./roadRibbonCache";
import type { Cell } from "./unpackMap";
import type { ShipMark } from "./drawShips";
import type { SpriteCache } from "./spriteCache";
import type { ChestMarks } from "@/lib/magicChest";

export type DrawCell = Cell;

export type DrawScene = {
  g: CanvasRenderingContext2D;
  W: number;
  H: number;
  offset: { x: number; y: number };
  scale: number;
  toPixel: (q: number, r: number) => { x: number; y: number };
  images: Map<string, HTMLImageElement>;
  /** Цвет ободка объекта: редкость артефакта / сила босса. «objectId → цвет». */
  objectRings: Map<string, string>;
  /** Объекты карты: objectId → { kind, rarity, level }. Для LOD-форм. */
  objects?: Record<string, { kind?: string | null; rarity?: string | null; level?: number | null }>;
  /** Кэш типов объектов: objectId → kind. Считается раз на карту. */
  objectKinds?: Map<string, string>;
  /** Зоны тумана — кэшируются, чтобы не пересчитывать каждый кадр. */
  fogZones?: { active: Set<number>; bright: Set<number> };
  /** Готовые гекс-тайлы местности — кадр не режет картинки заново. */
  tiles: HexTileCache;
  /** Готовые спрайты дорожных лент — кадр не выкладывает их линиями. */
  ribbons: RoadRibbonCache;
  /** Видимый прямоугольник в координатах карты — по нему отсекаем клетки. */
  view: WorldView;
  /**
   * Куски статичного слоя, уже лежащие на холсте (drawStatic): клетки внутри
   * них местность и дорогу не рисуют — только содержимое поверх.
   */
  covered: Set<number>;
  /** Текущий тир построек: "q,r" → номер тира. */
  buildingTiers: Record<string, number>;
  /** Захваченные шахты: «q,r» → чья. Пусто у всех, кроме админа. */
  mineFlags?: Record<string, "own" | "enemy" | "tree">;
  /** Живые боссы-охранники шахт: «q,r» → картинка (рисуем поверх шахты). */
  mineGuards?: Record<string, { image: string | null }>;
  /** Магические сундуки игроков: «q,r» → чей и картинка (свой слой, не постройка). */
  magicChests?: ChestMarks;
  /** Ямки от лопаты: «q,r» — на земле, под всем, что стоит на клетке (02.10). */
  digHoles?: ReadonlySet<string>;
  /** Поля с лимитом: «q,r» → свободно/всего героев (значок над зданием). */
  fieldSlots?: Record<string, { used: number; max: number }>;
  /** Склады: «q,r» → единиц товара к сбору, мои личные и общие (бейдж над зданием). */
  warehouseBadges?: Record<string, { own: number; shared: number }>;
  /**
   * Отложенные бейджи складов: drawBuilding не рисует их сразу, а складывает
   * сюда, и кадр кладёт их ПОСЛЕ плёнки тумана — владелец просил, чтобы число
   * к сбору читалось издалека, а bright-зона у складов красила чужие поля.
   */
  deferredBadges?: Array<{ key: string; x: number; top: number }>;
  /**
   * Побеги для вспышки: «q,r» клетки, ОТКУДА убежал беглец → клетка, КУДА он
   * убежал. Красную стрелку рисуем МЕЖДУ ними (в середине отрезка, остриём на
   * «куда») — видно направление от старой клетки к новой, а не поверх объекта.
   */
  runnerArrows?: Record<string, { toQ: number; toR: number }>;
  /** Разведанные клетки — видны, но тускло. Маска по номерам клеток. */
  seen: { hasIndex(i: number): boolean; has(key: string): boolean };
  /** Клетки в текущем радиусе обзора — полная яркость. Номерами клеток. */
  visible: Set<number>;
  /**
   * Режим админа «карта открыта целиком»: показываем всё, не спрашивая туман.
   *
   * Признаком, а не набором из всех 16 384 ключей: набор пересобирался на
   * каждую правку карты, а кадр на нём делал по два поиска на клетку — при
   * зуме 0.35 это ~5 000 поисков в кадре ради заведомо одного и того же ответа.
   */
  revealAll: boolean;
  /**
   * Клетки под глухим туманом. Игроку сюда не попадает ни одной — их вырезает
   * useFogView, — поэтому нарисованный купол означает «смотрит админ».
   */
  voidCells: Set<string>;
  /** Где стоят игроки: "q,r" → сколько человек. */
  players: Map<string, number>;
  /** Корабли на воде: "q,r" → занят ли и мой ли. */
  ships: Map<string, ShipMark>;
  /** Клетки, изменённые админом и ждущие выгрузки: обводим их золотом. */
  pendingCells?: Set<string>;
  /**
   * Клетки под биом-генератор: своя пунктирная обводка. Отдельным полем от
   * pendingCells нарочно — жёлтый цвет тот же, но другой шаг штриха, чтобы
   * админ видел, где ждёт «Сгенерировать», а где — «Выгрузить».
   */
  selectedForGen?: Set<string>;
  /** Клетка своего героя — на ней чужой лагерь не рисуем. */
  heroCell: { q: number; r: number } | null;
  /** Спрайты иконок под текущий зум (объекты, постройки, охранники) — 1:1 на холст. */
  sprites?: SpriteCache;
  /** Разрешение кадра: зум × dpr (до 2) — под него пекутся спрайты и куски. */
  bucket: number;
  /**
   * Камера сейчас в движении/зуме. На таких кадрах пропускаем самые тяжёлые
   * стилистические слои (тонкая сетка, «серая плёнка тумана»), которые
   * стоят по stroke/fill на каждой из сотен клеток и незаметны в движении.
   */
  moving?: boolean;
};

/** Палитра карты — те же токены, что в теме приложения. */
export const COLOR = {
  fogTile: "#10141c",
  fogEdge: "#171d28",
  emptyTile: "#131822",
  grass: "#3a5238",
  border: "#1e2632",
  route: "#41d3c6",
  // Запасной цвет ленты: у дороги нет PNG (старые id) — печём её этим цветом.
  road: "#c9a267",
  gold: "#f5b301",
  goldDeep: "#d9891f",
  hero: "#4fd6e0",
  dark: "#0b0f18",
  // Цвета купола здесь НЕТ: он один на карту, палитру кисти и гекс-редактор —
  // и живёт одним источником в @/lib/voidDome.
} as const;
