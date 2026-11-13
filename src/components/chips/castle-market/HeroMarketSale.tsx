import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Square, CheckSquare } from 'lucide-react';
import { TavernDialog } from '@/components/castle-live/TavernDialog';
import { getHeroMarketConfig, listMySellableHeroes, listHeroesForSale, type SellableHero } from '@/server/api/hero-market';
import { heroMarketPriceIssue } from '@/lib/heroMarket';
import { newOpId } from '@/lib/opId';
import { humanError } from '@/lib/humanError';
import { useLang, useT } from '@/lib/i18n';
import { money, rarityName } from './heroMarketUi';
import { useEntryRules } from '@/hooks/useEntryRules';

import { thumb } from '@/lib/image';
type Draft = { op:string; heroes:SellableHero[]; gold:number|null; darai:number|null; accepted:Record<string,string> };
export function HeroMarketSale({onClose}:{onClose:()=>void}){
  const ru=useLang()==='ru',t=useT(),qc=useQueryClient(),lock=useRef(false);
  const tr=(a:string,b:string)=>ru?a:b;
  // «Только Google» (§8.127): цена — только золото, поля DARAI нет.
  const goldOnly=useEntryRules().googleOnly;
  const inv=useQuery({queryKey:['hero-market','sellable'],queryFn:()=>listMySellableHeroes()});
  const config=useQuery({queryKey:['hero-market','config'],queryFn:()=>getHeroMarketConfig()});
  const [ids,setIds]=useState<string[]>([]),[search,setSearch]=useState('');
  const [gold,setGold]=useState(''),[darai,setDarai]=useState('');
  const [draft,setDraft]=useState<Draft|null>(null),[result,setResult]=useState<Awaited<ReturnType<typeof listHeroesForSale>>|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const chosen=(inv.data??[]).filter(h=>ids.includes(h.itemId));
  const goldValue=gold.trim()?Number(gold):null,daraiValue=!goldOnly&&darai.trim()?Number(darai):null;
  const issue=chosen.map(h=>heroMarketPriceIssue(h.rarity,goldValue,daraiValue,config.data?.daraiRate??null)).find(Boolean);
  const doneIds=result?.results.filter(r=>r.ok).map(r=>r.itemId)??[];
  const pending=draft?.heroes.filter(h=>!doneIds.includes(h.itemId))??[];
  const warnings=pending.map(hero=>{
    const failure=result?.results.find(r=>r.itemId===hero.itemId&&!r.ok);
    const data=failure&&!failure.ok&&failure.dropsKey?failure:hero;
    return {hero,drops:data.drops??[],toMain:data.toMain??[],key:data.dropsKey??'',noPosition:!!failure&&!failure.ok&&failure.error==='heromkt.no_position'};
  }).filter(row=>row.drops.length);
  const consentReady=warnings.every(row=>!row.noPosition&&draft?.accepted[row.hero.itemId]===row.key);
  const submit=async()=>{
    if(!draft||lock.current||!consentReady)return;
    lock.current=true;setBusy(true);setError('');
    try{
      const next=await listHeroesForSale({data:{op:draft.op,heroes:draft.heroes.map(h=>({itemId:h.itemId,priceGold:draft.gold,priceDarai:draft.darai,acceptKey:draft.accepted[h.itemId]}))}});
      setResult(next);
      await qc.invalidateQueries();
    }catch(e){setError(humanError(e));}
    finally{lock.current=false;setBusy(false);}
  };
  return <TavernDialog title={tr('Выставить героя','List heroes')} onClose={onClose} locked={busy} className="hero-market-sale-dialog" overlayClassName="market-hero-purchase-veil">
    <header><h2>{tr('Выставить героя','List heroes')}</h2><button disabled={busy} onClick={onClose} aria-label={tr('Закрыть','Close')}><X size={22}/></button></header>
    {!draft?<><input placeholder={tr('Поиск по имени','Search by name')} aria-label={tr('Поиск по имени','Search by name')} value={search} onChange={e=>setSearch(e.target.value)}/>
      <p>{tr('Выбрано','Selected')}: {chosen.length}</p>
      <div className="hero-market-sale-list">{inv.isPending?<p>{tr('Загрузка…','Loading…')}</p>:inv.isError?<p role="alert">{humanError(inv.error)} <button onClick={()=>void inv.refetch()}>{tr('Повторить','Retry')}</button></p>:!(inv.data??[]).length?<p>{tr('Нет героев','No heroes')}</p>:(inv.data??[]).filter(h=>h.name.toLowerCase().includes(search.toLowerCase())).map(h=><button key={h.itemId} aria-pressed={ids.includes(h.itemId)} disabled={!h.canList} onClick={()=>setIds(rows=>rows.includes(h.itemId)?rows.filter(id=>id!==h.itemId):rows.length<(config.data?.batchMax??20)?[...rows,h.itemId]:rows)}>
        {h.imageUrl&&<img src={thumb(h.imageUrl, 128)} alt=""/>}<span><b>{h.name}</b><span>{h.race} · {h.specialization}</span><span>{rarityName(h.rarity,ru)} · {tr('Ур.','Lv.')} {h.level}</span>{h.reason&&<small>{t(h.reason)}</small>}</span>{ids.includes(h.itemId)?<CheckSquare size={18}/>:<Square size={18}/>}</button>)}</div>
      <footer><div className="hero-market-sale-prices"><label>{tr('Золото за героя','Gold per hero')}<input inputMode="numeric" value={gold} onChange={e=>setGold(e.target.value)} placeholder="0"/></label>{!goldOnly&&<label>DARAI {tr('за героя','per hero')}<input inputMode="numeric" value={darai} onChange={e=>setDarai(e.target.value)} placeholder="0"/></label>}</div>
      {!goldOnly&&<small>{tr('Одна или обе цены — за каждого выбранного героя.','One or both prices apply to each selected hero.')}</small>}
      {config.data&&<p>{tr('Комиссия','Fee')} {config.data.feePercent}%</p>}{issue&&chosen.length>0&&<p role="status">{t(issue.error,issue.params)}</p>}{config.isError&&<p role="alert">{humanError(config.error)} <button onClick={()=>void config.refetch()}>{tr('Повторить','Retry')}</button></p>}
      <button className="hero-market-primary" disabled={!chosen.length||!!issue||!config.data||inv.isFetching} onClick={()=>{setResult(null);setError('');setDraft({op:newOpId(),heroes:chosen,gold:goldValue,darai:daraiValue,accepted:{}});}}>{tr('Продолжить','Continue')}</button></footer>
    </>:<><div className="hero-market-sale-list">{draft.heroes.map(h=><div className="hero-market-sale-summary" key={h.itemId}><b>{h.name}</b> · {rarityName(h.rarity,ru)}{draft.gold!=null&&<p><img src="/resources/gold.png" alt={tr('Золото','Gold')}/>{money(draft.gold,ru)}</p>}{draft.darai!=null&&<p><img src="/resources/darai.webp" alt="DARAI"/>{money(draft.darai,ru)}</p>}</div>)}
      {warnings.map(({hero,drops,toMain,key,noPosition})=><section key={hero.itemId}><h3>{hero.name}</h3><p>{t(noPosition?'heromkt.no_position':'heromkt.pockets_overflow')}</p>{toMain.map(d=><p key={d.stackKey}>{t('heromkt.pockets_to_main',{name:d.name,n:d.qty})}</p>)}{drops.map(d=><div key={d.stackKey}>{d.bag>0&&<p>{t('heromkt.pockets_drop_bag',{name:d.name,n:d.bag})}</p>}{d.burn>0&&<p>{t('heromkt.pockets_drop_burn',{name:d.name})}</p>}{d.plant>0&&<p>{t('heromkt.pockets_drop_plant',{name:d.name,n:d.plant})}</p>}</div>)}<label><input type="checkbox" disabled={busy||noPosition} checked={draft.accepted[hero.itemId]===key} onChange={e=>setDraft(current=>current?{...current,accepted:{...current.accepted,[hero.itemId]:e.target.checked?key:''}}:current)}/>{t('heromkt.pockets_accept')}</label></section>)}
      {result?.results.map(r=><p key={r.itemId} role={r.ok?'status':'alert'}>{draft.heroes.find(h=>h.itemId===r.itemId)?.name}: {r.ok?tr('Выставлен','Listed'):t(r.error,r.params)}</p>)}{error&&<p role="alert">{error}</p>}</div>
      <footer><button disabled={busy} onClick={()=>{if(result)setDraft(null);else setDraft(null);}}>{tr('Назад','Back')}</button><button className="hero-market-primary" disabled={busy||(!consentReady&&pending.length>0)} onClick={()=>pending.length?void submit():onClose()}>{busy?tr('Подождите…','Please wait…'):!pending.length?tr('Готово','Done'):tr('Подтвердить','Confirm')}</button></footer>
    </>}
  </TavernDialog>;
}
