import {useEffect,useRef,useState,type Ref,type ReactNode} from 'react';
import {TownHallCatalogue} from './TownHallCatalogue';
import {canExecute} from './guards';
import {TownHallContext} from './townHallPricing';
import type {TownHallModel,TownHallCommand,TownHallCommandHandler} from './contracts';
export type {TownHallModel,TownHallCommandHandler} from './contracts';
export function TownHallPresentation({ru,onBack,backRef,onMakeMainCastle,mainCastleConfirmed=false,model=null,onCommand,loading=false,error,onRetry,renderService}:{
 ru:boolean;onBack:()=>void;backRef?:Ref<HTMLButtonElement>;onMakeMainCastle?:()=>void;mainCastleConfirmed?:boolean;
 renderService?:(id:string)=>ReactNode;model?:TownHallModel|null;onCommand?:TownHallCommandHandler;loading?:boolean;error?:string;onRetry?:()=>void;
}){
 const [current,setCurrent]=useState(model),[pending,setPending]=useState(false),[failure,setFailure]=useState<string|null>(null);
 const busy=useRef(false),generation=useRef(0);
 useEffect(()=>{setCurrent(model);setFailure(null);},[model]);
 useEffect(()=>()=>{generation.current++;},[]);
 const run=async(command:TownHallCommand)=>{
  if(!onCommand||!current||busy.current)return false;
  if(!canExecute(current,command)){setFailure(ru?"Недостаточно ресурсов или условия изменились. Обнови данные.":"Insufficient resources or conditions changed. Refresh the data.");return false;}
  const token=generation.current;busy.current=true;setPending(true);setFailure(null);
  try{const result=await onCommand(command);if(token!==generation.current)return false;if(!result||typeof result.revision!=='string'||!Array.isArray(result.buildings))throw Error('Invalid town hall response');setCurrent(result);return true;}
  catch{if(token===generation.current)setFailure(ru?'Не удалось выполнить действие. Обнови данные перед повторной попыткой.':'Action failed. Refresh the data before trying again.');return false;}
  finally{busy.current=false;setPending(false);}
 };
 return <TownHallContext.Provider value={{model:current,pending,renderService,available:!!onCommand&&!failure&&!loading&&!error,run}}>
  <div className="thg-host" aria-busy={pending||loading}>
   {(loading||error||failure)&&<div className="thg-host-error" role={loading?'status':'alert'}>{loading?(ru?'Загрузка…':'Loading…'):(failure||error)}{!loading&&onRetry&&<button type="button" onClick={onRetry}>{ru?'Обновить':'Refresh'}</button>}</div>}
   <TownHallCatalogue onBack={onBack} backRef={backRef} onMakeMainCastle={onMakeMainCastle} mainCastleConfirmed={mainCastleConfirmed}/>
  </div>
 </TownHallContext.Provider>;
}
