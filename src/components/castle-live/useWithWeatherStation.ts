// «Метеостанция»: есть ли здание (иконка у «Добычи», облик на площади).
// После покупки в Ратуше ключ инвалидируется — иконка и здание появляются
// без F5 (refreshWeatherStation).
import {useMemo} from 'react';
import {useQuery,type QueryClient} from '@tanstack/react-query';
import {getWeatherStationOwned} from '@/server/api/weather-station/wstation-own';
import {WEATHER_STATION_KEY} from '@/lib/weatherStationBus';
import {withOwnedLayout} from './modularOwnedLayout';
import {WEATHER_STATION_BUILDING_ID,weatherStationBuilding} from './modularWeatherStation';
import type {SceneBuilding} from './modularCastleLayout';

export const WEATHER_STATION_OWNED_KEY=[...WEATHER_STATION_KEY,'owned'] as const;

export function refreshWeatherStation(qc:QueryClient):void{
 void qc.invalidateQueries({queryKey:WEATHER_STATION_KEY});
}

export function useWeatherStationOwned():boolean{
 const q=useQuery({queryKey:WEATHER_STATION_OWNED_KEY,queryFn:()=>getWeatherStationOwned(),staleTime:60_000,retry:1});
 return q.data?.owned===true;
}

export function useWithWeatherStation(list:SceneBuilding[]):SceneBuilding[]{
 const owned=useWeatherStationOwned();
 return useMemo(()=>withOwnedLayout(list,WEATHER_STATION_BUILDING_ID,weatherStationBuilding(owned)),[list,owned]);
}
