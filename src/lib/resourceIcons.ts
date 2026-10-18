// Картинки ресурсов: дерево, золото, камень, кристаллы, лайки, энергия.
//
// Лежат в public/resources и подставляются по коду — так же, как спрайты
// героев (`/heroes/{sprite}.png`) и кораблей. Пиксель-арт уже подготовлен:
// белый лист вырезан, поля обрезаны, размер 128 px — гекс на экране около
// 56 px, остальное запас на ретину и зум. Каждый файл весит 5–9 КБ вместо
// исходных 300–650 КБ, поэтому их можно грузить пачкой и держать в тайл-кэше.
//
// ⚠️ Рисовать на карте — ТОЛЬКО через кэш картинок (useImageCache) и готовые
// тайлы: прямой new Image() на каждую клетку съедает кадр на телефоне.

/** Ресурсы, у которых есть картинка. */
export type ResourceCode = "wood" | "gold" | "stone" | "crystal" | "likes" | "energy";

export type ResourceIcon = {
  code: ResourceCode;
  /** Путь для <img src> и для загрузчика картинок канваса. */
  src: string;
  ru: string;
  en: string;
  /**
   * Живой ресурс игры или пока только облик.
   *
   * Лайки и энергия работают давно; дерево, золото, камень и кристаллы
   * заведены как картинки заранее — механики за ними ещё нет, и выдавать их
   * в наградах нечем. Флаг нужен, чтобы не предлагать их там, где сумма
   * должна куда-то начисляться.
   */
  live: boolean;
};

export const RESOURCE_ICONS: Record<ResourceCode, ResourceIcon> = {
  wood: { code: "wood", src: "/resources/wood.webp", ru: "Дерево", en: "Wood", live: false },
  gold: { code: "gold", src: "/resources/gold.webp", ru: "Золото", en: "Gold", live: false },
  stone: { code: "stone", src: "/resources/stone.webp", ru: "Камень", en: "Stone", live: false },
  crystal: {
    code: "crystal",
    src: "/resources/crystal.webp",
    ru: "Кристаллы",
    en: "Crystals",
    live: false,
  },
  likes: { code: "likes", src: "/resources/likes.webp", ru: "Лайки", en: "Likes", live: true },
  energy: { code: "energy", src: "/resources/energy.webp", ru: "Энергия", en: "Energy", live: true },
};

/** Все ресурсы списком — для палитр и выпадающих списков. */
export const RESOURCE_LIST: ResourceIcon[] = Object.values(RESOURCE_ICONS);

/** Путь к картинке по коду; неизвестный код — пусто, а не битая ссылка. */
export function resourceIconSrc(code: string | null | undefined): string | null {
  if (!code) return null;
  return RESOURCE_ICONS[code as ResourceCode]?.src ?? null;
}

/**
 * Иконка ресурса в маркете. В маркете кристаллы зовутся `diamonds`, а картинка
 * лежит под именем `crystal` — переводим. Билеты/токен картинок не имеют →
 * пусто, вызывающий рисует запасную иконку.
 */
export function marketResourceIconSrc(code: string | null | undefined): string | null {
  const src = resourceIconSrc(code === "diamonds" ? "crystal" : code);
  // WebP — новая версия файлов, старый кэш (PNG) не совпадёт по URL.
  return src ?? null;
}
