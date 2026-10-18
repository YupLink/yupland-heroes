import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { myWarehouses } from '@/server/api/beta-raid/warehouse-mine';
import { getHarvestSummary } from '@/server/api/beta-raid/harvest-summary';
import { getHomeCastle } from '@/server/api/beta-raid/home-castle';
import { StrategicMapDialog } from './StrategicMapDialog';
import { strategicPoints, type StrategicPoint } from './strategicData';

import { useDetailedMap } from './useDetailedMap';
import { usePlayerDots } from '../playerDots';

type DialogProps = ComponentProps<typeof StrategicMapDialog>;
/** Карта без чужих игроков: их точки окно берёт само (playerDots), мимо HUD. */
export type LiveMapProps = Omit<DialogProps['map'], 'players'>;
type Props = Omit<DialogProps, 'map'> & { map: LiveMapProps };
/** Read-only personal sources, refreshed every time the overview opens. No demo fallback. */
export function LiveStrategicMapDialog(props: Props) {
  const detail=useDetailedMap(props.map.castleShown?props.map.castle:undefined);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<{ points: StrategicPoint[]; loading: boolean; errors: string[] }>({points:[],loading:true,errors:[]});
  useEffect(() => {
    let active = true;
    setData({points:[],loading:true,errors:[]});
    void Promise.allSettled([myWarehouses(), getHarvestSummary(), props.map.castleShown ? getHomeCastle() : Promise.resolve(null)]).then(([w,h,c]) => {
      if(!active)return;
      const points = strategicPoints(w.status==='fulfilled' ? w.value.list : [],h.status==='fulfilled' ? h.value.mines : [],h.status==='fulfilled' ? h.value.fields : []);
      const home = c.status==='fulfilled' ? c.value?.home : null;
      if(home && Number.isFinite(home.q) && Number.isFinite(home.r)) points.push({kind:'castle',q:home.q,r:home.r});
      setData({points,loading:false,errors:[w.status==='rejected'?'warehouses':'',h.status==='rejected'?'harvest':'',c.status==='rejected'?'castle':''].filter(Boolean)});
    });
    return () => {active=false;};
  },[attempt,props.map.castleShown]);
  const players = usePlayerDots();
  const map = useMemo(()=>({...props.map,players,strategicPoints:data.points,detail}),[props.map,players,data.points,detail]);
  const ru=props.ru;
  const status=data.loading ? <span role="status">{ru?'Загружаем твои объекты…':'Loading your locations…'}</span> : data.errors.length ? <span role="alert">{ru?'Часть объектов не загрузилась.':'Some locations could not load.'} <button type="button" onClick={()=>setAttempt(x=>x+1)}>{ru?'Повторить':'Retry'}</button></span> : null;
  return <StrategicMapDialog {...props} map={map} status={status}/>;
}

