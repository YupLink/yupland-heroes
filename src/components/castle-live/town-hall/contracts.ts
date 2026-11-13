import type { Level } from './townHallCapacity';
export type Cost = {currency:'gold'|'wood'|'stone'|'diamonds';amount:number};
export type OwnedBuilding = {id:string;name:string;art:string|null;level:string};
export type UpgradeRule = {maxLevel:number|null;nextLevel:number|null;effect:string|null;priceId:string};
/** Authoritative personal account data, never inferred from map cells/layout. */
export type TownHallModel = {
  revision:string;
  buildings:OwnedBuilding[];
  services?:OwnedBuilding[];
  /** Вход через Google: казино в Ратуше не предлагается (владелец, 06.11.2026). */
  casinoClosed?:boolean;
  level:number;
  used:number;
  resources:Record<string,number>;
  blockedPrices?:string[];
  levels:Level[];
  prices:Record<string,unknown>;
  upgrades:Record<string,UpgradeRule>;
  decor:string[];
  buildingStyles:string[];
  activeBuildingStyle:string|null;
};
export type TownHallCommand =
 | {kind:'build';id:'auction'|'casino'|'temple'|'armory';priceId:string;revision:string}
 | {kind:'capacity';level:number;priceId:string;revision:string}
 | {kind:'upgrade';id:string;level:number;priceId:string;revision:string}
 | {kind:'buy-decor'|'buy-style';id:string;priceId:string;revision:string}
 | {kind:'apply-style';id:string;revision:string};
/** Resolve only after server commit, with refreshed full state; reject on failure.
 * Server must revalidate ownership, capacity, balances and revision atomically. */
export type TownHallCommandHandler = (command:TownHallCommand)=>Promise<TownHallModel>;
