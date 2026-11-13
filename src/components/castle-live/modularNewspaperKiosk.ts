import {newspaperKioskBuildingAssets} from './newspaperKioskBuildingAssets';
import {building} from './modularCastleProfiles';
import type {SceneBuilding} from './modularCastleLayout';

export const NEWSPAPER_KIOSK_BUILDING_ID='newspaper_kiosk';
const look=newspaperKioskBuildingAssets.base;
export const NEWSPAPER_KIOSK_LOOK=look.image;
// Initial placement only. Existing player coordinates always take precedence.
export function newspaperKioskBuilding(owned:boolean):SceneBuilding|null{
 if(!owned)return null;
 const b=building(NEWSPAPER_KIOSK_BUILDING_ID,'Газетный киоск',look.image,950,1325,190,.42,['Газетный','киоск']);
 return {...b,shadow:look.shadow,shadowFlipped:look.shadowFlipped,anchor:look.anchor??b.anchor,silhouette:look.silhouette??b.silhouette};
}
