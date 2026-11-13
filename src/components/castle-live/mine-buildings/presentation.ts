import type { BlueprintResource } from '@/lib/mineBlueprint';
export type Kind=BlueprintResource;
export type Lang='ru'|'en';
export const kinds:Kind[]=['diamonds','stone','wood','gold'];
export const names={ru:{diamonds:'Алмазная шахта',stone:'Каменная шахта',wood:'Лесопилка',gold:'Золотая шахта'},en:{diamonds:'Diamond mine',stone:'Stone mine',wood:'Sawmill',gold:'Gold mine'}};
export const groups={ru:{diamonds:'Алмазные шахты',stone:'Каменные шахты',wood:'Деревянные шахты',gold:'Золотые шахты'},en:{diamonds:'Diamond mines',stone:'Stone mines',wood:'Sawmills',gold:'Gold mines'}};
export const resNames={ru:{diamonds:'алмазы',stone:'камень',wood:'дерево',gold:'золото'},en:{diamonds:'diamonds',stone:'stone',wood:'wood',gold:'gold'}};
export const tr=(l:Lang,ru:string,en:string)=>l==='ru'?ru:en;
export function duration(ms:number,l:Lang){const minutes=Math.max(0,Math.ceil(ms/60000)),h=Math.floor(minutes/60),m=minutes%60;return h?`${h} ${tr(l,'ч','h')}${m?' '+m+' '+tr(l,'мин','min'):''}`:`${m} ${tr(l,'мин','min')}`;}
