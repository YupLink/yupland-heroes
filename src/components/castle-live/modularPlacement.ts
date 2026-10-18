import {orientedBuilding,type SceneBuilding} from './modularCastleLayout';
type Point=[number,number];
function hull(points:Point[]):Point[]{
 const sorted=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const half=(list:Point[])=>{const result:Point[]=[];for(const p of list){while(result.length>1&&cross(result[result.length-2],result[result.length-1],p)<=0)result.pop();result.push(p);}result.pop();return result;};
 return [...half(sorted),...half([...sorted].reverse())];
}
function base(raw:SceneBuilding){const b=orientedBuilding(raw);return hull(b.volumes.flatMap(v=>v.base.map(([x,y]):Point=>[b.x+x,b.y+y])));}
function overlap(a:Point[],b:Point[]){
 for(const polygon of [a,b])for(let i=0;i<polygon.length;i++){
  const p=polygon[i],q=polygon[(i+1)%polygon.length],axis:[number,number]=[q[1]-p[1],p[0]-q[0]];
  const project=(points:Point[])=>points.map(([x,y])=>x*axis[0]+y*axis[1]);const pa=project(a),pb=project(b);
  if(Math.max(...pa)<=Math.min(...pb)||Math.max(...pb)<=Math.min(...pa))return false;
 }
 return true;
}
/** Visual prototype bounds only; authoritative territory/placement comes from Misha's API. */
export function placementProblem(object:SceneBuilding,objects:SceneBuilding[]):'bounds'|'occupied'|null{
 const points=base(object);
 if(points.some(([x,y])=>x< -600||x>1400||(object.id!=='gates'&&(y<330||y>1500))))return 'bounds';
 if(objects.some(other=>other.id!==object.id&&overlap(points,base(other))))return 'occupied';
 return null;
}
