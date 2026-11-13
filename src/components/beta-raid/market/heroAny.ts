// Псевдо-товар «любой герой редкости X» (refId вида `hero_any_<rarity>`) глазами
// КЛИЕНТА: редкость и картинка ломбарда. Ставится только в скупку (ломбард
// героев, владелец 22.10.2026) — игрок выбирает, какого героя сдать.
//
// Регулярка своя, а не из server/api/beta-raid/hero-any.ts — по той же причине,
// что у artAnyIcon: компонент не должен тянуть серверные модули. Формат один на
// оба конца — правя здесь, правь и там.
import type { ArtRarity } from "./artAnyIcon";

const ANY_RE = /^hero_any_(common|rare|epic|legendary)$/;

/** Редкость псевдо-шаблона героя. Обычный шаблон, пусто или мусор — null. */
export function heroAnyRarity(refId: string | null | undefined): ArtRarity | null {
  const m = refId ? ANY_RE.exec(refId) : null;
  return m ? (m[1] as ArtRarity) : null;
}

/**
 * Картинка ломбарда по редкости — своя корзина «HEROES» (владелец, 23.10.2026),
 * не «SALE» артефактов. Берётся и для уже выставленных позиций: картинка,
 * записанная в строке товара, у «любого героя» не главнее этой.
 */
export function heroAnyIconSrc(refId: string | null | undefined): string | null {
  const rarity = heroAnyRarity(refId);
  return rarity ? `/market/pawn-hero-${rarity}.webp` : null;
}

/** Пункты админского пикера (подписи — как у «любого артефакта» в том же пикере). */
export const HERO_ANY_OPTIONS = [
  { id: "hero_any_common", name: "Любой обычный герой" },
  { id: "hero_any_rare", name: "Любой редкий герой" },
  { id: "hero_any_epic", name: "Любой эпический герой" },
  { id: "hero_any_legendary", name: "Любой легендарный герой" },
] as const;
