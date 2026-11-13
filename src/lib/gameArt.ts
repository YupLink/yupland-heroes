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
import { MINE_ART_PRELOAD } from "./mineArt";

/** Герой без своей расы рисуется рыцарем. */
export const HERO_KNIGHT_SRC = "/hero-knight.webp";

/** Спрайты рас героя на карте — файлы public/heroes. */
export const HERO_SPRITES = ["bee", "boar", "dracat", "dragon", "unicorn", "yupik"] as const;
export type HeroSprite = (typeof HERO_SPRITES)[number];

/**
 * Атлас пешего бега героя (8 кадров бега лицом, 8 спиной, внизу — стойки):
 * тот же, что у фигурки на карте. Версия — чтобы браузер не взял старые 3 фазы.
 */
export function heroFootAtlas(sprite: string | null | undefined): string {
  return `/hero-mounts/${sprite || "knight"}/foot.webp?v=run8-20261030`;
}

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
 * Подбитый синим динамитом (dynamite-08) — один арт на малый и большой: пиксель-арт
 * владельца (30.10.2026), ужат «ближайшим соседом» до 256×256; .png рядом — запасная.
 */
export const SHIP_BLASTED_SRC = "/ships/blasted.webp";

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
  // Лагерь, где кто-то сейчас в игре: 8 кадров в ряд по 160×209 (владелец, 09.11.2026).
  campOnline: "/raid-camp-online.webp",
  routeArrow: "/route-arrow.webp",
  // Красный близнец зелёной стрелки маршрута — показывает, КУДА убежал беглец
  // (гриб/заяц), чтобы найти спрятавшегося за другим объектом.
  runnerArrow: "/runner-arrow.webp",
  // Мешочек с добычей, не влезшей в рюкзак, и он же закопанный — бугорок (§8.21).
  // Картинки владельца (29.09): 256×256, прозрачный фон; .png рядом — запасная.
  lootBag: "/raid/loot-bag.webp",
  lootMound: "/raid/loot-mound.webp",
  // Рыба, всплывшая от красного динамита (владелец, 30.10.2026) — тот же мешочек.
  // Пиксель-арт владельца, ужат «ближайшим соседом» до 256×216; .png рядом — запасная.
  lootFish: "/raid/loot-fish.webp",
  // Ямка от лопаты — час на клетке (владелец, 02.10): 256×125, прозрачный фон.
  digHole: "/raid/dig-hole.webp",
} as const;

/**
 * Жилы золота и алмазов — накладка в гексе поверх местности (veinDraw).
 * Картинки владельца (21.10): 256×256 webp с прозрачным фоном.
 */
export const VEIN_ART = {
  gold: "/raid/veins/gold.webp",
  diamonds: "/raid/veins/diamonds.webp",
} as const;
export type VeinArtKind = keyof typeof VEIN_ART;
/** Ключ жилы в кэше картинок карты. */
export const veinArtKey = (kind: VeinArtKind): string => `vein-${kind}`;

/**
 * Кружки HUD поверх карты: «Добыча» (кирка) и «Подарок».
 *
 * Это обычные <img> в React-слое, а не отрисовка на канвасе, поэтому в
 * MAP_PRELOAD им делать нечего — браузер грузит их сам и кэширует.
 * Значок — золотой контур на прозрачном фоне, под ним рисуем чёрный круг.
 */
export const HUD_ART = {
  map: "/resources/raid-map.webp",
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
  { key: "camp-online", src: MAP_ART.campOnline },
  { key: "castle", src: MAP_ART.castle },
  { key: "ship-free", src: shipArtSrc("free") },
  { key: "ship-other", src: shipArtSrc("other") },
  { key: "ship-mine", src: shipArtSrc("mine") },
  { key: "ship-big-free", src: bigShipArtSrc("free") },
  { key: "ship-big-other", src: bigShipArtSrc("other") },
  { key: "ship-big-mine", src: bigShipArtSrc("mine") },
  { key: "ship-dead", src: shipArtSrc("dead") },
  { key: "ship-big-dead", src: bigShipArtSrc("dead") },
  { key: "ship-blasted", src: SHIP_BLASTED_SRC },
  { key: flagCacheKey("green"), src: FLAG_ART.green },
  { key: flagCacheKey("red"), src: FLAG_ART.red },
  { key: flagCacheKey("green-tree"), src: FLAG_ART["green-tree"] },
  { key: "loot-bag", src: MAP_ART.lootBag },
  { key: "loot-mound", src: MAP_ART.lootMound },
  { key: "loot-fish", src: MAP_ART.lootFish },
  { key: "dig-hole", src: MAP_ART.digHole },
  // Жилы — тоже по требованию: качаются, когда кусок карты печёт первую жилу.
  { key: veinArtKey("gold"), src: VEIN_ART.gold },
  { key: veinArtKey("diamonds"), src: VEIN_ART.diamonds },
  // Шахты: «разрушено», «можно/нельзя поставить», взрыв (lib/mineArt) — по требованию кадра.
  ...MINE_ART_PRELOAD,
];
