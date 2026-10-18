import {residentReaction} from './residentReaction';
import {useEffect,useRef} from 'react';
import messenger from '../../assets/castle-residents/messenger.webp';
import artisan from '../../assets/castle-residents/artisan.webp';
import gardener from '../../assets/castle-residents/gardener.webp';
import type {SceneBuilding} from './modularCastleLayout';
import {atDistance,residentNavigation,residentDrawSlot,type Route} from './castleResidents';
import {castleMotion} from './castleMotion';
const sprites=[messenger,artisan,gardener];
const residentCount=5;
const ns='http://www.w3.org/2000/svg';
function residentNode(i:number){
 const g=document.createElementNS(ns,'g');g.dataset.castleResident=String(i);g.dataset.depth='0';g.setAttribute('opacity','0');g.setAttribute('pointer-events','none');g.setAttribute('role','button');g.setAttribute('aria-label','Юпь!');g.setAttribute('tabindex','-1');g.style.cursor='pointer';
 // SVG focus bounds include the entire sprite sheet, even outside its clipped frame.
 // Keep keyboard focus on the resident, but draw it on the compact hit ellipse.
 g.style.outline='none';g.style.setProperty('-webkit-tap-highlight-color','transparent');
 g.setAttribute('class','focus-visible:[&>ellipse:last-child]:stroke-[#ffe3a0]');
 const shadow=document.createElementNS(ns,'ellipse');shadow.setAttribute('pointer-events','none');for(const [key,value] of Object.entries({cx:'4',cy:'1',rx:'9',ry:'3.5',fill:'#222d48',opacity:'.23'}))shadow.setAttribute(key,value);g.append(shadow);
 const body=document.createElementNS(ns,'g');body.dataset.residentBody='';body.setAttribute('pointer-events','none');const svg=document.createElementNS(ns,'svg');svg.setAttribute('overflow','hidden');const image=document.createElementNS(ns,'image');image.setAttribute('href',sprites[i%3]);image.setAttribute('width','384');image.setAttribute('height','192');svg.append(image);body.append(svg);g.append(body);const hit=document.createElementNS(ns,'ellipse');for(const [key,value] of Object.entries({cx:'0',cy:'-27',rx:'23',ry:'29',fill:'transparent','stroke-width':'2','vector-effect':'non-scaling-stroke'}))hit.setAttribute(key,value);g.append(hit);return g;
}
function show(node:SVGGElement,opacity:number){const v=String(opacity);if(node.getAttribute('opacity')===v)return;node.setAttribute('opacity',v);node.setAttribute('pointer-events',opacity>=.8?'all':'none');node.setAttribute('tabindex',opacity>=.8?'0':'-1');}
/** Окно поверх замка: юпики под ним не видны — не тратим на них кадры. */
const covered=()=>!!document.querySelector('[aria-modal="true"],[role="dialog"]');
type Resident={from:number;to:number;route:Route;distance:number;wait:number;trips:number};
export function useCastleResidents(buildings:SceneBuilding[],editing:boolean){
 const layer=useRef<SVGGElement>(null);
 useEffect(()=>{
  const root=layer.current;if(!root||editing)return;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const depthBuildings=[...buildings].sort((a,b)=>a.y-b.y);
  // Сетка путей тяжёлая (≈20 тыс. клеток): строим её после того, как замок открылся.
  let started=false,stop=()=>{};
  const begin=window.setTimeout(()=>{if(!started){started=true;stop=start(root);}},1200);
  return()=>{window.clearTimeout(begin);stop();};
  function start(root:SVGGElement):()=>void{
  const nav=residentNavigation(buildings);if(nav.doors.length<2)return()=>{};
  // Residents are a DOM-owned animation island; React owns only the building nodes.
  const nodes=Array.from({length:residentCount},(_,i)=>residentNode(i));nodes.forEach(node=>root.append(node));
  const bodies=nodes.map(n=>n.querySelector<SVGGElement>('[data-resident-body]')!),sprites_=nodes.map(n=>n.querySelector<SVGSVGElement>('svg')!);
  // Пишем в DOM только то, что изменилось: размер кадра постоянный, кадр спрайта
  // меняется 8 раз в секунду, разворот — на поворотах. Каждая запись атрибута у
  // вложенного svg — пересчёт раскладки сцены (было 20 раз в секунду).
  const depth=nodes.map(()=>0),slotOf=nodes.map(()=>-1),dirOf=nodes.map(()=>0),viewOf=nodes.map(()=>'');
  sprites_.forEach((sprite,i)=>{const size=88+(i%3)*8;sprite.setAttribute('width',String(size));sprite.setAttribute('height',String(size));sprite.setAttribute('x',String(-size/2));sprite.setAttribute('y',String(-size*.96));});
  const setData=(node:SVGGElement,key:string,value:string)=>{if(node.dataset[key]!==value)node.dataset[key]=value;};
  const index=new Map<Element,number>(nodes.map((n,i)=>[n,i]));
  let slots='';
  const reaction=residentReaction(root);
  const actors=nodes.map((_,i):Resident|null=>{
   const from=i%nav.doors.length;
   for(let offset=1;offset<nav.doors.length;offset++){const to=(from+offset+i)%nav.doors.length,route=nav.route(from,to);if(route&&route.length>1)return {from,to,route,distance:route.length*((i*.137+.11)%1),wait:0,trips:0};}return null;
  });
  let raf=0,timer:ReturnType<typeof setTimeout>|undefined,last=performance.now(),clock=0,visibilityAt=0,visible=true,disposed=false;
  function schedule(){if(disposed||motion.matches)return;if(document.hidden||!visible){timer=setTimeout(()=>{visibilityAt=0;tick(performance.now());},300);}else raf=requestAnimationFrame(tick);}
  function tick(now:number){
   if(disposed)return;if(now-visibilityAt>250){visible=getComputedStyle(root!).visibility!=='hidden'&&!!root!.getBoundingClientRect().width&&!covered();visibilityAt=now;}
   // Камеру двигают — юпики стоят, вся мощность прокрутке.
   if(document.hidden||!visible||motion.matches||castleMotion.active(now)){last=now;schedule();return;}
   if(now-last<50){schedule();return;}const dt=Math.min(.1,(now-last)/1000);last=now;clock+=dt;
   actors.forEach((a,i)=>{
    const node=nodes[i];if(!a){show(node,0);return;}
    if(reaction.active(node,now))return;
    setData(node,'destination',nav.doors[a.to].id);setData(node,'state',a.wait>0?'waiting':'walking');
    if(a.wait>0){a.wait-=dt;show(node,nav.doors[a.to].enter?0:1);if(a.wait<=0){
      a.from=a.to;a.trips++;let found=false;
      for(let k=1;k<nav.doors.length;k++){const to=(a.from+k+i+a.trips)%nav.doors.length,route=nav.route(a.from,to);if(route&&route.length>1){a.to=to;a.route=route;a.distance=0;found=true;break;}}
      if(!found)a.wait=2;
     }return;}
    a.distance=Math.min(a.route.length,a.distance+dt*(37+(i%3)*7));const arrived=a.distance>=a.route.length;if(arrived)a.wait=1.4+(i%4)*.6;
    const p=atDistance(a.route,a.distance);
    node.setAttribute('transform',`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    depth[i]=p.y;const slot=residentDrawSlot(depthBuildings,p);if(slot!==slotOf[i]){slotOf[i]=slot;node.dataset.drawSlot=String(slot);}
    show(node,Math.min(1,nav.doors[a.from].enter?a.distance/14:1,nav.doors[a.to].enter?(a.route.length-a.distance)/14:1));
    const dir=p.dx<0?-1:1;if(dir!==dirOf[i]){dirOf[i]=dir;bodies[i].setAttribute('transform',`scale(${dir} 1)`);}
    const frame=arrived?0:Math.floor(clock*8+i)%4,row=p.dy<0?1:0,view=`${frame*96} ${row*96} 96 96`;
    if(view!==viewOf[i]){viewOf[i]=view;sprites_[i].setAttribute('viewBox',view);}
   });
   // Interleave actors at the foundation edge; a sprite anchor can lie below its door.
   // React retains ownership and order of every building node. Переставляем узлы,
   // только когда юпик перешёл за край здания: сортировка всей сцены каждый кадр
   // заставляла браузер пересчитывать её 30 раз в секунду.
   const nowSlots=nodes.map((_,i)=>[slotOf[i],depth[i],i]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).map(x=>x[0]+':'+x[2]).join(',');
   if(nowSlots===slots){schedule();return;}
   slots=nowSlots;
   const buildingNodes=Array.from(root!.children).filter(n=>(n as SVGElement).dataset.modularBuilding!==undefined);
   const ordered=Array.from(root!.children).sort((a,b)=>{
    const key=(n:Element)=>{const i=index.get(n);return i!==undefined?Math.max(0,slotOf[i])*2-1:buildingNodes.indexOf(n)*2;};
    const dep=(n:Element)=>{const i=index.get(n);return i!==undefined?depth[i]:Number((n as SVGElement).dataset.depth);};
    return key(a)-key(b)||dep(a)-dep(b);
   });
   let next:Element|null=null;for(const node of [...ordered].reverse()){if((node as SVGElement).dataset.castleResident!==undefined&&node.nextElementSibling!==next)root!.insertBefore(node,next);next=node;}
   schedule();
  }
  const onMotion=()=>{cancelAnimationFrame(raf);if(timer)clearTimeout(timer);if(motion.matches)nodes.forEach(node=>node.setAttribute('opacity','0'));else{last=performance.now();schedule();}};
  motion.addEventListener('change',onMotion);schedule();
  return()=>{disposed=true;reaction.dispose();cancelAnimationFrame(raf);if(timer)clearTimeout(timer);motion.removeEventListener('change',onMotion);nodes.forEach(node=>node.remove());};
  }
 },[buildings,editing]);
 return {layer};
}
