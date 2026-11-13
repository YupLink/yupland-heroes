// «Метеостанция» на площади замка (владелец, 28.10.2026): стоит у построивших.
// Облик — weatherStationBuildingAssets (рисунок Ангелины). Место — справа, под
// Банком и над Казино: основания других построек не задеты
// (modularWeatherStation.test, modularPlacement).
import {weatherStationBuildingAssets} from './weatherStationBuildingAssets';
import {building} from './modularCastleProfiles';
import type {SceneBuilding} from './modularCastleLayout';

export const WEATHER_STATION_BUILDING_ID='weather_station';
const look=weatherStationBuildingAssets.base;
export const WEATHER_STATION_LOOK=look.image;
export const WEATHER_STATION_X=960,WEATHER_STATION_Y=900;

/** Здание для сцены замка; null — не построено. */
export function weatherStationBuilding(built:boolean):SceneBuilding|null{
 if(!built)return null;
 const b=building(WEATHER_STATION_BUILDING_ID,'Метеостанция',look.image,WEATHER_STATION_X,WEATHER_STATION_Y,190,.5);
 return {...b,shadow:look.shadow,shadowFlipped:look.shadowFlipped,anchor:look.anchor??b.anchor,silhouette:look.silhouette??b.silhouette};
}
