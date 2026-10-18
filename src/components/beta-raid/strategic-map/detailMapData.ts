import type { WorldMapModel } from '../world-map/worldMapModel';
import type { DetailPoint } from './strategicData';
import type { Landscape } from './terrainGeometry';

/** Convert only the cells and markers returned by the existing authorized API. */
export function detailMapData(model: WorldMapModel, castle?: {q:number;r:number}) {
  const seen = new Set<string>();
  const landscape: Landscape = {cells:{},terrains:{}};
  model.terrains.forEach(t => {landscape.terrains[t.id]={imageUrl:t.img};});
  for(let row=0;row<model.rows;row++) for(let col=0;col<model.cols;col++) {
    const value=model.grid[row*model.cols+col];
    const terrain=model.terrains[value-1];
    if(!value || !terrain) continue;
    const key=`${model.q0+col},${model.r0+row}`;
    seen.add(key);landscape.cells[key]={terrainId:terrain.id};
  }
  // The API deliberately includes the player's buried treasures outside fog.
  // Keep those known coordinates without revealing any extra terrain.
  const points:DetailPoint[]=model.marks.filter(m=>m.kind==='treasure'||seen.has(`${m.q},${m.r}`)).map(m=>({...m,kind:m.kind==='field'?'farm':m.kind}));
  if(castle&&seen.has(`${castle.q},${castle.r}`))points.push({...castle,kind:'castle'});
  return {seen,landscape,points};
}
