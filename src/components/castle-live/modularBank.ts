// Банк на площади замка (владелец, 14.10.2026): пока только у админов. Облик —
// постройка игры «Банк» (монетный двор), приведена к спрайту замка (квадрат, низ
// на 97 %). Место — справа, между Рынком и Таверной, над Казино: единственное,
// где картинка и подпись никого не заслоняют (в центре банк уходил за
// Тренировочный лагерь); основания других построек, казино и аукционного дома
// любого уровня не задеты (modularBank.test, modularPlacement).
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
