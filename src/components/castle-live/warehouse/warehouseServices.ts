import type {Stack} from '@/components/beta-raid/warehouseGrid';
import type {BoostEffect} from '@/lib/hero/boost';
export type WarehouseData={own:Stack[];ownCells:number;maxCells:number;nextCost:Record<string,number>|null;resources:Record<string,number>;backpack:{stacks:Stack[];capacity?:number;potionCapacity?:number}|null};
export type WarehouseServices={
 load:()=>Promise<WarehouseData>;
 backpack:()=>Promise<{stacks:Array<{stackKey:string;boost?:BoostEffect[]|null}>;capacity?:number;occupied?:number;potionCapacity?:number}>;
 world:()=>Promise<{list:Array<{q:number;r:number;items:Array<{stackKey:string;name:string;image:string|null;count:number}>}>}>;
 store:(data:{stackKey:string;qty:number})=>Promise<unknown>;
 take:(data:{stackKey:string;qty:number})=>Promise<unknown>;
 use:(stackKey:string)=>Promise<unknown>;
 upgrade:(fromCells:number)=>Promise<{cells:number}>;
 error:(e:unknown)=>string;
};
