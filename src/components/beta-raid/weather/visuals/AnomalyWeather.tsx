import {FireRain} from './FireRain';
import {memo} from 'react';
import smoke from './infernal-smoke.webp';
import frost from './frost-border-raster.webp';
import './anomaly-weather.css';
export type WeatherAnomaly='frozen'|'infernal';
/** Static smoke/frost with a bounded CSS-only fire rain layer. */
export const AnomalyWeather=memo(function AnomalyWeather({mode}:{mode:WeatherAnomaly}){
 return <div className="raid-anomaly" data-mode={mode} aria-hidden="true">
  {mode==='frozen'?<img className="raid-anomaly__frost" src={frost} alt="" draggable={false}/>:<><img className="raid-anomaly__smoke raid-anomaly__smoke--a" src={smoke} alt="" draggable={false}/><img className="raid-anomaly__smoke raid-anomaly__smoke--b" src={smoke} alt="" draggable={false}/></>}
  {mode==='infernal'&&<FireRain/>}
 </div>;
});
