import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWorldPortals } from '@/server/api/beta-raid/world-portals';
import { getSession } from '@/server/api/user-auth';
import { getMyBackpack } from '@/server/api/beta-raid/market-backpack-read';
import { useRaidMapId } from '../useEnergyMult';
import { portalPoints } from './portalMapData';

/** Each mode has its own response: admin all must never leak into the personal map. */
export function useWorldPortals(all: boolean) {
  const mapId = useRaidMapId();
  const session = useQuery({queryKey:['session'],queryFn:()=>getSession()});
  const backpack = useQuery({queryKey:['my-hero-backpack'],queryFn:()=>getMyBackpack()});
  const account = session.data?.wallet;
  const hero = backpack.data?.heroId;
  const enabled = !!mapId && !!account && !!hero && !backpack.isError && !session.isError;
  const options = (mode:'seen'|'all') => ({
    queryKey:['world-map','view','portals',account,hero,mapId,mode],
    queryFn:async()=>{
      const result=await getWorldPortals({data:{mode}});
      if(result.mapId!==mapId || result.mode!==mode) throw new Error('Map changed');
      return result;
    },
    enabled:enabled && (mode==='seen'||all),
    staleTime:0,gcTime:0,refetchOnWindowFocus:false,retry:1,
  });
  const seen=useQuery(options('seen'));
  const entire=useQuery(options('all'));
  const personal=useMemo(()=>portalPoints(enabled&&!seen.isError?seen.data:undefined,mapId,'seen'),[enabled,seen.isError,seen.data,mapId]);
  const full=useMemo(()=>portalPoints(enabled&&all&&!entire.isError?entire.data:undefined,mapId,'all'),[enabled,all,entire.isError,entire.data,mapId]);
  const selected=all?entire:seen;
  const detailedReady=enabled&&!selected.isError&&selected.data?.mapId===mapId&&selected.data?.mode===(all?'all':'seen');
  return {detailedReady,personal,detailed:all?full:personal,identity:`${account??''}:${hero??''}:${mapId??''}`,
    loading:enabled&&(seen.isPending||(all&&entire.isPending)),
    error:seen.isError||(all&&entire.isError),retry:()=>{void seen.refetch();if(all)void entire.refetch();}};
}
