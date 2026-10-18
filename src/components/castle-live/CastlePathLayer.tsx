import {useId} from 'react';
type PathCell=[number,number];const PATH_WIDTH=32;
export function CastlePaths({cells,textureHref,routeShape,width=PATH_WIDTH,pads=[]}:{pads?:{x:number;y:number}[];routeShape?:string;width?:number;cells:readonly PathCell[];textureHref?:string}){
 const id=useId().replace(/:/g,''),shape=routeShape??'';if(!shape)return null;
 const paving=textureHref?`url(#${id}-slabs)`:'#deceb1';
 const plazas=pads.map(p=>`M${p.x-32} ${p.y}l32 -16 32 16 -32 16Z`).join(' ');
 // The mask removes paving from the entire network at once: no internal curb at joins.
 return <g data-castle-paths="" pointerEvents="none" aria-hidden="true">
  <defs>
   <pattern id={`${id}-slabs`} width="120" height="60" patternUnits="userSpaceOnUse"><image href={textureHref} width="120" height="60" preserveAspectRatio="none"/></pattern>
   <mask id={`${id}-curb`} maskUnits="userSpaceOnUse" x="-700" y="200" width="2200" height="1450" style={{maskType:'luminance'}}>
    <path d={shape} fill="none" stroke="white" strokeWidth={width+12} strokeLinecap="round" strokeLinejoin="round"/>
    <path d={shape} fill="none" stroke="black" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"/>
   </mask>
  </defs>
  <path d={plazas} fill="#716d60" stroke="#484b45" strokeWidth="7"/>
  <path d={shape} fill="none" stroke="#484b45" strokeWidth={width+14} strokeLinecap="round" strokeLinejoin="round"/>
  <path d={shape} fill="none" stroke={paving} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"/>
  <g mask={`url(#${id}-curb)`}>
   <path d={shape} fill="none" stroke="#625f55" strokeWidth={width+12} strokeLinecap="round" strokeLinejoin="round"/>
   <path d={shape} fill="none" stroke="#a19b86" strokeWidth={width+12} strokeDasharray="9 1.5" strokeLinecap="butt" strokeLinejoin="round"/>
  </g>
  <path d={plazas} fill={paving}/>
 </g>;
}
