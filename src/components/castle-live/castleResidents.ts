import type {SceneBuilding} from './modularCastleLayout';
import {residentTextureMasks} from './residentTextureMasks';
export type Position={x:number;y:number};
/** At a given X, use the front foundation edge, not the sprite anchor. */
export function residentDrawSlot(buildings:SceneBuilding[],p:Position){
 let slot=0;
 buildings.forEach((b,index)=>{
  const x=(p.x-b.x)*(b.mirrored?-1:1),edges:number[]=[];
  for(const v of b.volumes)for(let i=0;i<v.base.length;i++){
   const a=v.base[i],q=v.base[(i+1)%v.base.length];
   if(x<Math.min(a[0],q[0])||x>Math.max(a[0],q[0]))continue;
   if(a[0]===q[0])edges.push(a[1],q[1]);
   else edges.push(a[1]+(q[1]-a[1])*(x-a[0])/(q[0]-a[0]));
  }
  const ground=b.y+(edges.length?Math.max(...edges):0);
  if(p.y>=ground-.5)slot=index+1;
 });
 return slot;
}
export const outdoorStops=new Set(['market','notice','glory']);
// Sprite-relative door thresholds. Mirroring and resizing use the building transform.
export const entranceAnchors:Record<string,[number,number]>={shop:[.64,.85],market:[.57,.88],hall:[.27,.94],tavern:[.50,.948],temple:[.48,.94],warehouse:[.34,.83],training:[.58,.88],glory:[.50,.99],notice:[.50,.94],gates:[.50,.86]};
export function entrance(b:SceneBuilding):Position{
 const [x,y]=entranceAnchors[b.id]||[.5,.96];
 return {x:b.x+(b.mirrored?-1:1)*(x-.5)*b.size,y:b.y+(y-b.anchor)*b.size};
}
export type Route={points:Position[];lengths:number[];length:number};
export function makeRoute(points:Position[]):Route{
 points=points.filter((p,i)=>!i||Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y)>.001);
 const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
 return {points,lengths,length:lengths.at(-1)||0};
}
export function atDistance(route:Route,distance:number){
 const {points,lengths}=route;let i=1;while(i<points.length-1&&lengths[i]<distance)i++;
 const a=points[i-1],b=points[i],t=Math.max(0,Math.min(1,(distance-lengths[i-1])/(lengths[i]-lengths[i-1]||1)));
 return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,dx:b.x-a.x,dy:b.y-a.y};
}
function contains(p:Position,poly:Position[]){
 let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }return inside;
}
const maskAliases:Record<string,string>={tree:'tree-planter',bench:'bench-straight',lamp:'lamp-tall'};
/** Occupancy uses the rendered opaque texture, including roof/awning overhangs. */
export function textureOccupied(b:SceneBuilding,p:Position,padding=true){
 const key=b.decor?(maskAliases[b.catalogId||'']||b.catalogId||''):b.image;
 const rows=residentTextureMasks[key];if(!rows)return false;
 const samples=padding?[[0,0],[-16,0],[16,0],[0,-18],[0,10]]:[[0,0]];
 return samples.some(([dx,dy])=>{const x=(.5+(p.x+dx-b.x)/b.size*(b.mirrored?-1:1))*48,y=(b.anchor+(p.y+dy-b.y)/b.size)*48;
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>=48||y<0||y>=48)return false;const span=rows[Math.floor(y)];return span[0]>=0&&x>=span[0]&&x<=span[1]+1;});
}
/** Client-only ambient traffic: no hero movement, economy or server calls. */
export function residentNavigation(buildings:SceneBuilding[]){
 const roads=buildings.find(b=>b.id==='gates')?.roadSegments||[];
 const step=roads.length?11:22,left=-660,top=352,cols=2156/step,rows=1210/step;
 const obstacles=buildings.flatMap(b=>b.volumes.map(v=>({id:b.id,points:v.base.map(([x,y])=>({x:b.x+(b.mirrored?-x:x),y:b.y+y}))})));
 const polygons=obstacles.map(o=>o.points);
 const position=(id:number)=>({x:left+(id%cols)*step,y:top+Math.floor(id/cols)*step});
 const blocked=new Uint8Array(cols*rows);
 for(let id=0;id<blocked.length;id++){
  const p=position(id);blocked[id]=Number(buildings.some(b=>textureOccupied(b,p))||polygons.some(poly=>[[-8,-8],[8,-8],[-8,8],[8,8],[0,0]].some(([x,y])=>contains({x:p.x+x,y:p.y+y},poly))));
 }
 // Ignore tiny enclosed paving pockets (e.g. between the gates and a roof).
 const component=new Int32Array(blocked.length).fill(-1);let largest=-1,largestSize=0,label=0;
 for(let start=0;start<blocked.length;start++){if(blocked[start]||component[start]>=0)continue;
  const queue=[start];component[start]=label;
  for(let i=0;i<queue.length;i++){const id=queue[i],x=id%cols,y=Math.floor(id/cols);for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){const nx=x+dx,ny=y+dy,next=ny*cols+nx;if(nx<0||ny<0||nx>=cols||ny>=rows||blocked[next]||component[next]>=0)continue;component[next]=label;queue.push(next);}}
  if(queue.length>largestSize){largest=label;largestSize=queue.length;}label++;
 }
 const doors=buildings.filter(b=>!b.decor&&entranceAnchors[b.id]).map(b=>{
  const point=entrance(b);let approach=-1,score=Infinity;
  // Prefer free paving immediately in front of the threshold.
  for(let id=0;id<blocked.length;id++){if(blocked[id]||component[id]!==largest)continue;const p=position(id),d=Math.hypot(p.x-point.x,p.y-point.y);
   if(outdoorStops.has(b.id)&&p.y<b.y+(1-b.anchor)*b.size+16)continue;
   const cost=d+(p.y<point.y?60:0);if(d>=200||cost>=score)continue;
   // Only the threshold's own building may be crossed when emerging/entering.
   // Other foundations must never obstruct the door connector.
   const connector=Array.from({length:Math.ceil(d/5)+1},(_,i)=>{const t=i/Math.max(1,Math.ceil(d/5));return {x:point.x+(p.x-point.x)*t,y:point.y+(p.y-point.y)*t};});
   const obstructed=buildings.some(other=>other.id!==b.id&&connector.some(p=>textureOccupied(other,p)))||obstacles.some(o=>o.id!==b.id&&connector.some(p=>contains(p,o.points)));
   if(!obstructed){score=cost;approach=id;}}
  return {id:b.id,point:outdoorStops.has(b.id)&&approach>=0?position(approach):point,approach,enter:!outdoorStops.has(b.id)};
 }).filter(d=>d.approach>=0);
 // Roads influence route choice only; they never clear an occupied cell.
 const travelWeight=new Float64Array(blocked.length).fill(1);
 for(let id=0;id<blocked.length;id++){
  if(blocked[id])continue;const p=position(id);
  for(const [x1,y1,x2,y2] of roads){
   const dx=x2-x1,dy=y2-y1,t=Math.max(0,Math.min(1,((p.x-x1)*dx+(p.y-y1)*dy)/(dx*dx+dy*dy||1)));
   const distance=Math.hypot(p.x-x1-t*dx,p.y-y1-t*dy);
   if(distance<=16)travelWeight[id]=Math.min(travelWeight[id],.25+.35*(distance/16)**2);
  }
 }
 const minWeight=roads.length?.25:1;
 const cache=new Map<string,Route|null>();
 const edges=new Map<number,boolean>();
 const clearEdge=(a:number,b:number)=>{
  const key=Math.min(a,b)*blocked.length+Math.max(a,b);if(edges.has(key))return edges.get(key)!;
  const p=position(a),q=position(b),count=Math.ceil(Math.hypot(q.x-p.x,q.y-p.y)/3);
  const clear=!Array.from({length:count-1},(_,i)=>{const t=(i+1)/count;return {x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t};}).some(point=>buildings.some(b=>textureOccupied(b,point)));
  edges.set(key,clear);return clear;
 };
 function route(from:number,to:number):Route|null{
  const key=from+':'+to;if(cache.has(key))return cache.get(key)!;
  const start=doors[from],finish=doors[to];if(!start||!finish||from===to)return null;
  const target=finish.approach,goal=position(target),cost=new Float64Array(blocked.length).fill(Infinity),previous=new Int32Array(blocked.length).fill(-1),closed=new Uint8Array(blocked.length);
  // Small binary heap bounds route planning cost on mobile.
  const heap:{id:number;priority:number}[]=[];
  const push=(id:number,priority:number)=>{let i=heap.length;heap.push({id,priority});while(i){const p=(i-1)>>1;if(heap[p].priority<=priority)break;heap[i]=heap[p];i=p;}heap[i]={id,priority};};
  const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].priority<heap[child].priority)child++;if(heap[child].priority>=last.priority)break;heap[i]=heap[child];i=child;}heap[i]=last;}return first.id;};
  cost[start.approach]=0;push(start.approach,0);
  while(heap.length){
   const id=pop();if(closed[id])continue;if(id===target)break;closed[id]=1;
   const x=id%cols,y=Math.floor(id/cols);
   for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]){
    const nx=x+dx,ny=y+dy,next=ny*cols+nx;if(nx<0||ny<0||nx>=cols||ny>=rows||blocked[next]||closed[next])continue;
    if(dx&&dy&&(blocked[y*cols+nx]||blocked[ny*cols+x]))continue;
    if(!clearEdge(id,next))continue;
    const value=cost[id]+Math.hypot(dx,dy)*step*(travelWeight[id]+travelWeight[next])/2;if(value>=cost[next])continue;
    cost[next]=value;previous[next]=id;const p=position(next);push(next,value+minWeight*Math.hypot(goal.x-p.x,goal.y-p.y));
   }
  }
  if(!Number.isFinite(cost[target])){cache.set(key,null);return null;}
  const ids=[target];while(ids[ids.length-1]!==start.approach)ids.push(previous[ids[ids.length-1]]);
  const points=[start.point,...ids.reverse().map(position),finish.point];
  const result=makeRoute(points);cache.set(key,result);cache.set(to+':'+from,makeRoute([...points].reverse()));return result;
 }
 return {doors,route};
}
