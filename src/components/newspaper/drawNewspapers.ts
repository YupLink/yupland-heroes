import type {NewspaperSpot} from '@/lib/newspaper';
import type {DrawScene} from '../beta-raid/betaCanvasScene';
import type {MapStore} from '../beta-raid/mapStore';
import {R} from '../beta-raid/hexGeometry';
export function drawNewspapers(scene:DrawScene,store:MapStore,spots:NewspaperSpot[]|undefined){
 if(!spots?.length)return;
 const image=scene.images.get('newspaper');
 for(const spot of spots){
  const key=`${spot.q},${spot.r}`,i=store.indexOfKey(key);
  if(i<0||scene.voidCells.has(key))continue;
  if(!scene.revealAll&&!(scene.seen.hasIndex(i)&&(scene.fogZones?.active.has(i)||scene.fogZones?.bright.has(i))))continue;
  const x=store.geom.x[i],y=store.geom.y[i],v=scene.view;
  if(x<v.minX||x>v.maxX||y<v.minY||y>v.maxY)continue;
  const w=R*1.25,h=w*2/3;
  if(image?.complete&&image.naturalWidth>0)scene.g.drawImage(image,x-w/2,y-h/2,w,h);
  else{scene.g.fillStyle='#eee5cf';scene.g.fillRect(x-w/2,y-h/2,w,h);scene.g.strokeStyle='#463b27';scene.g.lineWidth=1;scene.g.strokeRect(x-w/2,y-h/2,w,h);}
 }
}
