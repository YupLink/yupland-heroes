import { useEffect, useState } from 'react';
import { LayoutGrid } from 'lucide-react';

export type MarketView = 'list' | '2' | '3';
const storageKey = 'yuplink.market.view.v1';
const valid = (value: string | null): value is MarketView => ['list', '2', '3'].includes(value ?? '');
export function useMarketView() {
  const [view, setView] = useState<MarketView>('2');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try { const saved = localStorage.getItem(storageKey); if (valid(saved)) setView(saved); else if(saved === '1') setView('3'); } catch { /* Storage may be unavailable in private webviews. */ }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) { try { localStorage.setItem(storageKey, view); } catch { /* Keep the current session usable. */ } } }, [view, loaded]);
  return [view, setView] as const;
}
export function MarketViewControl({ view, onChange, ru }: { view: MarketView; onChange: (view: MarketView) => void; ru: boolean }) {
  const views: MarketView[] = ['list', '2', '3'];
  const current = view;
  const next = views[(views.indexOf(current) + 1) % views.length];
  const names = ru
    ? { list: 'список', '1': '1 в ряд', '2': '2 в ряд', '3': '3 в ряд' }
    : { list: 'list', '1': '1 per row', '2': '2 per row', '3': '3 per row' };
  const label = ru ? `Вид каталога: ${names[current]}. Переключить: ${names[next]}` : `Catalog layout: ${names[current]}. Switch to ${names[next]}`;
  return <button type="button" className="market-view-control" aria-label={label} title={label} onClick={() => onChange(next)}>
    <LayoutGrid size={20} aria-hidden="true" />
  </button>;
}

export function formatMarketCount(count: number, ru: boolean) {
  const locale = ru ? 'ru-RU' : 'en-US';
  if (count < 10000) return count.toLocaleString(locale);
  const scale = count >= 1000000 ? 1000000 : 1000;
  return `${(Math.floor(count / scale * 10) / 10).toLocaleString(locale, {maximumFractionDigits:1})}${scale === 1000000 ? 'M' : 'K'}`;
}
export function MarketOfferCount({count,ru,pending=false}:{count:number|null;ru:boolean;pending?:boolean}) {
  const label = ru ? 'Кол-во' : 'Count';
  if (count === null) return <span className="market-catalog-toolbar__count">{label} · {pending ? '…' : '—'}</span>;
  const exact = count.toLocaleString(ru ? 'ru-RU' : 'en-US');
  return <details className="market-catalog-toolbar__count market-catalog-count" key={count}>
    <summary aria-label={`${label}: ${exact}. ${ru ? 'Показать точное количество' : 'Show exact count'}`}>{label} · {formatMarketCount(count,ru)}</summary>
    <span className="market-catalog-count__exact" role="status">{label} · {exact}</span>
  </details>;
}
