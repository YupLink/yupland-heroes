import flagstones from './castleRoadTexture';
import elvenPath from './decor-styles/assets/elven/path.webp';
import winterPath from './decor-styles/assets/winter/path.webp';
import infernalPath from './decor-styles/assets/infernal/path.webp';
import buckwheatPath from './decor-styles/assets/buckwheat/sculptural-path.webp';
import celestialPath from './decor-styles/assets/celestial/path.webp';
export type CastlePathStyle={id:string;ru:string;en:string;texture:string;tileWidth:number;tileHeight:number;curb:string;seam:string;edge:string;ribbon?:boolean;ribbonPalette?:{edge:string;curb:string;fill:string;opacity:number}};
export const castlePathStyles:CastlePathStyle[]=[{id:'base',ru:'Базовый',en:'Base',texture:flagstones,tileWidth:120,tileHeight:60,curb:'#a19b86',seam:'#625f55',edge:'#484b45'},{id:'elven',ru:'Эльфийский',en:'Elven',texture:elvenPath,tileWidth:128,tileHeight:64,curb:'#7d8d61',seam:'#405236',edge:'#34432f'},{id:'winter',ru:'Зимний',en:'Winter',texture:winterPath,tileWidth:128,tileHeight:64,curb:'#e6eff8',seam:'#71869b',edge:'#4b6177'},{id:'infernal',ru:'Адский',en:'Infernal',texture:infernalPath,tileWidth:256,tileHeight:128,curb:'#474349',seam:'#c0773c',edge:'#211d24'},{id:'buckwheat',ru:'Гречневый',en:'Buckwheat',texture:buckwheatPath,ribbon:true,tileWidth:120,tileHeight:60,curb:'#b58d61',seam:'#f5dfb9',edge:'#695443'},{id:'celestial',ru:'Небесный',en:'Celestial',texture:celestialPath,ribbon:true,ribbonPalette:{edge:'#89764e',curb:'#d8ae55',fill:'#f4e4bb',opacity:1},tileWidth:160,tileHeight:80,curb:'#d8ae55',seam:'#f4e4bb',edge:'#89764e'}];
export const castlePathStyle=(id?:string)=>castlePathStyles.find(s=>s.id===id)||castlePathStyles[0];
