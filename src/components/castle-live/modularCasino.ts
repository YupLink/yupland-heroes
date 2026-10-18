// Казино на площади замка (владелец, 14.10.2026): у админа — сразу, у игроков —
// после постройки в Ратуше. Облик — «Казино 2» с карты, приведён к спрайту замка
// (квадрат, низ на 97 %). Место — справа, под Таверной, правее Склада:
// основания других построек не задеты (modularCasino.test, modularPlacement).
import casinoLook from '../../assets/castle-modular/casino/casino.webp';
import {building} from './modularCastleProfiles';
import type {SceneBuilding} from './modularCastleLayout';

export const CASINO_BUILDING_ID='casino';
export const CASINO_LOOK=casinoLook;
export const CASINO_X=770,CASINO_Y=1060;

/** Здание для сцены замка; null — казино не построено. */
export function casinoBuilding(built:boolean):SceneBuilding|null{
 return built?building(CASINO_BUILDING_ID,'Казино',casinoLook,CASINO_X,CASINO_Y,240,.6):null;
}
