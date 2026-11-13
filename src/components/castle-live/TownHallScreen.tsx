import {TownHallPurchaseSuccess,useTownHallPurchaseSuccess,type CastlePurchaseDestination} from './TownHallPurchaseSuccess';
import {appearanceKind,appearanceNames,appearanceStyles} from './castleAppearanceAccess';
/** Game adapter: existing server functions only. No local ownership or payments. */
import {TownHallLegacy} from './TownHallLegacy';
import {useMemo,useRef,type Ref} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {getTownHall,upgradeTownHall} from '@/server/api/castle-townhall/townhall-state';
import {buyCastleBuilding,buyCastleDecor} from '@/server/api/castle-townhall/townhall-buy';
import {getAuctionHouse,upgradeAuctionHouse} from '@/server/api/game-auction';
import {getCastleCasino,buildCastleCasino} from '@/server/api/slot/castle-casino';
import {newOpId} from '@/lib/opId';
import {SLOT_LIMITS} from '@/lib/townHall';
import {refreshTownHall} from './useTownHall';
import {refreshAuctionData} from '@/components/chips/auctions/auctionRefresh';
import {TownHallArchitect} from './TownHallArchitect';
import {TownHallMineOffice} from './TownHallMineOffice';
import {MINE_OFFICE_LOOK} from './modularMineOffice';
import {TownHallWeatherStation} from './TownHallWeatherStation';
import {WEATHER_STATION_LOOK} from './modularWeatherStation';
import {TownHallNewspaperKiosk} from './TownHallNewspaperKiosk';
import {NEWSPAPER_KIOSK_LOOK} from './modularNewspaperKiosk';
import {TownHallShamanHut} from './TownHallShamanHut';
import {SHAMAN_HUT_LOOK} from './modularShamanHut';
import {MINE_OFFICE_KIND,WEATHER_STATION_KIND,SHAMAN_HUT_KIND,NEWSPAPER_KIOSK_KIND} from '@/lib/townHallCatalog';
import {TownHallPresentation} from './town-hall/TownHallPresentation';
import type {TownHallModel,Cost,TownHallCommand} from './town-hall/contracts';
import hall from './town-hall/assets/shared/town-hall-png-optimized.webp';
import market from './town-hall/assets/shared/market-png-optimized.webp';
import tavern from './town-hall/assets/shared/tavern-png-optimized.webp';
import camp from './town-hall/assets/shared/training-camp-png-optimized.webp';
import warehouse from './town-hall/assets/shared/warehouse-png-optimized.webp';
import glory from './town-hall/assets/shared/glory-png-optimized.webp';
import notice from './town-hall/assets/shared/notice.webp';
import {BANK_LOOK} from './modularBank';
import ARCHITECT_LOOK from './town-hall/assets/shared/architect.webp';
import CASINO_LOOK from './town-hall/assets/town-hall-casino.webp';
import {auctionHouseLook} from './modularAuctionHouse';
import auctionBase from './town-hall/assets/town-hall-auction-l1.webp';
import temple from './town-hall/assets/shared/temple-png-optimized.webp';
const KEY=['townhall-catalogue-data'] as const;
const MINE_OFFICE_NAME='Управление шахтами';
const WEATHER_STATION_NAME='Метеостанция';
const NEWSPAPER_KIOSK_NAME='Газетный киоск';
const SHAMAN_HUT_NAME='Хижина шаманов';
async function read(){const [hall,auction,casino]=await Promise.all([getTownHall(),getAuctionHouse(),getCastleCasino()]);return{hall,auction,casino};}
function cost(value:Record<string,number>|null|undefined):Cost[]|null{if(!value)return null;const rows=Object.entries(value).filter(([,v])=>v>0).map(([currency,amount])=>({currency,amount}) as Cost);return rows.length?rows:null;}
function adapt(data:Awaited<ReturnType<typeof read>>,revision:string):TownHallModel{
 const t=data.hall,a=data.auction,c=data.casino;
 const base=[['hall','Ратуша',hall],['market','Рынок',market],['tavern','Таверна',tavern],['bank','Банк',BANK_LOOK],['training','Тренировочный лагерь',camp],['warehouse','Склад',warehouse],['glory','Слава',glory],['notice','Задания',notice]].map(([id,name,art])=>({id,name,art,level:id==='hall'?String(t.level):'—'}));
 const buildings=[...base,...t.buildings.map(b=>({id:b.kind,name:b.kind==='temple'?'Храм':b.kind===MINE_OFFICE_KIND?MINE_OFFICE_NAME:b.kind===WEATHER_STATION_KIND?WEATHER_STATION_NAME:b.kind===SHAMAN_HUT_KIND?SHAMAN_HUT_NAME:b.kind===NEWSPAPER_KIOSK_KIND?NEWSPAPER_KIOSK_NAME:b.kind,art:b.kind==='temple'?temple:b.kind===MINE_OFFICE_KIND?MINE_OFFICE_LOOK:b.kind===WEATHER_STATION_KIND?WEATHER_STATION_LOOK:b.kind===SHAMAN_HUT_KIND?SHAMAN_HUT_LOOK:b.kind===NEWSPAPER_KIOSK_KIND?NEWSPAPER_KIOSK_LOOK:null,level:'—'})),...(a.level>0?[{id:'auction',name:'Аукционный дом',art:a.level===1?auctionBase:auctionHouseLook(a.level),level:String(a.level)}]:[]),...(c.built?[{id:'casino',name:'Казино',art:CASINO_LOOK,level:'1'}]:[]),...(t.legacy.architect?[{id:'architect',name:'Архитектор рудников',art:ARCHITECT_LOOK,level:'—'}]:[])];
 const prices:Record<string,unknown>={[`capacity:${t.level+1}`]:cost(t.cost),'building:9':a.level===0?cost(a.cost):null,'upgrade:auction':a.level>0?cost(a.cost):null,'building:10':c.built?null:cost(c.cost)};
 const ownedBundles=appearanceNames.filter(name=>t.decor.owned.includes(appearanceKind(name)!));
 for(const name of appearanceNames){const gold=t.decor.prices[appearanceKind(name)!];if(t.pricesOpen&&Number.isSafeInteger(gold)&&gold>0)prices[`decor:${name}`]=[{currency:'gold',amount:gold}];}
 const blockedPrices:string[]=[];
 for(const offer of t.catalog){const key=offer.kind==='temple'?'building:11':offer.kind===MINE_OFFICE_KIND?'building:13':offer.kind===WEATHER_STATION_KIND?'building:15':offer.kind===SHAMAN_HUT_KIND?'building:16':offer.kind===NEWSPAPER_KIOSK_KIND?'building:17':`building:${offer.kind}`;prices[key]=cost(offer.cost);if(offer.problem==='level'||offer.problem==='max')blockedPrices.push(key);}
 return {revision,buildings,casinoClosed:c.closed===true,services:[...(t.legacy.architect?[]:[{id:"architect",name:"Архитектор рудников",art:ARCHITECT_LOOK,level:"0"}]),...(t.buildings.some(b=>b.kind===MINE_OFFICE_KIND)?[]:[{id:MINE_OFFICE_KIND,name:MINE_OFFICE_NAME,art:MINE_OFFICE_LOOK,level:"0"}]),...(t.buildings.some(b=>b.kind===WEATHER_STATION_KIND)?[]:[{id:WEATHER_STATION_KIND,name:WEATHER_STATION_NAME,art:WEATHER_STATION_LOOK,level:"0"}]),...(t.buildings.some(b=>b.kind===SHAMAN_HUT_KIND)?[]:[{id:SHAMAN_HUT_KIND,name:SHAMAN_HUT_NAME,art:SHAMAN_HUT_LOOK,level:"0"}]),...(t.buildings.some(b=>b.kind===NEWSPAPER_KIOSK_KIND)?[]:[{id:NEWSPAPER_KIOSK_KIND,name:NEWSPAPER_KIOSK_NAME,art:NEWSPAPER_KIOSK_LOOK,level:"0"}])],level:t.level,used:t.slots.used,resources:t.resources,levels:SLOT_LIMITS.map((purchaseLimit,i)=>({level:i+1,purchaseLimit,priceId:`capacity:${i+1}`})),prices,blockedPrices,upgrades:{auction:{maxLevel:a.maxLevel,nextLevel:a.cost?a.level+1:null,effect:a.nextFeePct==null?null:`Комиссия: ${a.feePct}% → ${a.nextFeePct}%`,priceId:'upgrade:auction'},casino:{maxLevel:1,nextLevel:null,effect:null,priceId:'upgrade:casino'}},decor:[...ownedBundles],buildingStyles:['Базовый',...ownedBundles.filter(n=>n!=='Базовый')],activeBuildingStyle:null};
 // Bundles use the existing atomic decor purchase. No client prices or local ownership.
}
function ConnectedTownHallScreen({ru,onBack,backRef,onMakeMainCastle,isMainCastle=false,mainCastleConfirmed=false}:{ru:boolean;onBack:()=>void;backRef?:Ref<HTMLButtonElement>;onMakeMainCastle?:()=>void;isMainCastle?:boolean;mainCastleConfirmed?:boolean}){
 const purchaseSuccess=useTownHallPurchaseSuccess();
 const qc=useQueryClient(),q=useQuery({queryKey:KEY,queryFn:read,retry:1,staleTime:15000});
 const model=useMemo(()=>q.data?adapt(q.data,String(q.dataUpdatedAt)):null,[q.data,q.dataUpdatedAt]);
 const operations=useRef(new Map<string,string>());
 const onCommand=async(command:TownHallCommand)=>{
  if(!q.data)throw Error('State unavailable');
  let confirmed=false;
  const key=JSON.stringify(command);let opId=operations.current.get(key);if(!opId){opId=newOpId();operations.current.set(key,opId);}
  try{
   if(command.kind==='capacity')await upgradeTownHall({data:{fromLevel:q.data.hall.level,opId}});
   else if(command.kind==='build'&&command.id==='temple')await buyCastleBuilding({data:{kind:'temple',opId}});
   else if(command.kind==='build'&&command.id==='casino')await buildCastleCasino({data:{opId}});
   else if((command.kind==='build'||command.kind==='upgrade')&&command.id==='auction')await upgradeAuctionHouse({data:{fromLevel:q.data.auction.level,opId}});
   else if(command.kind==='buy-decor'){const kind=appearanceKind(command.id);if(!kind)throw Error('Unknown style');await buyCastleDecor({data:{kind,opId}});}
   else throw Error('Action unavailable');
   confirmed=true;operations.current.delete(key);
   if(command.kind==='build')purchaseSuccess({kind:'building',id:command.id});
   if(command.kind==='buy-decor')purchaseSuccess({kind:'appearance',id:appearanceKind(command.id)!});
  }finally{
   refreshTownHall(qc);refreshAuctionData(qc);
   void qc.invalidateQueries({queryKey:['castle-casino']});
   void qc.invalidateQueries({queryKey:KEY});
  }
  try{const fresh=await qc.fetchQuery({queryKey:KEY,queryFn:read,staleTime:0});return adapt(fresh,String(qc.getQueryState(KEY)?.dataUpdatedAt??Date.now()));}
  catch(error){if(!confirmed)throw error;return adapt(q.data,String(q.dataUpdatedAt));}
 };
 return <TownHallPresentation renderService={id=>id==="architect"?<TownHallArchitect ru={ru}/>:id===MINE_OFFICE_KIND?<TownHallMineOffice ru={ru}/>:id===WEATHER_STATION_KIND?<TownHallWeatherStation ru={ru}/>:id===SHAMAN_HUT_KIND?<TownHallShamanHut ru={ru}/>:id===NEWSPAPER_KIOSK_KIND?<TownHallNewspaperKiosk ru={ru}/>:null} ru={ru} onBack={onBack} backRef={backRef} onMakeMainCastle={onMakeMainCastle} mainCastleConfirmed={isMainCastle||mainCastleConfirmed} model={model} onCommand={onCommand} loading={q.isPending} error={q.isError?(ru?'Не удалось загрузить ратушу':'Could not load the Town Hall'):undefined} onRetry={()=>{void q.refetch();}}/>;
}

export function TownHallScreen(props:Parameters<typeof ConnectedTownHallScreen>[0]&{onOpenEditor?:(destination:CastlePurchaseDestination)=>void}){return <TownHallPurchaseSuccess ru={props.ru} onOpenEditor={props.onOpenEditor}>{props.ru?<ConnectedTownHallScreen {...props}/>:<TownHallLegacy ru={false} onBack={props.onBack} backRef={props.backRef} onMakeMainCastle={props.onMakeMainCastle} isMainCastle={props.isMainCastle||props.mainCastleConfirmed}/>}</TownHallPurchaseSuccess>;}


