// Пропсы карты рейда — вынесены из BetaRaidCanvas (правило ≤250 строк).
import type { HudBuff, HudChipEffect, HudSlow, HudWeaken } from "./BetaEffectHud";
import type { Cell } from "./unpackMap";
import type { MapStore } from "./mapStore";
import type { MergeSelection } from "./drawMergeOverlay";
import type { ShipMark } from "./drawShips";
import type { RaidHeroUi } from "./useRaidHeroUi";
import type { DoorTollMap } from "./pathTolls";
import type { ChestMarks } from "@/lib/magicChest";
import type { LootBagMarks } from "@/lib/lootBag";
import type { GroundMarks } from "@/lib/digHole";
import type { MyGift } from "@/server/api/gifts";

export type CanvasProps = {
  newspapers?: import("@/lib/newspaper").NewspaperSpot[];
  onOpenGiftPack?: (gift: MyGift) => void;
  /** main — главный мир (там замок); снимок до этажей поля не несёт. */
  map: { id: string; name: string; size: number; main?: boolean };
  /** Карта колонками и сеткой — кадр, туман и поиск пути ходят по ней. */
  store: MapStore;
  /** Словарь-Proxy поверх колонок для старого кода (тап, соседи). */
  cells: Record<string, Cell>;
  terrains: Record<string, { imageUrl: string | null }>;
  /**
   * Клетки под глухим туманом. Купол — слой поверх содержимого, а не тип
   * местности, поэтому и на карту он едет отдельным набором ключей.
   * Подсвечивает его только админ: у игрока эти клетки вырезаны из
   * разведанного и не рисуются вовсе.
   */
  voidCells: Set<string>;
  objects: Record<
    string,
    { imageUrl: string | null; kind?: string | null; rarity?: string | null; level?: number | null }
  >;
  decorations: Record<string, { imageUrl: string | null }>;
  roads: Record<string, { imageUrl: string | null }>;
  buildings?: Record<string, { name?: string; tiers?: Array<{ imageUrl?: string | null }> }>;
  buildingTiers?: Record<string, number>;
  /** Флажки захваченных шахт — только у админа (mine-flags.ts). */
  mineFlags?: Record<string, "own" | "enemy" | "tree">;
  /** Живые боссы-охранники шахт: "q,r" → картинка (getMineGuards). */
  mineGuards?: Record<string, { image: string | null }>;
  /** Магические сундуки игроков: "q,r" → свой/чужой и картинка (getMagicChests). */
  magicChests?: ChestMarks;
  /** Мешочки и бугорки «второго обзора»: "q,r" → сколько и закопаны ли (§8.21). */
  lootBags?: LootBagMarks;
  /** Ямки от лопаты и мои бугорки (02.10, src/lib/digHole.ts). */
  ground?: GroundMarks;
  /** Поля с лимитом: "q,r" → свободно/всего героев (значок над зданием). */
  fieldSlots?: Record<string, { used: number; max: number }>;
  /** Склады: "q,r" → сколько ЦЕЛЫХ ЕДИНИЦ товара (floor суммы) к сбору — мои личные и общие всех. */
  warehouseBadges?: Record<string, { own: number; shared: number }>;
  playerPos: { q: number; r: number } | null;
  chipEffects?: HudChipEffect[];
  /** Ослабления героя — значки рядом с замедлением. */
  weakenEffects?: HudWeaken[];
  /** Активные бусты — те же значки над героем, только со знаком «+». */
  buffEffects?: HudBuff[];
  slow?: HudSlow;
  /** Куда можно шагнуть и почём — подписи цены рисуются на самих клетках. */
  availableMoves: Array<{ q: number; r: number; cost: number }>;
  /** Энергия игрока: метка маршрута гасит «Идти», когда на путь не хватает. */
  energy: number;
  /** blind — неразведанная клетка в досягаемости (sight/fogReach): только маршрут. */
  onCellClick: (q: number, r: number, blind?: boolean) => void;
  /** Идём по маршруту — показываем это поверх карты. */
  walking?: boolean;
  /** Встать посреди маршрута — кружок героя в панели во время ходьбы. */
  onStop?: () => void;
  /** Вид фигурки: спрайт расы героя игрока (boar/dragon/…). */
  heroSprite?: string | null;
  /** Вид коня из состояния рейда; отсутствие коня — none. */
  heroMount?: string | null;
  /** Аватар выбранного героя для кнопки в углу карты. */
  heroAvatarUrl?: string | null;
  onPickHero?: () => void;
  /**
   * Режим героя: кнопка героя возвращает камеру к фигурке, у замка появляется
   * вход внутрь, интеллект расширяет туман. Поля нет — карта прежняя.
   */
  hero?: RaidHeroUi;
  /** Корабли на воде: "q,r" → занят ли, мой ли. */
  ships: Map<string, ShipMark>;
  /** Правки админа, ещё не выгруженные на сервер. */
  pendingCells?: Set<string>;
  /**
   * Клетки, помеченные под биом-генератор. В карту ничего не пишется — это
   * временный маркер, живущий в state экрана; кадр обводит их отдельной
   * жёлтой пунктирной линией, чтобы отличить от невыгруженных правок.
   */
  selectedForGen?: Set<string>;
  /** Режим «Объединить» (режим бога): набранные клетки и выбранный блок. */
  mergeSel?: MergeSelection;
  /** Предложенный маршрут целиком — на карте он рисуется стрелками. */
  pendingPath: Array<{ q: number; r: number; cost: number }>;
  /**
   * Что произойдёт в конце маршрута — метка показывает это и общую цену.
   * q/r — клетка ДЕЙСТВИЯ (сама постройка/объект), а не конец маршрута: по ней
   * метка достаёт имя и уровень постройки для подписи кнопки.
   */
  pendingAction?: {
    kind: "collect" | "build" | "battle" | "decor" | "dig" | "ship" | "mineplan";
    q: number;
    r: number;
    extraCost: number;
  } | null;
  /** Цены дверей «q,r» → настройка: плашка считает плату за ворота на пути. */
  doorTolls?: DoorTollMap;
  /** reach — идти только первые N шагов (энергии до цели не хватает). */
  onConfirmPath?: (reach?: number | null) => void;
  onCancelPath?: () => void;
  /** Админ видит дополнительные ресурсы (дерево/камень/золото/алмазы). */
  isAdmin?: boolean;
  /**
   * Режим бога включён: разрешаем тап по клетке в тумане (иначе кистью не
   * налить территорию в неразведанную пустоту на краю карты).
   */
  editActive?: boolean;
  /** Полноэкранный режим (только карта, без шапки и навигации). */
  fullscreen?: boolean;
  /** Переключить полноэкранный режим. */
  onToggleFullscreen?: () => void;
  /** Клетка замка от сервера (hero.castle): в главном мире — ратуша Юпленда. */
  castleCell?: { q: number; r: number } | null;
};

