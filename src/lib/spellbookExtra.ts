// Что окно постройки узнаёт про СТОЛБ ЗАКЛИНАНИЙ.
//
// Отдельным модулем — по той же причине, что и товар витрины (marketItemView):
// buildingEffect.types.ts держит общий союз BuildingExtra и упирается в лимит
// 250 строк на файл. Потребители берут тип оттуда же, где и раньше
// (`@/lib/buildingEffect`), — он ре-экспортится.
import type { PortalPrice } from "./portal";

/**
 * Витрина столба живёт в своём окне (getSpellPillarOffer) — здесь только цена
 * и «можно ли вообще», как у таверны и маркета. Тянуть каталог заклинаний в
 * ответ окна постройки незачем: игрок его ещё не открыл.
 */
export type SpellbookExtra = {
  kind: "spellbook";
  /** Чем платят за изучение. Пусто — столб не настроен и не работает. */
  learnPrices: PortalPrice[];
  /** Чем платят за забвение. Пусто — у этого столба забыть нельзя. */
  forgetPrices: PortalPrice[];
  can: boolean;
  reasonKey: string | null;
  reasonParams?: Record<string, string | number>;
};
