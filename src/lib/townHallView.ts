// Город глазами игрока — то, что окно постройки показывает у ратуши и у
// построек голодающего города. Отдельно от buildingEffect.types: тот на пределе
// 250 строк, а сюда ре-экспорт не нужен — союз BuildingExtra берёт типы прямо.
import type { MarketKind } from "./marketItem";

/** Что жители едят за сутки: одна строка на товар. */
export type TownEatLine = {
  kind: MarketKind;
  /** Ключ ресурса (иконка и подпись у клиента) или id шаблона. */
  refId: string | null;
  token: string | null;
  /** Имя и картинка шаблона (не для ресурсов: им подпись даёт словарь). */
  name: string | null;
  image: string | null;
  /** Сколько город съедает за сутки. */
  perDay: number;
  /** Сегодняшней еды не хватает: запас меньше суточной нормы. */
  short: boolean;
};

/** Ратуша: справка о городе — жители и их суточная еда (владелец, 03.10.2026). */
export type TownHallExtra = {
  kind: "town_hall";
  /** Название города из пульта ратуши; null — админ его не задал. */
  name?: string | null;
  residents: number;
  eats: TownEatLine[];
  /** Город голодает: привязанные лавки только принимают еду. */
  starving: boolean;
};

/** Окно постройки рисует город своим блоком (town/TownExtra). */
export function isTownExtra(extra: { kind: string } | null | undefined): extra is TownHallExtra {
  return extra?.kind === "town_hall";
}
