import { buildCells, type Stack } from '@/components/beta-raid/warehouseGrid';
import { marketResourceIconSrc } from '@/lib/resourceIcons';
import { boostEffectText, type BoostEffect } from '@/lib/hero/boost';
import type { StoredItem } from './WarehouseScreen';

export function warehouseImage(s:{image:string|null;stackKey:string;refId?:string|null}){const resource=s.refId??(s.stackKey.startsWith('resource:')?s.stackKey.slice(9):s.stackKey);return s.image??(resource?marketResourceIconSrc(resource):undefined)??undefined;}
type Details = {stackKey:string;boost?:BoostEffect[]|null};
export function warehouseItems(stacks: readonly Stack[], lang:'ru'|'en', details:readonly Details[]=[]):StoredItem[] {
  return buildCells(stacks,0).flatMap(cell=> {
    if(!cell)return [];
    const s=cell.stack;
    const boost=details.find(d=>d.stackKey===s.stackKey)?.boost??[];
        return [{id:cell.key,stackKey:s.stackKey,name:s.name,count:cell.units,maxCount:s.count,kind:s.kind,potion:!!s.potion,
      image:warehouseImage(s),
      usable:boost.length>0&&s.count>=1,
      effects:boost.map(e=>{const label=boostEffectText(e,lang),tail=lang==='ru'?` на ${e.minutes} мин`:` for ${e.minutes} min`;return label.endsWith(tail)?{label:label.slice(0,-tail.length),duration:`${e.minutes} ${lang==='ru'?'мин':'min'}`}:{label};}),
    }];
  });
}
