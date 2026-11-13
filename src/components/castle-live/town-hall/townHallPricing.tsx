import {validPrice} from "./guards";
import {createContext,useContext,type ReactNode} from 'react';
import type {Cost,TownHallModel,TownHallCommand,TownHallCommandHandler} from './contracts';
export const icons:Record<string,string>={gold:'/resources/gold.webp',wood:'/resources/wood.webp',stone:'/resources/stone.webp',diamonds:'/resources/crystal.webp'};
const labels:Record<string,string>={gold:'Золото',wood:'Дерево',stone:'Камень',diamonds:'Алмазы'};
export const TownHallContext=createContext<{model:TownHallModel|null;pending:boolean;available:boolean;renderService?:(id:string)=>ReactNode;run:(command:TownHallCommand)=>Promise<boolean>}>({model:null,pending:false,available:false,run:async()=>false});
export function useTownHall(){return useContext(TownHallContext);}
export function usePricing(){const {model,available,pending}=useTownHall();return (id:string)=>available&&!pending&&!model?.blockedPrices?.includes(id)?validPrice(model?.prices[id]):null;}
export function Price({id}:{id:string}){const {model}=useTownHall();const price=validPrice(model?.prices[id]);return price?<span className="thg-price">{price.map(p=><span key={p.currency}><img src={icons[p.currency]} alt={labels[p.currency]}/>{p.amount.toLocaleString('ru-RU')}</span>)}</span>:<>—</>;}
export function costRows(price:Cost[]|null){return(price??[]).map(p=>({name:labels[p.currency],icon:icons[p.currency],amount:p.amount.toLocaleString('ru-RU')}));}
