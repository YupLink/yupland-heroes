// Статичные картинки игры: один реестр на все пути в public.
//
// Раньше пути жили строками по коду: «/castle.png» в двух местах, спрайты
// героев — в кэше картинок карты, корабли — в модуле отрисовки. Добавление
// картинки превращалось в охоту по файлам, а опечатка в пути молча давала
// пустое место на карте.
//
// Теперь порядок один: положил файл в public, вписал строку сюда — и картинка
// доступна и канвасу (через MAP_PRELOAD), и обычному <img>.
//
// ⚠️ Рисовать на карте — ТОЛЬКО через кэш картинок (useImageCache): прямой
// new Image() на каждую клетку съедает кадр на телефоне.
//
// Картинки ресурсов живут отдельным модулем (resourceIcons.ts) — у них, кроме
// пути, есть названия на двух языках и признак «живой ресурс». Реэкспорт ниже
// оставлен, чтобы искать всё равно в одном месте.
export {
  RESOURCE_ICONS,
  RESOURCE_LIST,
  resourceIconSrc,
  type ResourceCode,
  type ResourceIcon,
} from "./resourceIcons";

/** Герой без своей расы рисуется рыцарем. */
export const HERO_KNIGHT_SRC = "/hero-knight.webp";

/** Спрайты рас героя на карте — файлы public/heroes. */
export const HERO_SPRITES = ["bee", "boar", "dracat", "dragon", "unicorn", "yupik"] as const;
export type HeroSprite = (typeof HERO_SPRITES)[number];

/** Картинка героя по расе; расы нет или она незнакомая — рыцарь. */
export function heroSpriteSrc(sprite?: string | null): string {
  return sprite ? `/heroes/${sprite}.webp` : HERO_KNIGHT_SRC;
}

/** Корабль: свой, занятый чужим и ничей. */
/** Четвёртый облик — «dead»: судно без запаса хода, пока не починят досками. */
export type ShipLook = "mine" | "other" | "free" | "dead";
export const shipArtSrc = (look: ShipLook): string => `/ships/${look}.webp`;
/** Большой корабль — те же три состояния своим артом. */
export const bigShipArtSrc = (look: ShipLook): string => `/ships/big-${look}.webp`;

/**
 * Флаги: зелёный (моя шахта), красный (чужая шахта) и «зелёное дерево» — для
 * использованных мной деревьев уровней. Отдельный образ, чтобы дерево не
 * путалось с шахтой: в оба узла хочется бежать по-разному.
 */
export type FlagColor = "green" | "red" | "green-tree";
export const FLAG_ART: Record<FlagColor, string> = {
  green: "/flags/green.webp",
  red: "/flags/red.webp",
  "green-tree": "/flags/green-tree.webp",
};
export const flagSrc = (color: FlagColor): string => FLAG_ART[color];
/** Ключ флага в кэше картинок карты — чтобы отрисовка не гадала строку. */
export const flagCacheKey = (color: FlagColor): string => `flag-${color}`;

/** Прочая карта: замок, чужой лагерь, стрелка маршрута. */
export const MAP_ART = {
  castle: "/castle.png",
  camp: "/raid-camp.webp",
  routeArrow: "/route-arrow.webp",
  // Красный близнец зелёной стрелки маршрута — показывает, КУДА убежал беглец
  // (гриб/заяц), чтобы найти спрятавшегося за другим объектом.
  runnerArrow: "/runner-arrow.webp",
  // Мешочек с добычей, не влезшей в рюкзак, и он же закопанный — бугорок (§8.21).
  // Картинки владельца (29.09): 256×256, прозрачный фон; .png рядом — запасная.
  lootBag: "/raid/loot-bag.webp",
  lootMound: "/raid/loot-mound.webp",
  // Ямка от лопаты — час на клетке (владелец, 02.10): 256×125, прозрачный фон.
  digHole: "/raid/dig-hole.webp",
} as const;

/**
 * Кружки HUD поверх карты: «Добыча» (кирка) и «Подарок».
 *
 * Это обычные <img> в React-слое, а не отрисовка на канвасе, поэтому в
 * MAP_PRELOAD им делать нечего — браузер грузит их сам и кэширует.
 * Значок — золотой контур на прозрачном фоне, под ним рисуем чёрный круг.
 */
export const HUD_ART = {
  map: "/resources/raid-map.png",
  mine: "/hud/mine.png",
  gift: "/hud/gift.png",
} as const;

/** Логотип — шапка, кошелёк, дорожная карта. */
export const LOGO_SRC = "/yuplink-logo.webp";

/**
 * Значки карты, ключом в кэше картинок. Качаются, когда кадр их попросил;
 * сразу — только eager (стрелки маршрута).
 *
 * Спрайт героя здесь не значится: он зависит от расы игрока и меняется вместе
 * с ней, поэтому его заказывает сам useImageCache.
 */
export const MAP_PRELOAD: Array<{ key: string; src: string; eager?: true }> = [
  { key: "arrow", src: MAP_ART.routeArrow, eager: true },
  { key: "runner-arrow", src: MAP_ART.runnerArrow, eager: true },
  { key: "camp", src: MAP_ART.camp },
  { key: "castle", src: MAP_ART.castle },
  { key: "ship-free", src: shipArtSrc("free") },
  { key: "ship-other", src: shipArtSrc("other") },
  { key: "ship-mine", src: shipArtSrc("mine") },
  { key: "ship-big-free", src: bigShipArtSrc("free") },
  { key: "ship-big-other", src: bigShipArtSrc("other") },
  { key: "ship-big-mine", src: bigShipArtSrc("mine") },
  { key: "ship-dead", src: shipArtSrc("dead") },
  { key: "ship-big-dead", src: bigShipArtSrc("dead") },
  { key: flagCacheKey("green"), src: FLAG_ART.green },
  { key: flagCacheKey("red"), src: FLAG_ART.red },
  { key: flagCacheKey("green-tree"), src: FLAG_ART["green-tree"] },
  { key: "loot-bag", src: MAP_ART.lootBag },
  { key: "loot-mound", src: MAP_ART.lootMound },
  { key: "dig-hole", src: MAP_ART.digHole },
];
