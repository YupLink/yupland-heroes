import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { myWarehouses } from '@/server/api/beta-raid/warehouse-mine';
import { getHarvestSummary } from '@/server/api/beta-raid/harvest-summary';
import { getHomeCastle } from '@/server/api/beta-raid/home-castle';
import { StrategicMapDialog } from './StrategicMapDialog';
import { personalStrategicPoints, type StrategicPoint } from './strategicData';

import { useWorldPortals } from './useWorldPortals';
import { markWorldPortals } from './portalMapData';
import { useDetailedMap } from './useDetailedMap';
import { usePlayerDots } from '../playerDots';
import { holdMapFrames } from '../mapFrameHold';
import { useRaidMapId } from '../useEnergyMult';

type DialogProps = ComponentProps<typeof StrategicMapDialog>;
/** Карта без чужих игроков: их точки окно берёт само (playerDots), мимо HUD. */
export type LiveMapProps = Omit<DialogProps['map'], 'players'>;
type Props = Omit<DialogProps, 'map'> & { map: LiveMapProps };
/** Read-only personal sources, refreshed every time the overview opens. No demo fallback. */
export function LiveStrategicMapDialog(props: Props) {
  const mapId=useRaidMapId();
  const detail=useDetailedMap(props.map.castleShown?props.map.castle:undefined);
  const portals=useWorldPortals(!!detail.access&&!!detail.all&&detail.mode==='all');
  const enrichedDetail=useMemo(()=>({...detail,points:portals.detailedReady?markWorldPortals(detail.points,portals.detailed):detail.points.filter(p=>p.kind!=='portal')}),[detail,portals.detailed,portals.detailedReady]);
  // The window covers the live map: its frames and baked chunks wait until the window closes.
  useEffect(()=>holdMapFrames(),[]);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<{ identity: string | null; points: StrategicPoint[]; loading: boolean; errors: string[] }>({identity:null,points:[],loading:true,errors:[]});
  useEffect(() => {
    let active = true;
    const identity=portals.identity;
    setData({identity,points:[],loading:!!mapId,errors:[]});
    if(!mapId)return;
    void Promise.allSettled([myWarehouses(), getHarvestSummary(), props.map.castleShown ? getHomeCastle() : Promise.resolve(null)]).then(([w,h,c]) => {
      if(!active)return;
      const points = personalStrategicPoints(mapId,w.status==='fulfilled' ? w.value.list : [],h.status==='fulfilled' ? h.value.mines : [],h.status==='fulfilled' ? h.value.fields : []);
      const home = c.status==='fulfilled' && !c.value?.away && !c.value?.island ? c.value?.home : null;
      if(home && Number.isFinite(home.q) && Number.isFinite(home.r)) points.push({kind:'castle',q:home.q,r:home.r});
      setData({identity,points,loading:false,errors:[w.status==='rejected'?'warehouses':'',h.status==='rejected'?'harvest':'',c.status==='rejected'?'castle':''].filter(Boolean)});
    });
    return () => {active=false;};
  },[attempt,props.map.castleShown,mapId,portals.identity]);
  const players = usePlayerDots();
  const map = useMemo(()=>({...props.map,players,strategicPoints:[...(data.identity===portals.identity?data.points:[]),...portals.personal],detail:enrichedDetail}),[props.map,players,data,portals.identity,portals.personal,enrichedDetail]);
  const ru=props.ru;
  const status=data.loading ? <span role="status">{ru?'Загружаем твои объекты…':'Loading your locations…'}</span> : data.errors.length ? <span role="alert">{ru?'Часть объектов не загрузилась.':'Some locations could not load.'} <button type="button" onClick={()=>setAttempt(x=>x+1)}>{ru?'Повторить':'Retry'}</button></span> : null;
  const portalStatus=portals.error?<span role="alert">{ru?'Не удалось загрузить порталы.':'Could not load portals.'} <button type="button" onClick={portals.retry}>{ru?'Повторить':'Retry'}</button></span>:portals.loading?<span role="status">{ru?'Загружаем порталы…':'Loading portals…'}</span>:null;
  return <StrategicMapDialog key={portals.identity} {...props} map={map} status={status} actions={<>{portalStatus&&<div className="strategic-map__status">{portalStatus}</div>}{props.actions}</>}/>;
}


