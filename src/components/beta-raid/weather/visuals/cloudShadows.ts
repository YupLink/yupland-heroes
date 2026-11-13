import cloudAtlas from "./cloud-shadow-atlas-light.webp";
type Shadow={x:number;y:number;width:number;height:number;angle:number;opacity:number;seed:number;family:number};
const CELL=680;
function random(seed:number){let s=seed|0;return ()=>{s=(s+0x6d2b79f5)|0;let n=Math.imul(s^(s>>>15),1|s);n^=n+Math.imul(n^(n>>>7),61|n);return ((n^(n>>>14))>>>0)/4294967296}}
export function cloudAt(col:number,row:number):Shadow|null{
 const seed=(Math.imul(col,73856093)+Math.imul(row,19349663)+0x3e72b9)|0,r=random(seed);
 if(r()<.06)return null;
 const family=Math.floor(r()*4);
 return {x:(col+.1+r()*.8)*CELL,y:(row+.1+r()*.8)*CELL,width:760+r()*400,
  height:family===0?190+r()*90:270+r()*130,angle:(r()-.5)*2,opacity:.23+r()*.055,seed,family};
}
// Broad areas of shade with clear gaps, bound to world coordinates.
let sharedAtlas:HTMLImageElement|undefined;
const masks:HTMLCanvasElement[]=[];
export function createCloudShadows(ctx:CanvasRenderingContext2D, surface?:Path2D){
 const atlas=sharedAtlas??=new Image();if(!atlas.src)atlas.src=cloudAtlas;
 const regions=[[0,0,640,640],[660,0,620,640],[0,650,720,630],[730,650,550,630]];
 // Build flat, softly feathered shadow masks once, rather than projecting
 // the source image's illuminated cloud texture onto the terrain.

 function prepare(){
  const factor=atlas.naturalWidth/1280;
  for(const [sx,sy,sw,sh] of regions){
   const mask=document.createElement('canvas');mask.width=256;mask.height=256;
   const g=mask.getContext('2d')!;
   g.filter='blur(7px)';
   g.drawImage(atlas,sx*factor,sy*factor,sw*factor,sh*factor,16,16,224,224);
   g.filter='none';
   g.globalCompositeOperation='source-in';
   g.fillStyle='#202933';g.fillRect(0,0,256,256);
   masks.push(mask);
  }
 }
 const coverage=surface?document.createElement('canvas'):null;
 let coverageKey='',coverageX=0,coverageY=0;
 // Rasterize a world-space patch with overscan. Ordinary frames only move it;
 // rebuild on zoom, resize or when camera/wind exhaust the spare border.
 const field=document.createElement('canvas');
 const margin=128;
 let fieldKey='',anchorX=0,anchorY=0;
 let fieldWidth=0,fieldHeight=0;

 const shadows=new Map<string,Shadow|null>();
 let origin:number|undefined;
 return (w:number,h:number,offset:{x:number;y:number},scale:number,time:number)=>{
  if(!atlas.complete||!atlas.naturalWidth)return false;
  if(!masks.length)prepare();
  origin??=time;
  const elapsed=time===0?0:Math.max(0,time-origin)/1000;
  const driftX=elapsed*14,driftY=elapsed*4;
  const ox=w/2+offset.x,oy=h/2+offset.y;
  if(coverage&&surface){
   const key=[w,h,scale].join('/');
   if(key!==coverageKey||Math.abs(ox-coverageX)>margin/2||Math.abs(oy-coverageY)>margin/2){
    const width=w+margin*2,height=h+margin*2;
    const ratio=Math.min(.375,Math.sqrt(196608/(width*height)));
    coverage.width=Math.max(1,Math.floor(width*ratio));coverage.height=Math.max(1,Math.floor(height*ratio));
    const g=coverage.getContext('2d')!;
    g.scale(coverage.width/width,coverage.height/height);g.translate(margin+ox,margin+oy);g.scale(scale,scale);
    g.fillStyle='#fff';g.fill(surface);coverageKey=key;coverageX=ox;coverageY=oy;
   }
  }
  const worldX=ox+driftX*scale,worldY=oy+driftY*scale;
  const key=[w,h,scale].join('/');
  let moveX=worldX-anchorX,moveY=worldY-anchorY;
  if(fieldKey!==key||Math.abs(moveX)>margin/2||Math.abs(moveY)>margin/2){
   fieldWidth=w+margin*2;fieldHeight=h+margin*2;
   const ratio=Math.min(.375,Math.sqrt(196608/(fieldWidth*fieldHeight)));
   const width=Math.max(1,Math.floor(fieldWidth*ratio)),height=Math.max(1,Math.floor(fieldHeight*ratio));
   if(field.width!==width||field.height!==height){field.width=width;field.height=height;}
   const g=field.getContext('2d')!;
   g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,field.width,field.height);
   g.setTransform(field.width/fieldWidth,0,0,field.height/fieldHeight,0,0);
   g.save();g.translate(margin+worldX,margin+worldY);g.scale(scale,scale);
   const left=(-worldX-margin)/scale,top=(-worldY-margin)/scale;
   const right=left+fieldWidth/scale,bottom=top+fieldHeight/scale;
   for(let row=Math.floor(top/CELL)-2;row<=Math.floor(bottom/CELL)+2;row++)for(let col=Math.floor(left/CELL)-2;col<=Math.floor(right/CELL)+2;col++){
    const id=col+','+row;
    if(!shadows.has(id))shadows.set(id,cloudAt(col,row));
    const s=shadows.get(id);if(!s)continue;
    const [, ,sw,sh]=regions[s.family],height=s.width*sh/sw*.78;
    const radius=Math.hypot(s.width,height)/2;
    if(s.x+radius<left||s.x-radius>right||s.y+radius<top||s.y-radius>bottom)continue;
    g.save();g.translate(s.x,s.y);g.rotate(s.angle);g.globalAlpha=s.opacity;
    g.drawImage(masks[s.family],-s.width/2,-height/2,s.width,height);g.restore();
   }
   g.restore();fieldKey=key;anchorX=worldX;anchorY=worldY;moveX=moveY=0;
   if(shadows.size>512)shadows.clear();
  }
  ctx.drawImage(field,-margin+moveX,-margin+moveY,fieldWidth,fieldHeight);
  if(coverage){ctx.save();ctx.globalCompositeOperation='destination-in';ctx.drawImage(coverage,-margin+ox-coverageX,-margin+oy-coverageY,w+margin*2,h+margin*2);ctx.restore();}
  return true;
 };
}
