export function modularCastleCamera(width:number,height:number,insets:{top:number;bottom:number},zoom:number,gateX:number,editing=false){
 const fit=Math.max(.08,Math.min(width/1000,Math.max(160,height-insets.top-insets.bottom)/1430));
 const min=fit*(editing?.6:1),max=fit*2.1;
 const scale=min*Math.pow(max/min,zoom);
 const margin=editing?height*.5:0,top=insets.top+margin;
 const worldHeight=Math.max(1500,(height-insets.top)/scale)+margin/scale;
 const worldWidth=Math.max(6400,width/scale)+(editing?width/scale:0);const worldLeft=-2800-(worldWidth-6400)/2;
 return {scale,min,max,worldWidth,worldLeft,width:worldWidth*scale,height:worldHeight*scale+top,
  viewBox:`${worldLeft} ${-top/scale} ${worldWidth} ${worldHeight+top/scale}`,
  scrollLeft:(gateX-worldLeft)*scale-width/2,scrollTop:margin,top,worldHeight};
}

