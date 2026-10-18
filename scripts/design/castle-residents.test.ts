import assert from 'node:assert/strict';
import test from 'node:test';
import {originals,resizeBuilding} from '../../src/components/castle-live/modularCastleProfiles';
import {entrance,residentNavigation,atDistance,textureOccupied,outdoorStops,residentDrawSlot} from '../../src/components/castle-live/castleResidents';
import type {SceneBuilding} from '../../src/components/castle-live/modularCastleLayout';
const clone=()=>structuredClone(originals) as SceneBuilding[];
function inside(x:number,y:number,poly:number[][]){let value=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])value=!value;}return value;}
test('door follows translation, resize and mirror',()=>{
 const b=clone().find(b=>b.id==='shop')!,p=entrance(b);b.x+=70;b.y+=25;
 assert.ok(Math.abs(entrance(b).x-p.x-70)<1e-8);assert.ok(Math.abs(entrance(b).y-p.y-25)<1e-8);
 const x=b.x,y=b.y,offset=entrance(b);resizeBuilding(b,b.size*1.3);
 assert.ok(Math.abs(entrance(b).x-(x+(offset.x-x)*1.3))<1e-8);
 assert.ok(Math.abs(entrance(b).y-(y+(offset.y-y)*1.3))<1e-8);
 const normal=entrance(b);b.mirrored=true;assert.ok(Math.abs(entrance(b).x-(2*b.x-normal.x))<1e-8);assert.equal(entrance(b).y,normal.y);
});
for(const variant of ['approved','mirrored','decorated'])test('routes avoid other foundations: '+variant,()=>{
 const buildings=clone();if(variant==='mirrored')for(const b of buildings){b.mirrored=b.id!=='gates';resizeBuilding(b,b.size*.8);}
 if(variant==='decorated')buildings.push({...structuredClone(buildings[0]),id:'decor:test',decor:true,x:1100,y:1000});
 const nav=residentNavigation(buildings);assert.ok(nav.doors.length>=9);for(const b of buildings.filter(b=>!b.decor&&b.id!=='gates'))assert.ok(nav.doors.some(d=>d.id===b.id),b.id+' must be reachable');let count=0;
 for(let from=0;from<nav.doors.length;from++)for(let to=0;to<nav.doors.length;to++){if(from===to)continue;const route=nav.route(from,to);assert.ok(route);assert.ok(route.length>0);count++;
  assert.deepEqual(route.points[0],nav.doors[from].point);assert.deepEqual(route.points.at(-1),nav.doors[to].point);
  for(let i=1;i<route.points.length;i++){const a=route.points[i-1],p=route.points[i],steps=Math.ceil(Math.hypot(p.x-a.x,p.y-a.y)/4);
   for(let k=0;k<=steps;k++){const t=k/steps,x=a.x+(p.x-a.x)*t,y=a.y+(p.y-a.y)*t;
    for(const b of buildings){if((i===1&&b.id===nav.doors[from].id)||(i===route.points.length-1&&b.id===nav.doors[to].id))continue;
     assert.ok(!textureOccupied(b,{x,y}),`${variant}: texture collision ${nav.doors[from].id}->${nav.doors[to].id} with ${b.id}`);
     for(const v of b.volumes)assert.ok(!inside(x,y,v.base.map(([dx,dy])=>[b.x+(b.mirrored?-dx:dx),b.y+dy])),`${variant}: ${nav.doors[from].id}->${nav.doors[to].id} crosses ${b.id}`);
    }
   }
  }
  const middle=atDistance(route,route.length/2);assert.ok(Number.isFinite(middle.x)&&Number.isFinite(middle.y));
 }
 assert.equal(count,nav.doors.length*(nav.doors.length-1));
});
test('too few buildings creates no ambient route',()=>{const nav=residentNavigation(clone().slice(0,1));assert.equal(nav.route(0,0),null);});
test('market, glory and notice board are visible outdoor stops',()=>{
 const buildings=clone(),nav=residentNavigation(buildings);
 for(const id of ['market','notice','glory']){const stop=nav.doors.find(d=>d.id===id)!;assert.ok(stop);assert.equal(stop.enter,false);assert.ok(outdoorStops.has(id));const host=buildings.find(b=>b.id===id)!;assert.ok(stop.point.y>host.y,'outdoor resident must be drawn in front of the stop');for(const b of buildings)assert.ok(!textureOccupied(b,stop.point));}
 for(const stop of nav.doors.filter(d=>!outdoorStops.has(d.id)))assert.equal(stop.enter,true);
});

test('resident in front of tavern door is drawn over the tavern, including mirrored resized art',()=>{
 for(const mirrored of [false,true]){
  const buildings=clone();const tavern=buildings.find(b=>b.id==='tavern')!;tavern.mirrored=mirrored;resizeBuilding(tavern,tavern.size*1.15);
  const ordered=buildings.sort((a,b)=>a.y-b.y),door=entrance(tavern),index=ordered.indexOf(tavern);
  assert.ok(door.y<tavern.y,'regression: door is above the sorting anchor');
  assert.ok(residentDrawSlot(ordered,{x:door.x,y:door.y+3})>index,'front resident must cover the tavern');
  assert.ok(residentDrawSlot(ordered,{x:door.x,y:tavern.y-tavern.size})<=index,'resident behind the building must remain behind');
 }
});
