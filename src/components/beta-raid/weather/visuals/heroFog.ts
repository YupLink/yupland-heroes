import { R, axialToPixel, hexDisc, hexRound } from '../../hexGeometry';

export type FogPoint = {x:number;y:number};
// Outline the UNION of complete hexes. Shared edges are removed, so neither
// antialias seams nor a circular approximation can fog the two clear rings.
export function fogBoundary(radius:number): FogPoint[] {
 const edges=new Map<string,{a:FogPoint;b:FogPoint}>();
 const key=(p:FogPoint)=>`${Math.round(p.x*1000)},${Math.round(p.y*1000)}`;
 for(const cell of hexDisc(0,0,radius)) {
  const c=axialToPixel(cell.q,cell.r,0,0);
  const v=Array.from({length:6},(_,i)=>({x:c.x+R*Math.cos((60*i-30)*Math.PI/180),y:c.y+R*Math.sin((60*i-30)*Math.PI/180)}));
  for(let i=0;i<6;i++) {
   const a=v[i],b=v[(i+1)%6],forward=key(a)+'/'+key(b),reverse=key(b)+'/'+key(a);
   if(edges.has(reverse))edges.delete(reverse);else edges.set(forward,{a,b});
  }
 }
 const next=new Map([...edges.values()].map(e=>[key(e.a),e.b]));
 const start=edges.values().next().value!.a,points=[start];
 let at=start;
 for(let i=0;i<edges.size;i++){at=next.get(key(at))!;points.push(at);}
 return points;
}
// Convex envelope removes the cell-by-cell teeth; opacity fades across a
// world-space band, so zooming never changes its size relative to the map.
function hull(points:FogPoint[]){
 const sorted=[...points].sort((a,b)=>a.x-b.x||a.y-b.y);
 const cross=(a:FogPoint,b:FogPoint,c:FogPoint)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 const half=(list:FogPoint[])=>{const out:FogPoint[]=[];for(const p of list){while(out.length>1&&cross(out[out.length-2],out[out.length-1],p)<=.00001)out.pop();out.push(p)}return out};
 return [...half(sorted).slice(0,-1),...half(sorted.reverse()).slice(0,-1)];
}
export function fogEdgeOpacity(distance:number,width:number){return smooth(Math.max(0,Math.min(1,distance/width)))}
// Маски и текстура тумана считаются по пикселю (до ~0,7 с на телефоне) — один
// раз за сессию: смена погоды на туман второй раз уже без заминки (31.10.2026).
// Расстояние — минимум квадратов и один корень (тот же результат, без hypot).
// 06.11.2026: и первый раз без заминки — считаем строками порциями по ~6 мс между
// кадрами (sliced), туман проявляется, когда готов. Одним куском это было зависание
// 0,5–0,7 с на входе в игру при тумане (замер на проде, телефон ×8).
type RowJob={size:number;row:(y:number)=>void;finish:()=>void};
type Mask={canvas:HTMLCanvasElement;extent:number};
function softMaskJob(radius:number,width:number,outward:boolean):{job:RowJob;mask:Mask}{
 const polygon=hull(fogBoundary(radius));
 const extent=Math.ceil(Math.max(...polygon.map(p=>Math.max(Math.abs(p.x),Math.abs(p.y))))+width+4);
 const size=Math.min(512,Math.ceil(extent*2/3)),canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const g=canvas.getContext('2d')!,image=g.createImageData(size,size);
 const edges=polygon.map((a,i)=>{const b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dy=b.y-a.y;return {ax:a.x,ay:a.y,dx,dy,len2:dx*dx+dy*dy}});
 const row=(y:number)=>{for(let x=0;x<size;x++){
  const px=(x+.5)/size*extent*2-extent,py=(y+.5)/size*extent*2-extent;
  let best=Infinity,inside=true;
  for(const e of edges){
   const rx=px-e.ax,ry=py-e.ay;
   if(e.dx*ry-e.dy*rx<0)inside=false;
   const t=Math.max(0,Math.min(1,(rx*e.dx+ry*e.dy)/e.len2));
   const qx=rx-t*e.dx,qy=ry-t*e.dy,d2=qx*qx+qy*qy;
   if(d2<best)best=d2;
  }
  const distance=Math.sqrt(best);
  const signed=inside?-distance:distance;
  const alpha=outward?1-fogEdgeOpacity(signed,width):fogEdgeOpacity(-signed,width);
  image.data[(y*size+x)*4+3]=Math.round(alpha*255);
 }};
 return {job:{size,row,finish:()=>g.putImageData(image,0,0)},mask:{canvas,extent}};
}
const smooth=(v:number)=>v*v*(3-2*v);
// Хэш узлов решётки — таблицей на период: те же числа, без синуса на каждый пиксель.
const hashTables=new Map<number,Float64Array>();
function hashTable(period:number){
 let t=hashTables.get(period);
 if(!t){t=new Float64Array(period*period);for(let a=0;a<period;a++)for(let b=0;b<period;b++){const n=Math.sin(a*127.1+b*311.7)*43758.5453;t[a*period+b]=n-Math.floor(n)}hashTables.set(period,t)}
 return t;
}
function noise(x:number,y:number,period=8){
 const ix=Math.floor(x),iy=Math.floor(y),fx=smooth(x-ix),fy=smooth(y-iy);
 const table=hashTable(period);
 const hash=(a:number,b:number)=>{a=((a%period)+period)%period;b=((b%period)+period)%period;return table[a*period+b]};
 const a=hash(ix,iy)*(1-fx)+hash(ix+1,iy)*fx,b=hash(ix,iy+1)*(1-fx)+hash(ix+1,iy+1)*fx;
 return a*(1-fy)+b*fy;
}
// A cached feathered texture, not full-screen filters or per-frame pixel noise.
function featherJob():{job:RowJob;tile:HTMLCanvasElement}{
 const tile=document.createElement('canvas');tile.width=tile.height=512;
 const g=tile.getContext('2d')!,pixels=g.createImageData(512,512);
 const row=(y:number)=>{for(let x=0;x<512;x++){
  const u=x/512,v=y/512;
  // Periodic domain gives a seamless pattern, with curled fine filaments.
  const warpX=noise(u*8,v*8)*1.3,warpY=noise(u*8+3,v*8+5)*1.3;
  const n=.56*noise(u*8+warpX,v*8+warpY,8)
   +.27*noise(u*16+warpX*2,v*16+warpY*2,16)
   +.12*noise(u*32+warpX*4,v*32+warpY*4,32)
   +.05*noise(u*64,v*64,64);
  const feather=smooth(Math.max(0,Math.min(1,(n-.26)/.48)));
  const i=(y*512+x)*4;
  pixels.data[i]=219;pixels.data[i+1]=229;pixels.data[i+2]=224;
  pixels.data[i+3]=Math.round(255*(.10+.58*feather));
 }};
 return {job:{size:512,row,finish:()=>g.putImageData(pixels,0,0)},tile};
}
/** Строки всех заданий порциями: не дольше SLICE_MS за раз, дальше — после кадра. */
const SLICE_MS=6;
function runSliced(jobs:RowJob[],done:()=>void){
 let j=0,y=0;
 const tick=()=>{
  const end=performance.now()+SLICE_MS;
  while(j<jobs.length){
   const job=jobs[j];
   while(y<job.size){job.row(y++);if(performance.now()>end){setTimeout(tick,0);return;}}
   job.finish();j++;y=0;
  }
  done();
 };
 setTimeout(tick,0);
}
let fogAssets:{inner:Mask;outer:Mask;texture:HTMLCanvasElement}|null=null;
let fogBuilding=false;
/** Маски и текстура — фоном, порциями; готовы — fogAssets. */
function buildFogAssets(){
 if(fogAssets||fogBuilding)return;
 fogBuilding=true;
 const inner=softMaskJob(2,56,true),outer=softMaskJob(20,110,false),texture=featherJob();
 runSliced([inner.job,outer.job,texture.job],()=>{fogAssets={inner:inner.mask,outer:outer.mask,texture:texture.tile};fogBuilding=false;});
}
type Reveal={x:number;y:number;alpha:number};
/** Only opacity changes during a step; reveal centres never slide with the hero. */
export function createFogReveal(){
 let target:FogPoint|undefined,start=0,from:Reveal[]=[];
 const sample=(time:number):Reveal[]=>{
  if(!target)return [];
  const t=time===0?1:smooth(Math.max(0,Math.min(1,(time-start)/240)));
  return [...from.map(p=>({...p,alpha:p.alpha*(1-t)})),{...target,alpha:t}].filter(p=>p.alpha>.0001);
 };
 return (hero:FogPoint,time:number)=>{
  const cell=hexRound((Math.sqrt(3)/3*hero.x-hero.y/3)/R,hero.y*2/3/R);
  const next=axialToPixel(cell.q,cell.r,0,0);
  if(!target){target=next;start=time-240;}
  else if(next.x!==target.x||next.y!==target.y){
   // Keep a bounded mixture if another step arrives before the previous fade ends.
   from=sample(time).sort((a,b)=>b.alpha-a.alpha).slice(0,3);
   const sum=from.reduce((n,p)=>n+p.alpha,0);if(sum)from.forEach(p=>p.alpha/=sum);
   target=next;start=time;
  }
  return sample(time);
 };
}
export function createHeroFog(ctx:CanvasRenderingContext2D){
 buildFogAssets();
 const reveal=createFogReveal();
 let pattern:CanvasPattern|null=null;
 let buffers:Array<{mask:Mask;canvas:HTMLCanvasElement;key:string}>=[];
 return (w:number,h:number,hero:FogPoint,offset:FogPoint,scale:number,time:number)=>{
  // Маски ещё считаются фоном — кадр без тумана, без заминки.
  if(!fogAssets)return;
  if(!pattern){
   pattern=ctx.createPattern(fogAssets.texture,'repeat')!;
   buffers=[fogAssets.inner,fogAssets.outer].map(mask=>({mask,canvas:document.createElement('canvas'),key:''}));
  }
  const weights=reveal(hero,time);
  const worldX=w/2+offset.x,worldY=h/2+offset.y,drift=time*.012;
  const texturePass=(dy:number)=>{
   ctx.save();ctx.translate(worldX+drift*scale,worldY+dy*scale);ctx.scale(scale,scale);
   ctx.fillStyle=pattern!;ctx.fillRect(-worldX/scale-drift,-worldY/scale-dy,w/scale,h/scale);ctx.restore();
  };
  const key=[w,h,ctx.canvas.width,ctx.canvas.height,worldX,worldY,scale,...weights.flatMap(p=>[p.x,p.y,p.alpha])].join('/');
  const erase=(entry:typeof buffers[number])=>{
   const {canvas,mask}=entry;
   if(entry.key!==key){
    if(canvas.width!==ctx.canvas.width||canvas.height!==ctx.canvas.height){canvas.width=ctx.canvas.width;canvas.height=ctx.canvas.height;}
    const g=canvas.getContext('2d')!;
    g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,canvas.width,canvas.height);
    g.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);
    g.globalCompositeOperation='lighter';
    for(const p of weights){g.save();g.translate(worldX+p.x*scale,worldY+p.y*scale);g.scale(scale,scale);g.globalAlpha=p.alpha;g.drawImage(mask.canvas,-mask.extent,-mask.extent,mask.extent*2,mask.extent*2);g.restore();}
    entry.key=key;
   }
   ctx.save();ctx.globalCompositeOperation='destination-out';ctx.drawImage(canvas,0,0,w,h);ctx.restore();
  };
  ctx.save();ctx.fillStyle='#c8d5ce';ctx.fillRect(0,0,w,h);
  texturePass(0);erase(buffers[1]);
  texturePass(Math.sin(time*.0003)*36+drift*.28);erase(buffers[0]);
  ctx.restore();
 };
}
