/** Fixed three-mask pool. Coordinates select an appearance, not persistent cell state. */
export function puddleVariant(q:number,r:number):number {
 let h=Math.imul(q+71,374761393)^Math.imul(r+91,668265263);
 h=Math.imul(h^(h>>>13),1274126177);
 const bucket=((h^(h>>>16))>>>0)%5;
 return bucket<2?0:bucket-1;
}
export function makePuddleTexture(variant:number):HTMLCanvasElement {
 const tile=document.createElement('canvas');tile.width=tile.height=128;
 const g=tile.getContext('2d')!;const pixels=g.createImageData(128,128);
          const spots=variant===1?[[39,79,20,8]]:variant===2?[[85,49,16,7],[42,86,8,3]]:[[74,87,25,9]];
          for(let y=0;y<128;y++)for(let x=0;x<128;x++){
            for(const [cx,cy,rx,ry] of spots){
              const u=(x-cx)/rx,v=(y-cy)/ry,angle=Math.atan2(v,u);
              const edge=1+.10*Math.sin(angle*3+cx)+.07*Math.cos(angle*5+cy);
              const d=Math.hypot(u,v)/edge;
              if(d>1.14)continue;
              const i=(y*128+x)*4,rim=d>1;
              const highlight=!rim&&v<-.32&&d>.65;
              const opacity=rim?.30:highlight?.70:.68;
              const color=rim?[42,47,35]:highlight?[171,194,193]:[83+v*8,112+v*10,119+v*12];
              for(let c=0;c<3;c++)pixels.data[i+c]=color[c];
              pixels.data[i+3]=Math.round(opacity*255);
            }
          }
 g.putImageData(pixels,0,0);return tile;
}
