// Банк на площади замка (владелец, 14.10.2026): у админа и у построивших (открыт
// игрокам 20.10.2026). Облик — утверждённый базовый Банк (бывшая «Казна»),
// приведённый к спрайту замка (квадрат, низ на 97 %). Место — справа, между
// Рынком и Таверной, над Казино; координаты и игровое поведение не изменены.
import bankLook from '../../assets/castle-modular/bank/bank.webp';
import {building} from './modularCastleProfiles';
import type {SceneBuilding} from './modularCastleLayout';

export const BANK_BUILDING_ID='bank';
export const BANK_LOOK=bankLook;
export const BANK_X=820,BANK_Y=780;

/** Здание для сцены замка; null — банка не видно. */
export function bankBuilding(visible:boolean):SceneBuilding|null{
 return visible?building(BANK_BUILDING_ID,'Банк',bankLook,BANK_X,BANK_Y,180,.5):null;
}
