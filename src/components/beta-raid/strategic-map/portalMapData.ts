import type { WorldPortalsWire } from '@/lib/raid/worldPortals';
import type { DetailPoint, StrategicPoint } from './strategicData';

/** A response from another map or privilege mode must never label this map. */
export function portalPoints(wire: WorldPortalsWire | undefined, mapId: string | null | undefined, mode: 'seen' | 'all'): StrategicPoint[] {
  if (!mapId || wire?.mapId !== mapId || wire.mode !== mode) return [];
  return wire.portals.map(p => ({kind:'worldPortal',q:p.q,r:p.r,to:p.to,alsoHere:p.alsoHere}));
}

/** Keep local portals and include every authorized interworld entrance, even without a base marker. */
export function markWorldPortals(points: DetailPoint[], portals: StrategicPoint[]): DetailPoint[] {
  const byCell = new Map(portals.map(p => [`${p.q},${p.r}`,p]));
  const result: DetailPoint[] = [];
  const placed = new Set<string>();
  for (const point of points) {
    const key = `${point.q},${point.r}`;
    const portal = (point.kind === 'portal' || point.kind === 'worldPortal') ? byCell.get(key) : undefined;
    if (portal) {
      if (!placed.has(key)) result.push(portal);
      placed.add(key);
    } else result.push(point);
  }
  for (const portal of portals) {
    const key = `${portal.q},${portal.r}`;
    if (!placed.has(key)) result.push(portal);
    placed.add(key);
  }
  return result;
}
