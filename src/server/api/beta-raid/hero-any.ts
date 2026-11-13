// «Любой герой редкости X» — псевдо-шаблон скупки ломбарда (владелец, 22.10.2026:
// «по редкости и героев — за золото»). refId вида hero_any_<rarity> стоит ТОЛЬКО
// товаром витрины скупки (kind='hero', side='sell'): игрок сдаёт своего героя
// этой редкости, магазин платит выплату позиции, а герой встаёт на витрину
// покупки той же лавки с наценкой героев (market-pawn).
//
// Модуль чистый — без базы: его зовут market-money (диспетчер оплаты), проверка
// формы админа и журнал сделок; тянуть за ними мост к базе незачем. Формат один
// с клиентом (components/beta-raid/market/heroAny.ts) — правя здесь, правь и там.

export type HeroRarity = "common" | "rare" | "epic" | "legendary";

const ANY_RE = /^hero_any_(common|rare|epic|legendary)$/;

/** true → refId — псевдо-«любой герой редкости X». */
export function isHeroAny(refId: string | null | undefined): refId is `hero_any_${HeroRarity}` {
  return !!refId && ANY_RE.test(refId);
}

/** Редкость псевдо-шаблона; обычный шаблон или мусор — null. */
export function heroAnyRarity(refId: string | null | undefined): HeroRarity | null {
  const m = refId ? ANY_RE.exec(refId) : null;
  return m ? (m[1] as HeroRarity) : null;
}

/**
 * Сданный герой в квитанции списания: ключ снимка (op — тот же payRef сделки),
 * копия предмета и шаблон. По op откат достаёт снимок и возвращает героя
 * целиком — с уровнем, навыками и заклинаниями (hero-pawn-take.restorePawnHeroes).
 */
export type PawnHeroRef = { op: string; itemId: string; templateId: string };
