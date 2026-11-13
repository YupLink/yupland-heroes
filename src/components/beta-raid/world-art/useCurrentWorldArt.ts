import { skipToken, useQuery } from '@tanstack/react-query';
import type { MapData, RaidState } from '../useBetaRaidData';
import { worldArtFromMap } from './worldArt';
import { useWorldArtImages } from './useWorldArt';

const selectMap = (data: MapData) => data.map;
const selectMapId = (data: RaidState) => data.mapId;

/** Read existing raid caches only, with no request or changes to shared data.
 * Never apply old-world thumbnails while the hero's destination map is loading.
 */
export function useCurrentWorldArt() {
  const map = useQuery({ queryKey: ['beta-raid-map'], queryFn: skipToken, select: selectMap });
  const state = useQuery({ queryKey: ['beta-raid-state'], queryFn: skipToken, select: selectMapId });
  const art = worldArtFromMap(map.data, state.data);
  const images = useWorldArtImages(art);
  return images ? art : null;
}
