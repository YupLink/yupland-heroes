import {castlePathStyle,type CastlePathStyle} from './castlePathStyles';
import {useId} from 'react';
import {pathNetworkShape,PATH_WIDTH,type PathCell} from './castlePaths';
export function CastlePaths({cells,textureHref,routeShape,width=PATH_WIDTH,pads=[],theme=castlePathStyle()}:{theme?:CastlePathStyle;pads?:{x:number;y:number}[];routeShape?:string;width?:number;cells:readonly PathCell[];textureHref?:string}){
 const id=useId().replace(/:/g,''),shape=routeShape??pathNetworkShape(cells);if(!shape)return null;
 textureHref=textureHref||theme.texture;
 const paving=textureHref?`url(#${id}-slabs)`:'#deceb1';
 const plazas=pads.map(p=>`M${p.x-32} ${p.y}l32 -16 32 16 -32 16Z`).join(' ');
 // Paint the whole network in layers so crossings share one surface and only outer edges remain.
 if(theme.ribbon)return <g data-castle-paths="" pointerEvents="none" aria-hidden="true">
  <defs><pattern id={`${id}-ribbon`} width={theme.tileWidth} height={theme.tileHeight} patternUnits="userSpaceOnUse"><image href={textureHref} width={theme.tileWidth} height={theme.tileHeight} preserveAspectRatio="none"/></pattern></defs>
  <path d={shape} fill="none" stroke={theme.ribbonPalette?.edge??"#877058"} strokeWidth={width+12} strokeLinecap="round" strokeLinejoin="round"/>
  <path d={shape} fill="none" stroke={theme.ribbonPalette?.curb??"#e4ceaa"} strokeWidth={width+9} strokeLinecap="round" strokeLinejoin="round"/>
  <path d={shape} fill="none" stroke={theme.ribbonPalette?.fill??"#cbb695"} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"/>
  <path d={shape} fill="none" stroke={`url(#${id}-ribbon)`} strokeOpacity={theme.ribbonPalette?.opacity??.52} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"/>
 </g>;
 // The mask removes paving from the entire network at once: no internal curb at joins.
 return <g data-castle-paths="" pointerEvents="none" aria-hidden="true">
  <defs>
   <pattern id={`${id}-slabs`} width={theme.tileWidth} height={theme.tileHeight} patternUnits="userSpaceOnUse"><image href={textureHref} width={theme.tileWidth} height={theme.tileHeight} preserveAspectRatio="none"/></pattern>
   <mask id={`${id}-curb`} maskUnits="userSpaceOnUse" x="-700" y="200" width="2200" height="1450" style={{maskType:'luminance'}}>
    <path d={shape} fill="none" stroke="white" strokeWidth={width+12} strokeLinecap="round" strokeLinejoin="round"/>
    <path d={shape} fill="none" stroke="black" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"/>
   </mask>
  </defs>
  <path d={plazas} fill="#716d60" stroke={theme.edge} strokeWidth="7"/>
  <path d={shape} fill="none" stroke={theme.edge} strokeWidth={width+14} strokeLinecap="round" strokeLinejoin="round"/>
  <path d={shape} fill="none" stroke={paving} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"/>
  <g mask={`url(#${id}-curb)`}>
   <path d={shape} fill="none" stroke={theme.seam} strokeWidth={width+12} strokeLinecap="round" strokeLinejoin="round"/>
   <path d={shape} fill="none" stroke={theme.curb} strokeWidth={width+12} strokeDasharray="9 1.5" strokeLinecap="butt" strokeLinejoin="round"/>
  </g>
  <path d={plazas} fill={paving}/>
 </g>;
}

