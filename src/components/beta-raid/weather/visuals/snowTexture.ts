/** One bounded 128px mask, baked only when the snow stage changes. */
export function makeSnowTexture(stage:number):HTMLCanvasElement {
 const tile=document.createElement('canvas');tile.width=tile.height=128;
 const g=tile.getContext('2d')!;
 const pixels=g.createImageData(128,128);
          const hash=(x:number,y:number)=>{
            let n=Math.imul(x+79,374761393)^Math.imul(y+131,668265263);
            n=Math.imul(n^(n>>>13),1274126177);
            return ((n^(n>>>16))>>>0)/4294967295;
          };
          const noise=(x:number,y:number,size:number)=>{
            const ix=Math.floor(x/size),iy=Math.floor(y/size);
            let u=x/size-ix,v=y/size-iy;u=u*u*(3-2*u);v=v*v*(3-2*v);
            return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v;
          };
          const field=(x:number,y:number)=>noise(x,y,8)*.45+noise(x,y,3)*.35+noise(x,y,1)*.20;
          const threshold=.72-stage*.053;
          for(let y=0;y<128;y++)for(let x=0;x<128;x++){
            const f=field(x,y),coverage=Math.max(0,Math.min(1,(f-threshold)*17));
            if(!coverage)continue;
            const i=(y*128+x)*4;
            const grain=hash(x+701,y+197);
            const relief=Math.max(-18,Math.min(14,(field(x-1,y-1)-field(x+1,y+1))*125));
            const edge=f<threshold+.045;
            const shade=(edge?-19:0)+relief+(grain-.5)*13;
            const color=[233+shade,241+shade,245+shade];
            for(let c=0;c<3;c++)pixels.data[i+c]=color[c];
            pixels.data[i+3]=Math.round(coverage*255);
          }
 g.putImageData(pixels,0,0);
 return tile;
}
