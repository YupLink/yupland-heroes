import {useTownHallPurchaseSuccess} from './TownHallPurchaseSuccess';
import {useRef} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {Loader2} from 'lucide-react';
import {humanError} from '@/lib/humanError';
import {newOpId} from '@/lib/opId';
import {TOWN_HALL_RES,type TownHallRes} from '@/lib/townHall';
import {NEWSPAPER_KIOSK_KIND} from '@/lib/townHallCatalog';
import {useResources} from '@/lib/hooks/useResources';
import {buyCastleBuilding} from '@/server/api/castle-townhall/townhall-buy';
import {RES_ICON} from './architect/architectIcons';
import {NEWSPAPER_KIOSK_LOOK} from './modularNewspaperKiosk';
import {refreshTownHall,useTownHall} from './useTownHall';
import {refreshNewspaperKiosk} from './useWithNewspaperKiosk';

/** Purchase card only; the newspaper reading screen is released separately. */
export function TownHallNewspaperKiosk({ru}:{ru:boolean}){
 const purchaseSuccess=useTownHallPurchaseSuccess();
 const q=useTownHall(),qc=useQueryClient(),res=useResources().data;
 const op=useRef<string|null>(null);
 const buy=useMutation({
  mutationFn:()=>{op.current??=newOpId();return buyCastleBuilding({data:{kind:NEWSPAPER_KIOSK_KIND,opId:op.current}});},
  onSuccess:()=>{purchaseSuccess({kind:'building',id:'newspaper_kiosk'});op.current=null;toast.success(ru?'Газетный киоск построен':'Newspaper kiosk built');},
  onError:(e:unknown)=>toast.error(humanError(e)),
  onSettled:()=>{refreshTownHall(qc);refreshNewspaperKiosk(qc);void qc.invalidateQueries({queryKey:['townhall-catalogue-data']});},
 });
 const v=q.data,offer=v?.catalog.find(c=>c.kind===NEWSPAPER_KIOSK_KIND);
 if(q.isError&&!v)return <section className="town-hall-build" role="alert"><p>{ru?'Не удалось загрузить стоимость':'Could not load the price'}</p><button type="button" data-game-button="secondary" onClick={()=>void q.refetch()}>{ru?'Повторить':'Retry'}</button></section>;
 if(!v)return <section className="town-hall-build" role="status" aria-label={ru?'Загрузка':'Loading'}><Loader2 className="town-hall-build__spin animate-spin" aria-hidden="true"/></section>;
 const owned=v.buildings.some(b=>b.kind===NEWSPAPER_KIOSK_KIND)||(offer?.owned??0)>0;
 const have:Record<string,number>=res??v.resources;
 const short=(k:TownHallRes)=>(have[k]??0)<(offer?.cost[k]??0);
 const why=offer?.problem==='slot'?(ru?'Достигнут лимит построек. Сначала улучши ратушу.':'Building limit reached. Upgrade the Town Hall first.'):offer?.problem==='level'?(ru?`Нужен уровень ратуши ${offer.needLevel}`:`Requires Town Hall level ${offer.needLevel}`):(ru?'Занимает одно место в лимите покупки зданий':'Uses one building purchase slot');
 return <section className="town-hall-build" aria-label={ru?'Газетный киоск':'Newspaper kiosk'}>
  <div className="town-hall-build__looks"><img src={NEWSPAPER_KIOSK_LOOK} alt=""/></div>
  <div className="town-hall-build__info"><h2>{ru?'Газетный киоск':'Newspaper kiosk'}</h2><p>{owned?(ru?'Построено':'Built'):offer?why:(ru?'Скоро':'Coming soon')}</p></div>
  {!owned&&offer&&<><div className="town-hall-build__cost">{TOWN_HALL_RES.filter(k=>offer.cost[k]>0).map(k=><span key={k} className={short(k)?'town-hall-build__lack':undefined}><img src={RES_ICON[k]} alt={ru?({wood:'Дерево',stone:'Камень',gold:'Золото',diamonds:'Алмазы'}[k]):k}/>{offer.cost[k].toLocaleString(ru?'ru-RU':'en-US')}</span>)}</div>
  <button type="button" className="town-hall-build__go" disabled={q.isFetching||buy.isPending||offer.problem!==null||TOWN_HALL_RES.some(short)} onClick={()=>buy.mutate()}>{buy.isPending?<Loader2 className="town-hall-build__spin animate-spin" aria-label={ru?'Строительство':'Building'}/>:(ru?'Построить':'Build')}</button></>}
 </section>;
}

