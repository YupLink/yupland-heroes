export function modularCastleCamera(width:number,height:number,insets:{top:number;bottom:number},zoom:number,gateX:number){
 const min=Math.max(.08,Math.min(width/1000,Math.max(160,height-insets.top-insets.bottom)/1430));
 const scale=min*Math.pow(2.1,zoom);
 const worldHeight=Math.max(1500,(height-insets.top)/scale);
 const worldWidth=Math.max(2400,width/scale);const worldLeft=-800-(worldWidth-2400)/2;
 return {scale,min,max:min*2.1,worldWidth,worldLeft,width:worldWidth*scale,height:worldHeight*scale+insets.top,
  viewBox:`${worldLeft} ${-insets.top/scale} ${worldWidth} ${worldHeight+insets.top/scale}`,
  scrollLeft:(gateX-worldLeft)*scale-width/2,scrollTop:0,top:insets.top,worldHeight};
}
