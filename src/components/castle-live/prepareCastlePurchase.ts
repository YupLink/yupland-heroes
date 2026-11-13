import type {QueryClient} from '@tanstack/react-query';
import {getTownHall} from '@/server/api/castle-townhall/townhall-state';
import {getAuctionHouse} from '@/server/api/game-auction';
import {getCastleCasino} from '@/server/api/slot/castle-casino';
import {getCastleArchitect} from '@/server/api/castle-architect/architect-state';
import {getMineOffice} from '@/server/api/mine-office/mine-office-own';
import {getWeatherStationOwned} from '@/server/api/weather-station/wstation-own';
import {getShamanHutOwned} from '@/server/api/shaman-hut/shaman-own';
import {getNewspaperKioskOwned} from '@/server/api/newspaper-kiosk/kiosk-own';
import type {CastlePurchaseDestination} from './TownHallPurchaseSuccess';

/** Read server ownership into the editor caches before offering placement. Never grants ownership locally. */
export async function prepareCastlePurchase(qc:QueryClient,destination:CastlePurchaseDestination){
 const hall=await qc.fetchQuery({queryKey:['castle-townhall'],queryFn:()=>getTownHall(),staleTime:0});
 let ready=false;
 if(destination.kind==='appearance')ready=hall.decor.owned.includes(destination.id);
 else switch(destination.id){
  case 'auction': ready=(await qc.fetchQuery({queryKey:['auction-house'],queryFn:()=>getAuctionHouse(),staleTime:0})).level>0;break;
  case 'casino': ready=(await qc.fetchQuery({queryKey:['castle-casino'],queryFn:()=>getCastleCasino(),staleTime:0})).built;break;
  case 'architect': ready=(await qc.fetchQuery({queryKey:['castle-architect'],queryFn:()=>getCastleArchitect(),staleTime:0})).level>0;break;
  case 'mine_office': ready=(await qc.fetchQuery({queryKey:['mine-office','owned'],queryFn:()=>getMineOffice(),staleTime:0})).owned;break;
  case 'weather_station': ready=(await qc.fetchQuery({queryKey:['weather-station','owned'],queryFn:()=>getWeatherStationOwned(),staleTime:0})).owned;break;
  case 'shaman_hut': ready=(await qc.fetchQuery({queryKey:['shaman-hut','owned'],queryFn:()=>getShamanHutOwned(),staleTime:0})).owned;break;
  case 'newspaper_kiosk': ready=(await qc.fetchQuery({queryKey:['newspaper-kiosk','owned'],queryFn:()=>getNewspaperKioskOwned(),staleTime:0})).owned;break;
  default: ready=hall.buildings.some(b=>b.kind===destination.id);
 }
 if(!ready)throw Error('Purchased item is not available in the editor yet');
}
