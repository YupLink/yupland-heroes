import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {useQueryClient} from '@tanstack/react-query';
import {prepareCastlePurchase} from './prepareCastlePurchase';
import {Check, X} from 'lucide-react';
import './town-hall-purchase-success.css';

export type CastlePurchaseDestination = {kind:'building';id:string}|{kind:'appearance';id:string};
const PurchaseSuccess = createContext<(destination:CastlePurchaseDestination)=>void>(()=>{});
/** Called only from a confirmed purchase response, never from a click or a refetch. */
export const useTownHallPurchaseSuccess=()=>useContext(PurchaseSuccess);

export function TownHallPurchaseSuccess({ru,onOpenEditor,children}:{ru:boolean;onOpenEditor?:(destination:CastlePurchaseDestination)=>void;children:ReactNode}){
 const qc=useQueryClient();
 const [preparing,setPreparing]=useState(false),[failure,setFailure]=useState(false);
 const activeRequest=useRef(0);
 useEffect(()=>()=>{activeRequest.current++;},[]);
 const [purchase,setPurchase]=useState<CastlePurchaseDestination|null>(null);
 const next=useRef<HTMLButtonElement>(null),previousFocus=useRef<HTMLElement|null>(null),previousDialog=useRef<HTMLElement|null>(null),content=useRef<HTMLDivElement>(null),leaving=useRef(false);
 const show=(destination:CastlePurchaseDestination)=>{previousFocus.current=document.activeElement as HTMLElement|null;previousDialog.current=previousFocus.current?.closest<HTMLElement>('[role=dialog]')??null;activeRequest.current++;setPreparing(false);setFailure(false);leaving.current=false;setPurchase(destination);};
 // Keep Escape local even when the underlying legacy window listens on window.
 useEffect(()=>{if(!purchase)return;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();activeRequest.current++;setPreparing(false);setPurchase(null);}};window.addEventListener('keydown',escape,true);return()=>window.removeEventListener('keydown',escape,true);},[purchase]);
 const dismiss=()=>{activeRequest.current++;setPreparing(false);setPurchase(null);};
 const proceed=async()=>{if(!purchase||preparing||!onOpenEditor)return;const request=++activeRequest.current;setPreparing(true);setFailure(false);try{await prepareCastlePurchase(qc,purchase);if(request!==activeRequest.current)return;leaving.current=true;setPurchase(null);onOpenEditor(purchase);}catch{if(request===activeRequest.current)setFailure(true);}finally{if(request===activeRequest.current)setPreparing(false);}};
 const appearance=purchase?.kind==='appearance';
 return <PurchaseSuccess.Provider value={show}>
  <div ref={content} style={{display:"contents"}}>{children}</div>
  <Dialog.Root open={!!purchase} onOpenChange={open=>{if(!open)dismiss();}}>
   <Dialog.Portal>
    <Dialog.Overlay className="town-hall-success-overlay"/>
    <Dialog.Content className="town-hall-success" onOpenAutoFocus={event=>{event.preventDefault();next.current?.focus();}} onCloseAutoFocus={event=>{event.preventDefault();if(leaving.current)return;requestAnimationFrame(()=>{const previous=previousFocus.current;if(previous?.isConnected&&!previous.matches(':disabled'))previous.focus();else if(previousDialog.current?.isConnected)previousDialog.current.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();else content.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();});}}>
     <span className="town-hall-success__check" aria-hidden="true"><Check size={28}/></span>
     <Dialog.Title className="town-hall-success__title">{appearance?(ru?'Тематический набор куплен':'Theme bundle purchased'):(ru?'Здание куплено':'Building purchased')}</Dialog.Title>
     <Dialog.Description className="town-hall-success__description">{appearance?(ru?'Стиль зданий и декорации доступны в редакторе замка.':'The building style and decorations are available in the castle editor.'):(ru?'Оно доступно в редакторе замка. Выбери место и поставь его.':'It is available in the castle editor. Choose a spot and place it.')}</Dialog.Description>
     {failure&&<p role="alert" className="town-hall-success__error">{ru?'Покупка завершена. Не удалось обновить редактор. Попробуй открыть его ещё раз.':'Purchase completed. Could not refresh the editor. Try opening it again.'}</p>}
     <div className="town-hall-success__actions">
      {onOpenEditor&&<button ref={next} type="button" data-game-button="primary" disabled={preparing} onClick={()=>void proceed()}>{preparing?(ru?'Открываем редактор…':'Opening editor…'):appearance?(ru?'Изменить оформление':'Change appearance'):(ru?'Разместить здание':'Place building')}</button>}
      <Dialog.Close asChild><button ref={onOpenEditor?undefined:next} type="button" data-game-button="secondary">{ru?'Позже':'Later'}</button></Dialog.Close>
     </div>
     <Dialog.Close className="town-hall-success__close" aria-label={ru?'Закрыть':'Close'}><X size={20}/></Dialog.Close>
    </Dialog.Content>
   </Dialog.Portal>
  </Dialog.Root>
 </PurchaseSuccess.Provider>;
}
