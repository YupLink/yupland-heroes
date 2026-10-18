import type {SceneBuilding} from './modularCastleLayout';

export type RoadSegment=[number,number,number,number];
type Point={x:number;y:number};
const MODULES:[[number,number],[number,number],[number,number],[number,number]]=[[36,18],[-36,18],[36,-18],[-36,-18]];
const MODULE_SQUARED=36*36+18*18,HALF_BORDER=23,SNAP=24;
const point=(x:number,y:number):Point=>({x,y});
const endpoints=([x1,y1,x2,y2]:RoadSegment):[Point,Point]=>[point(x1,y1),point(x2,y2)];
const distanceSquared=(a:Point,b:Point)=>(a.x-b.x)**2+(a.y-b.y)**2;
const finite=(p:Point)=>Number.isFinite(p.x)&&Number.isFinite(p.y);
const cross=(a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function pointToSegmentSquared(p:Point,a:Point,b:Point){
 const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
 const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
 return (p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;
}
function segmentDistanceSquared(a:Point,b:Point,c:Point,d:Point){
 const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);
 const boxesOverlap=Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))&&Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<=Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y));
 if(boxesOverlap&&ab1*ab2<=0&&cd1*cd2<=0)return 0;
 return Math.min(pointToSegmentSquared(a,c,d),pointToSegmentSquared(b,c,d),pointToSegmentSquared(c,a,b),pointToSegmentSquared(d,a,b));
}
function inPolygon(p:Point,poly:Point[]){
 let inside=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];
  if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
function existingEnds(segments:readonly RoadSegment[]){return segments.flatMap(s=>endpoints(s));}

/** Snap a new stroke to a nearby end, leaving a free start exactly where tapped. */
export function snapRoadStart(p:Point,segments:readonly RoadSegment[]):Point{
 let best=p,score=SNAP*SNAP;
 for(const end of existingEnds(segments)){
  const d=distanceSquared(p,end);if(d<=score){best=end;score=d;}
 }
 if(best!==p||!segments.length)return best;
 const [ox,oy]=segments[0],dx=p.x-ox,dy=p.y-oy;
 const u=Math.round(dx/72+dy/36),v=Math.round(-dx/72+dy/36);
 return point(ox+36*(u-v),oy+18*(u+v));
}

/** One gesture creates one complete isometric stroke; a tap creates nothing. */
export function makeRoadSegment(start:Point,p:Point,segments:readonly RoadSegment[]):RoadSegment|null{
 if(!finite(start)||!finite(p)||distanceSquared(start,p)<18*18)return null;
 let best:RoadSegment|null=null,score=Infinity;
 const ends=existingEnds(segments);
 for(const [mx,my] of MODULES){
  const projection=((p.x-start.x)*mx+(p.y-start.y)*my)/MODULE_SQUARED;
  const modules=Math.round(projection);if(modules<1)continue;
  const quantized=point(start.x+mx*modules,start.y+my*modules);let end=quantized;
  let snapDistance=SNAP*SNAP;
  for(const e of ends){
   const d=distanceSquared(e,quantized);if(d>snapDistance)continue;
   const n=((e.x-start.x)*mx+(e.y-start.y)*my)/MODULE_SQUARED;
   if(n<1||Math.abs(n-Math.round(n))>.001||Math.abs(cross(start,quantized,e))>.01)continue;
   end=e;snapDistance=d;
  }
  // Extend the final diagonal to the fence instead of leaving a module-sized gap.
  if(end.y<350&&my<0){const t=(330-start.y)/(end.y-start.y);end=point(start.x+(end.x-start.x)*t,330);}
  const error=distanceSquared(p,end);
  if(error<score){score=error;best=[start.x,start.y,end.x,end.y];}
 }
 return best;
}

/** All-or-nothing validation against the map and every transformed ground foundation. */
export function roadSegmentAllowed(segment:RoadSegment,buildings:readonly SceneBuilding[]):boolean{
 const [a,b]=endpoints(segment),dx=Math.abs(b.x-a.x),dy=Math.abs(b.y-a.y),modules=dx/36;
 if(!finite(a)||!finite(b)||modules<.25||Math.abs(dx-2*dy)>.001)return false;
 for(const p of [a,b])if(p.x-HALF_BORDER< -580||p.x+HALF_BORDER>1380||p.y<330||p.y+HALF_BORDER>1480)return false;
 for(const building of buildings)for(const volume of building.volumes){
  const poly=volume.base.map(([x,y])=>point(building.x+(building.mirrored?-x:x),building.y+y));
  if(poly.length<3)continue;
  const left=Math.min(...poly.map(p=>p.x))-HALF_BORDER,right=Math.max(...poly.map(p=>p.x))+HALF_BORDER;
  const top=Math.min(...poly.map(p=>p.y))-HALF_BORDER,bottom=Math.max(...poly.map(p=>p.y))+HALF_BORDER;
  if(Math.max(a.x,b.x)<left||Math.min(a.x,b.x)>right||Math.max(a.y,b.y)<top||Math.min(a.y,b.y)>bottom)continue;
  if(inPolygon(a,poly)||inPolygon(b,poly))return false;
  for(let i=0;i<poly.length;i++)if(segmentDistanceSquared(a,b,poly[i],poly[(i+1)%poly.length])<HALF_BORDER*HALF_BORDER)return false;
 }
 return true;
}

export function roadSegmentShape(segments:readonly RoadSegment[]):string{
 const valid=segments.filter(s=>s.every(Number.isFinite)&&distanceSquared(point(s[0],s[1]),point(s[2],s[3]))>.001);
 const key=(p:Point)=>`${p.x},${p.y}`,nodes=new Map<string,{p:Point;edges:number[]}>();
 valid.forEach((s,i)=>{for(const p of endpoints(s)){const k=key(p),node=nodes.get(k)||{p,edges:[]};node.edges.push(i);nodes.set(k,node);}});
 const used=new Set<number>(),paths:string[]=[];
 const trace=(origin:string,first:number)=>{
  const chain=[nodes.get(origin)!.p];let current=origin,edge=first;
  while(!used.has(edge)){
   used.add(edge);const [a,b]=endpoints(valid[edge]),next=key(a)===current?b:a;
   chain.push(next);current=key(next);
   const edges=nodes.get(current)!.edges;if(edges.length!==2)break;
   const following=edges.find(i=>!used.has(i));if(following===undefined)break;edge=following;
  }
  paths.push('M'+chain.map(p=>`${p.x} ${p.y}`).join('L'));
 };
 for(const [k,node] of nodes)if(node.edges.length!==2)for(const edge of node.edges)if(!used.has(edge))trace(k,edge);
 for(let i=0;i<valid.length;i++)if(!used.has(i))trace(key(endpoints(valid[i])[0]),i);
 return paths.join(' ');
}

/** Return the nearest stroke index, or -1 when the pointer misses every road. */
export function hitRoadSegment(p:Point,segments:readonly RoadSegment[]):number{
 let best=-1,score=SNAP*SNAP;
 segments.forEach((s,i)=>{const [a,b]=endpoints(s),d=pointToSegmentSquared(p,a,b);if(d<=score){best=i;score=d;}});
 return best;
}

/** Reject identical and fully contained collinear strokes, in either direction. */
export function roadSegmentDuplicate(candidate:RoadSegment,segments:readonly RoadSegment[]):boolean{
 const [a,b]=endpoints(candidate);if(!finite(a)||!finite(b)||distanceSquared(a,b)<.001)return false;
 return segments.some(s=>{
  const [c,d]=endpoints(s);if(Math.abs(cross(a,b,c))>.01||Math.abs(cross(a,b,d))>.01)return false;
  const along=(p:Point)=>((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/distanceSquared(a,b);
  const lo=Math.min(along(c),along(d)),hi=Math.max(along(c),along(d));
  return (lo<=.001&&hi>=1-.001)||(lo>=-.001&&hi<=1.001);
 });
}

/** Erase only the small road modules touched by the swept eraser; preserve both sides. */
export function eraseRoadPieces(segments:readonly RoadSegment[],from:Point,to:Point=from):RoadSegment[]{
 const result:RoadSegment[]=[];
 for(const s of segments){
  const [a,b]=endpoints(s),count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/Math.sqrt(MODULE_SQUARED)));
  const at=(i:number)=>point(a.x+(b.x-a.x)*i/count,a.y+(b.y-a.y)*i/count);
  let run=-1;
  for(let i=0;i<=count;i++){
   const hit=i===count||pointToSegmentSquared(at(i+.5),from,to)<=24*24;
   if(hit&&run>=0){const p=at(run),q=at(i);result.push([p.x,p.y,q.x,q.y]);run=-1;}
   else if(!hit&&run<0)run=i;
  }
 }
 return result;
}
