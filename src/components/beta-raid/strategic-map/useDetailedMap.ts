import { useRaidMapId } from '../useEnergyMult';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSession } from '@/server/api/user-auth';
import { getMyBackpack } from '@/server/api/beta-raid/market-backpack-read';
import { getWorldMap } from '@/server/api/beta-raid/world-map';
import { hasMapIn, worldMapAccess } from '@/lib/raid/worldMapAccess';
import { worldMapModel } from '../world-map/worldMapModel';
import { detailMapData } from './detailMapData';
import type { DetailMap, DetailPoint } from './strategicData';

const EMPTY:DetailPoint[]=[];

/** Read-only adapter. Access remains enforced by getWorldMap on the server. */
export function useDetailedMap(castle?:{q:number;r:number}):DetailMap {
  const mapId=useRaidMapId();
  const session=useQuery({queryKey:['session'],queryFn:()=>getSession()});
  const backpack=useQuery({queryKey:['my-hero-backpack'],queryFn:()=>getMyBackpack()});
  const access=worldMapAccess({owner:session.data?.isPayoutsAdmin===true,admin:session.data?.isAdmin===true,hasMapItem:!backpack.isError&&hasMapIn(backpack.data?.stacks)});
  const [requestedMode,setMode]=useState<'seen'|'all'>('seen');
  const mode=access.all?requestedMode:'seen';
  const account=session.data?.wallet;
  const enabled=access.seen&&!!mapId&&!!account&&!!backpack.data?.heroId;
  const query=useQuery({
    // 'view' prevents persistence by the existing query-cache policy.
    // Hero/account keys prevent a previous hero's response becoming placeholder data.
    queryKey:['world-map','view','tabs',account,backpack.data?.heroId,mapId,mode],
    queryFn:()=>getWorldMap({data:{mode}}),enabled,
    staleTime:0,gcTime:0,refetchOnWindowFocus:false,retry:1,
  });
  const data=useMemo(()=>{
    if(!enabled||query.isError||!query.data)return null;
    const model=worldMapModel(query.data);
    return model?detailMapData(model,castle):null;
  },[enabled,query.data,query.isError,castle?.q,castle?.r]);
  return {access:enabled,points:data?.points??EMPTY,terrain:data??undefined,
    preferenceKey:`yuplink:map-tab:${account??'anonymous'}`,
    state:query.isError||(query.data&&!data)?'error':query.isPending?'loading':'ready',
    onRetry:()=>{void query.refetch();},all:access.all,mode,onMode:setMode};
}

