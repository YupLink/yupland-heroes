export type UpgradeResource={id:string;name:string;image?:string;cost:number;available:number};
type Props={ru:boolean;resources:UpgradeResource[];ready:boolean;pending?:boolean;error?:string;onUpgrade:()=>void};

/** Presentation only. Prices and balances come from the current warehouse response. */
export function WarehouseUpgradeCost({ru,resources,ready,pending=false,error,onUpgrade}:Props){
 const fmt=(n:number)=>n.toLocaleString(ru?'ru-RU':'en-US',{maximumFractionDigits:9});
 const short=resources.some(r=>r.available<r.cost);
 return <section className="wh-upgrade-price" aria-label={ru?'Стоимость улучшения':'Upgrade cost'}>
  <h3>{ru?'Стоимость улучшения':'Upgrade cost'}</h3>
  {short&&<p className="wh-upgrade-short" role="status">{ru?'Не хватает ресурсов для улучшения.':'Not enough resources to upgrade.'}</p>}
  {ready?<ul>{resources.map(r=><li key={r.id}>
   <span className="wh-upgrade-resource">{r.image?<img src={r.image} alt={r.name}/>:r.name}<b>{fmt(r.cost)}</b></span>
   <span className={r.available<r.cost?'wh-upgrade-short':''}>{ru?'Есть':'Available'}: {fmt(r.available)}</span>
  </li>)}</ul>:<p role="status">{ru?'Стоимость пока недоступна. Обнови данные склада.':'Cost is unavailable. Refresh warehouse data.'}</p>}
  {error&&<p role="alert">{error}</p>}
  <button type="button" className="wh-upgrade-confirm" disabled={!ready||short||pending} onClick={onUpgrade}>{pending?(ru?'Улучшаем…':'Upgrading…'):(ru?'Улучшить':'Upgrade')}</button>
 </section>;
}
