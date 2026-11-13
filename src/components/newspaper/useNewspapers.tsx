import {useEffect,useMemo,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {useT} from '@/lib/i18n';
import {hexDistance} from '@/lib/raid/hex';
import {getSession} from '@/server/api/user-auth';
import {getNewspapersNear} from '@/server/api/newspaper/paper-map';
import type {NewspaperSpot} from '@/lib/newspaper';
import type {Cell} from '../beta-raid/unpackMap';
import {NewspaperMapReader} from './NewspaperMapReader';
import {NewspaperFrame} from './NewspaperFrame';

export function useNewspapers(mapId:string|undefined,pos:{q:number;r:number}|null,cells:Record<string,Cell>){
 const t=useT();const qc=useQueryClient();
 const session=useQuery({queryKey:['session'],queryFn:()=>getSession()});
 const player=session.data?.telegramId!=null?`tg:${session.data.telegramId}`:session.data?.wallet;
 const collectedKey=['newspapers-collected',player] as const;
 const collected=useQuery<string[]>({queryKey:collectedKey,queryFn:async()=>[],enabled:false,initialData:[],gcTime:Infinity});
 const nearKey=['newspapers-near',player,mapId] as const;
 const [copy,setCopy]=useState<string|null>(null);
 const q=useQuery({queryKey:nearKey,queryFn:async()=>{
  const spots=await getNewspapersNear();
  const hidden=new Set(qc.getQueryData<string[]>(collectedKey)??[]);
  return spots.filter(p=>!hidden.has(p.issueId));
 },enabled:!!player&&!!mapId&&!!pos,staleTime:0,refetchOnMount:'always',refetchInterval:30000});
 useEffect(()=>{const timer=setTimeout(()=>{if(player&&pos&&mapId)void q.refetch();},600);return()=>clearTimeout(timer);},[player,pos?.q,pos?.r,mapId]);
 useEffect(()=>{setCopy(null);},[player,mapId]);
 const spots=useMemo(()=>{
  if(!player)return [];
  const hidden=new Set(collected.data??[]);
  return (q.data??[]).filter(p=>!hidden.has(p.issueId)&&!cells[`${p.q},${p.r}`]?.decorationId);
 },[player,q.data,collected.data,cells]);
 return {spots,tap:(x:number,y:number)=>{
  const paper=spots.find(p=>p.q===x&&p.r===y);if(!paper)return false;
  if(!pos||hexDistance(pos.q,pos.r,x,y)>1){toast.error(t('newspaper.approach'));return true;}
  setCopy(paper.id);return true;
 },sheet:copy?<NewspaperFrame><NewspaperMapReader key={`${mapId}:${copy}`} copyId={copy} onCollected={async issueId=>{
  // Keep the confirmed issue independently of maps, including maps not loaded yet.
  qc.setQueryData<string[]>(collectedKey,old=>Array.from(new Set([...(old??[]),issueId])));
  await qc.cancelQueries({queryKey:['newspapers-near',player]});
  qc.setQueriesData<NewspaperSpot[]>({queryKey:['newspapers-near',player]},old=>old?.filter(p=>p.issueId!==issueId));
  setCopy(null);
  void qc.invalidateQueries({queryKey:['newspapers-near',player]});
 }} onClose={()=>{setCopy(null);void qc.invalidateQueries({queryKey:['newspapers-near',player]});}}/></NewspaperFrame>:null};
}

