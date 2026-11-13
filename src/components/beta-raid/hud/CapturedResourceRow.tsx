import {MapPin} from 'lucide-react';
import {useT} from '@/lib/i18n';
import {formatQty} from '@/lib/formatQty';
import {CaptureCollectButton} from './CaptureCollectButton';

export function CapturedResourceRow({id,name,mushroom,amount,q,r,floor,onShowCell}:{
  id:string;name:string;mushroom:boolean;amount:number;q:number;r:number;floor?:string|null;onShowCell?:(q:number,r:number)=>void;
}){
  const t=useT();
  return <div data-harvest-seized className="harvest-captured-row">
    <div className="harvest-row-main">
      <strong>{name}</strong>
      <div className="harvest-captured-stats">
        <span className="harvest-row-meta">{t('harvest.ready_to_collect')} <b>{formatQty(amount)}</b></span>
        <span className="harvest-group-alert"><span className="harvest-status-separator" aria-hidden>· </span>{t(mushroom?'harvest.mushroom_seized':'harvest.mine_seized')}</span>
      </div>
    </div>
    <div className="harvest-captured-actions">
      <CaptureCollectButton id={id} name={`${name}, ${q},${r}`} />
      <div className="harvest-row-map">
        {onShowCell&&<button data-harvest-show-cell data-game-button="icon" type="button" disabled={!!floor}
          title={floor??t('harvest.show_on_map')} aria-label={`${name}: ${t('harvest.cell',{q,r})}`} onClick={()=>onShowCell(q,r)}><MapPin aria-hidden size={20}/></button>}
        <span>{t('harvest.cell_short',{q,r})}</span>
      </div>
    </div>
  </div>;
}
