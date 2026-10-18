// Visual buttons keep the existing game window destinations.
const actions:Record<string,string>={shop:'shop',market:'market',hall:'hall',tavern:'tavern',temple:'temple',warehouse:'warehouse',training:'barracks',glory:'glory',notice:'notice',gates:'gates'};
export const modularBuildingId=(id:string)=>`castle-modular:${id}`;
export function modularBuildingDestination(id:string){return id.startsWith('castle-modular:')?actions[id.slice(15)]:undefined;}
