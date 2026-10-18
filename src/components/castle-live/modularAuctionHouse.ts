// Аукционный дом игрока на площади замка (владелец, 14.10.2026): стоит только у
// построивших, облик меняется с каждым уровнем (шатёр → … → золотой дворец).
// Место — внизу площади, между Тренировочным лагерем, Славой и Заданиями: там
// основания других построек не задеты (modularPlacement). Облики — постройки
// игры (raid_building_skin), приведены к спрайту замка: квадрат, низ на 97 %.
import l1 from '../../assets/castle-modular/auction/l1.webp';
import l2 from '../../assets/castle-modular/auction/l2.webp';
import l3 from '../../assets/castle-modular/auction/l3.webp';
import l4 from '../../assets/castle-modular/auction/l4.webp';
import l5 from '../../assets/castle-modular/auction/l5.webp';
import l6 from '../../assets/castle-modular/auction/l6.webp';
import l7 from '../../assets/castle-modular/auction/l7.webp';
import l8 from '../../assets/castle-modular/auction/l8.webp';
import l9 from '../../assets/castle-modular/auction/l9.webp';
import l10 from '../../assets/castle-modular/auction/l10.webp';
import {building} from './modularCastleProfiles';
import type {SceneBuilding} from './modularCastleLayout';

const LOOKS=[l1,l2,l3,l4,l5,l6,l7,l8,l9,l10];
export const AUCTION_BUILDING_ID='auction';

/** Облик дома этого уровня (1…10). */
export const auctionHouseLook=(level:number):string=>LOOKS[Math.min(LOOKS.length,Math.max(1,Math.floor(level)))-1];

/** Здание для сцены замка; null — дом не построен. Растёт с уровнем: 230 → 320. */
export function auctionHouseBuilding(level:number):SceneBuilding|null{
 if(!(level>=1))return null;
 const l=Math.min(LOOKS.length,Math.floor(level));
 return building(AUCTION_BUILDING_ID,'Аукционный дом',auctionHouseLook(l),430,1450,230+10*(l-1),.5,['Аукционный','дом']);
}
