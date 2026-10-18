// Псевдо-товар «любой артефакт редкости X» (refId вида `art_any_<rarity>`)
// глазами КЛИЕНТА: редкость и картинка ломбарда.
//
// ПОЧЕМУ отдельный модуль, а не строка по месту. Такой позиции нет в каталоге
// шаблонов: у неё нет ни имени, ни картинки — только редкость. Рисуют её в
// трёх местах (плитка витрины игрока, админский пикер шаблонов, пикер «какой
// артефакт отдать»), и без реестра маппинг «редкость → файл» разъехался бы по
// компонентам первой же заменой арта. Порядок как у gameArt/resourceIcons:
// положил файл в public, вписал строку сюда.
//
// ПОЧЕМУ регулярка своя, а не из server/api/beta-raid/art-rarity.ts: тот модуль
// тянет мост к базе (mcpExec), и импорт из компонента утащил бы серверный код
// в клиентский бандл. Формат псевдо-шаблона один на оба конца — правя здесь,
// правь и там.

export type ArtRarity = "common" | "rare" | "epic" | "legendary";

const ANY_RE = /^art_any_(common|rare|epic|legendary)$/;

/** Редкость псевдо-шаблона. Обычный шаблон, пусто или мусор — null. */
export function artAnyRarity(refId: string | null | undefined): ArtRarity | null {
  const m = refId ? ANY_RE.exec(refId) : null;
  return m ? (m[1] as ArtRarity) : null;
}

/**
 * Картинка ломбарда по редкости — корзина «SALE» с ободком цвета редкости.
 * Файлы лежат в public/market (192 px, прозрачный фон). Не псевдо-шаблон —
 * null: вызывающий рисует свою запасную иконку.
 */
export function artAnyIconSrc(refId: string | null | undefined): string | null {
  const rarity = artAnyRarity(refId);
  return rarity ? `/market/pawn-${rarity}.webp` : null;
}

/** Цвет редкости — тот же, что у карточек героев и инвентаря. */
export const RARITY_TINT: Record<string, string> = {
  common: "#9aa4bd",
  rare: "#5b9bff",
  epic: "#b46bff",
  legendary: "#f5c451",
};

/** Подпись редкости для админки: коротко, чтобы влезало под плитку. */
export const RARITY_SHORT: Record<string, { ru: string; en: string }> = {
  common: { ru: "обыч", en: "com" },
  rare: { ru: "ред", en: "rare" },
  epic: { ru: "эпик", en: "epic" },
  legendary: { ru: "легенд", en: "leg" },
};

/**
 * Редкость героя по ярусу шаблона — та же лестница, что на сервере
 * (heroes-list-dormant.rarityOfTemplateLevel): 5★ легендарный, 4★ эпический,
 * остальные редкие. Держим здесь, чтобы админский пикер не тянул серверный код.
 */
export function heroRarityByLevel(level: number | null | undefined): ArtRarity {
  const l = Number(level) || 0;
  if (l >= 5) return "legendary";
  if (l >= 4) return "epic";
  if (l >= 3) return "rare";
  return "common";
}

