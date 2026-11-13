// Облик «Метеостанции»: в комплекте шесть разных рисунков с тенями обеих сторон;
// пока тематические стили не приняты — во всех стилях замка стоит база.
import {describe,expect,it} from 'vitest';
import {WEATHER_STATION_THEMED_ACCEPTED,weatherStationBuildingAssets,weatherStationLooks} from './weatherStationBuildingAssets';

describe('облик «Метеостанции»',()=>{
 it('шесть разных рисунков, у каждого тень и отражённая тень',()=>{
  const looks=Object.values(weatherStationLooks);
  expect(looks).toHaveLength(6);
  expect(new Set(looks.map(l=>l.image)).size).toBe(6);
  for(const l of looks){
   expect(l.shadow).toBeTruthy();
   expect(l.shadowFlipped).toBeTruthy();
   expect(l.shadowFlipped).not.toBe(l.shadow);
   expect(l.anchor).toBeCloseTo(0.902,3);
   expect(l.silhouette!.split(' ').length).toBeGreaterThan(20);
  }
 });
 it('до приёмки тематических — везде база',()=>{
  expect(WEATHER_STATION_THEMED_ACCEPTED).toBe(false);
  for(const skin of Object.values(weatherStationBuildingAssets))expect(skin).toBe(weatherStationLooks.base);
 });
});
