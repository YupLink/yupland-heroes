// Shared market listing dialog. The workshop intercepts these API calls in its fixture adapter.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2, Search, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import { ResourceGlyph } from '@/components/ui/ResourceGlyph';
import { myChipInventory } from '@/server/api/chips-pack';
import { createMarketListingsBatch } from '@/server/api/chipsMarket';
import { useLang, useT } from '@/lib/i18n';
import './market-create-listing.css';
import { useMarketSweep } from './useMarketSweep';
import { MarketBatchConfirm } from './MarketBatchConfirm';

const PAGE = 120;
type Group = Awaited<ReturnType<typeof myChipInventory>>[number];
type Chip = {
  id: string; level: number; imageUrl: string | null; serialNo: number | null;
  collectionId: string; collectionName: string; restUntil?: string | null; stunUntil?: string | null;
};

export function MarketCreateListing({ onClose, onListed, initialChipId }: { onClose: () => void; onListed?: () => void; initialChipId?: string }) {
  const ru = useLang() === 'ru';
  const t = useT();
  const label = (a: string, b: string) => ru ? a : b;
  const qc = useQueryClient();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const inv = useQuery({ queryKey: ['my-chip-inventory'], queryFn: () => myChipInventory() });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selecting, setSelecting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [picked, setPicked] = useState<string[]>(() => initialChipId ? [initialChipId] : []);
  const [price, setPrice] = useState('');
  const [failure, setFailure] = useState('');
  const [failedDetails, setFailedDetails] = useState<string[]>([]);
  const [collection, setCollection] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [viewport, setViewport] = useState<{ top: number; height: number; keyboard: boolean } | null>(null);

  const chips = useMemo(() => {
    const all = (inv.data ?? []).flatMap((g: Group): Chip[] => (g.chips ?? []).filter(c => !c.studying).map(c => ({
      id: c.id, level: g.level, imageUrl: g.imageUrl ?? null, serialNo: c.serialNo,
      collectionId: g.collectionId, collectionName: g.collectionName,
      restUntil: c.restUntil, stunUntil: c.stunUntil,
    })));
    // Одинаковые фишки — рядом: провёл пальцем по ряду или нажал «Все видимые» —
    // отметил одну и ту же фишку, а не вперемешку (жалоба 14.10).
    // Открыли с карточки фишки — она первая, а не где-то за «Показать ещё».
    return all.sort((a, b) => Number(b.id === initialChipId) - Number(a.id === initialChipId) || a.collectionName.localeCompare(b.collectionName) || (a.imageUrl ?? '').localeCompare(b.imageUrl ?? '')
      || b.level - a.level || (a.serialNo ?? 0) - (b.serialNo ?? 0));
  }, [inv.data, initialChipId]);
  /** Сколько карточек нарисовано: у держателей тысячи фишек, всё сразу клал телефон. */
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [collection, search]);
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!inv.isSuccess) return;
    const available = new Set(chips.map(chip => chip.id));
    setPicked(previous => previous.every(id => available.has(id)) ? previous : previous.filter(id => available.has(id)));
  }, [chips, inv.isSuccess]);
  const collections = useMemo(() => Array.from(new Map(chips.map(c => [c.collectionId, c.collectionName])).entries()), [chips]);
  const shown = useMemo(() => chips.filter(c => (!collection || c.collectionId === collection) &&
    (!search || `${c.collectionName} ${c.serialNo ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))), [chips, collection, search]);
  const drawn = shown.slice(0, limit);
  const amount = Number(price.replace(',', '.'));
  const overMax = amount > 1_000_000;
  const validPrice = Number.isFinite(amount) && amount >= .1 && !overMax && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-7;
  const total = amount * picked.length;
  // The market rounds the 9% fee for each sold listing, then credits the seller.
  const feePerChip = validPrice ? Math.round(amount * .09 * 100) / 100 : 0;
  const sellerTotal = validPrice ? (amount - feePerChip) * picked.length : 0;
  const money = (n: number) => n.toLocaleString(ru ? 'ru' : 'en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const chipNoun = (n: number) => n % 10 === 1 && n % 100 !== 11 ? 'фишка' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'фишки' : 'фишек';
  const busyChip = (c: Chip) => [c.restUntil, c.stunUntil].some(value => value && new Date(value).getTime() > now);
  const failureReason = (reason: string, minutes?: number) => {
    if (reason === 'market.chip_stunned_min') return t(reason, { n: minutes ?? 0 });
    if (ru) return reason;
    return ({ 'фишка не найдена': 'Chip not found', 'не твоя фишка': 'This chip is not yours',
      'фишка занята': 'Chip is busy', 'отдыхает после передачи': 'Chip is resting after transfer',
      'занята другой операцией': 'Chip is busy with another action', 'лот не создался': 'Listing could not be created' } as Record<string, string>)[reason]
      ?? 'This chip could not be listed';
  };
  const mutation = useMutation({
    mutationFn: () => createMarketListingsBatch({ data: { chipIds: picked, priceTickets: amount } }),
    onSuccess: result => {
      setConfirming(false);
      // Выставленные фишки уходят из списка сразу, не дожидаясь перечитки инвентаря.
      const gone = new Set(picked.filter(id => !result.failed.some(f => f.chipId === id)));
      qc.setQueryData<Group[]>(['my-chip-inventory'], old => old?.map(g => ({ ...g, chips: (g.chips ?? []).filter(c => !gone.has(c.id)) })));
      void Promise.allSettled([qc.invalidateQueries({ queryKey: ['market'] }), qc.invalidateQueries({ queryKey: ['my-chip-inventory'] }), qc.invalidateQueries({ queryKey: ['my-chip-history'] })]);
      if (result.failed.length) {
        setPicked(result.failed.map(item => item.chipId));
        setFailure(label(`Выставлено: ${result.listed}. Остались: ${result.failed.length}.`, `Listed: ${result.listed}. Remaining: ${result.failed.length}.`));
        setFailedDetails(result.failed.map(item => {
          const chip = chips.find(candidate => candidate.id === item.chipId);
          const chipName = chip ? label(`Фишка №${chip.serialNo ?? '?'}`, `Chip #${chip.serialNo ?? '?'}`) : label('Фишка', 'Chip');
          return `${chipName}: ${failureReason(item.reason, item.minutes)}`;
        }));
      } else if (result.listed) {
        setFailedDetails([]);
        toast.success(label(`Выставлено фишек: ${result.listed}`, `Chips listed: ${result.listed}`));
        (onListed ?? onClose)();
      } else { setFailedDetails([]); setFailure(label('Не удалось выставить выбранные фишки.', 'Could not list selected chips.')); }
    },
    onError: () => { setConfirming(false); setFailedDetails([]); setFailure(label('Не удалось выставить фишки. Повтори попытку.', 'Could not list chips. Try again.')); },
  });

  const changeSelection = (ids: string[]) => { setPicked(ids); setFailure(''); setFailedDetails([]); };
  const sweepOrder = useMemo(() => drawn.filter(c => !busyChip(c)).map(c => c.id), [drawn, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const sweep = useMarketSweep({ enabled: selecting && !confirming && !mutation.isPending && !inv.isPending && !inv.isError, order: sweepOrder, selected: picked, onChange: changeSelection, scrollRef, limit: 100 });
  /** «Все видимые»: до 100 свободных фишек из того, что сейчас отфильтровано. */
  const pickVisible = () => changeSelection(shown.filter(c => !busyChip(c)).slice(0, 100).map(c => c.id));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (confirming || !dialogRef.current?.contains(event.target as Node)) return;
      if (event.key === 'Escape') {
        if (menuOpen) setMenuOpen(false);
        else if (!mutation.isPending) onClose();
      }
      if (event.key === 'Tab') {
        const focusables = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') ?? []);
        if (!focusables.length) return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [menuOpen, mutation.isPending, onClose, confirming]);
  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);
  useEffect(() => {
    const visual = window.visualViewport;
    if (!visual) return;
    const initialHeight = visual.height;
    const update = () => setViewport({ top: visual.offsetTop, height: visual.height, keyboard: visual.height < initialHeight - 100 });
    update();
    visual.addEventListener('resize', update);
    visual.addEventListener('scroll', update);
    return () => { visual.removeEventListener('resize', update); visual.removeEventListener('scroll', update); };
  }, []);

  return createPortal(<div className={`market-listing-veil${viewport?.keyboard ? ' is-keyboard' : ''}`} style={viewport ? { top: viewport.top, height: viewport.height, bottom: 'auto' } : undefined} onPointerDown={event => {
    if (event.target === event.currentTarget && !mutation.isPending && !confirming) onClose();
  }}>
    <section className="market-listing" role="dialog" aria-modal="true" aria-labelledby="market-listing-title" ref={dialogRef} tabIndex={-1}>
      <header className="market-listing__header">
        <h2 id="market-listing-title">{label('Выставить фишки', 'List chips')}</h2>
        <button ref={closeRef} type="button" className="market-listing__close" aria-label={label('Закрыть', 'Close')} disabled={mutation.isPending} onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <div className="market-listing__tools">
        <div className="market-listing__collection">
          <button type="button" aria-haspopup="listbox" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            <span>{collection ? collections.find(([id]) => id === collection)?.[1] : label('Все коллекции', 'All collections')}</span><ChevronDown aria-hidden="true" />
          </button>
          {menuOpen && <div className="market-listing__menu" role="listbox" aria-label={label('Коллекции', 'Collections')}>
            <button type="button" role="option" aria-selected={!collection} onClick={() => { setCollection(''); setMenuOpen(false); }}>{label('Все коллекции', 'All collections')}</button>
            {collections.map(([id, name]) => <button key={id} type="button" role="option" aria-selected={collection === id} onClick={() => { setCollection(id); setMenuOpen(false); }}>{name}</button>)}
          </div>}
        </div>
        <button type="button" className="market-listing__search-toggle" aria-label={label('Поиск фишки', 'Search chips')} aria-expanded={searchOpen} onClick={() => setSearchOpen(!searchOpen)}><Search aria-hidden="true" /></button>
      </div>
      {searchOpen && <input ref={searchRef} className="market-listing__search" value={search} onChange={event => setSearch(event.target.value)} placeholder={label('Коллекция или номер фишки', 'Collection or chip number')} aria-label={label('Поиск фишки', 'Search chips')} />}
      <div className="market-listing__count"><span role="status">{label('Выбрано:', 'Selected:')} <strong>{picked.length}/100</strong></span><button type="button" disabled={mutation.isPending} onClick={() => {setSelecting(!selecting); if(selecting)changeSelection([]);}}>{selecting ? label('Отмена','Cancel') : label('Выбрать','Select')}</button><button type="button" disabled={mutation.isPending || inv.isPending} onClick={pickVisible}>{label('Все видимые','All visible')}</button>{picked.length > 0 && <button type="button" disabled={mutation.isPending} onClick={() => changeSelection([])}>{label('Сбросить','Clear')}</button>}</div>
      {selecting && <p className="market-listing__sweep-hint">{label('Нажми и проведи по фишкам','Tap and drag across chips')}</p>}
      <div ref={scrollRef} className="market-listing__scroll" tabIndex={0} aria-label={label('Мои фишки', 'My chips')}>
        {inv.isPending ? <div className="market-listing__state" role="status"><Loader2 className="animate-spin" />{label('Загрузка…', 'Loading…')}</div>
          : inv.isError ? <div className="market-listing__state" role="alert">{label('Не удалось загрузить фишки.', 'Could not load chips.')} <button onClick={() => void inv.refetch()}>{label('Повторить', 'Retry')}</button></div>
          : shown.length === 0 ? <div className="market-listing__state">{label(chips.length ? 'Ничего не найдено.' : 'Нет фишек для выставления.', chips.length ? 'No chips found.' : 'No chips to list.')}</div>
          : <div className={`market-listing__grid ${selecting ? 'is-sweeping' : ''}`} {...sweep}>{drawn.map(c => {
            const active = pickedSet.has(c.id), busy = busyChip(c);
            return <button key={c.id} data-sweep-id={c.id} type="button" className={`market-listing__chip${active ? ' is-picked' : ''}`} role="checkbox" aria-checked={active} aria-label={label(`Фишка №${c.serialNo ?? '?'}`, `Chip #${c.serialNo ?? '?'}`)} disabled={busy || mutation.isPending} onClick={() => { if(selecting)return; setFailure(''); setFailedDetails([]); setPicked(old => {
              if (active) return old.filter(id => id !== c.id);
              if (old.length >= 100) { toast.error(label('За раз можно выставить до 100 фишек.', 'You can list up to 100 chips at once.')); return old; }
              return [...old, c.id];
            }); }}>
              {active && <span className="market-listing__check"><Check aria-hidden="true" /></span>}
              <span className="market-listing__portrait"><img src={c.imageUrl ?? ''} alt="" loading="lazy" /><span>#{c.serialNo ?? '?'}</span></span>
              <span className="market-listing__stars" aria-hidden="true">{Array.from({ length: Math.ceil(c.level) }, (_, i) => <Star key={i} fill="currentColor" />)}</span>
            </button>;
          })}</div>}
        {!inv.isPending && limit < shown.length && <button type="button" className="market-listing__more" onClick={() => setLimit(limit + PAGE * 2)}>{label('Показать ещё', 'Show more')} · {shown.length - limit}</button>}
      </div>
      <footer className="market-listing__footer">
        {failure && <p className="market-listing__feedback" role="alert">{failure}</p>}
        {failedDetails.length > 0 && <details className="market-listing__failures" open>
          <summary>{label('Причины по фишкам', 'Reasons by chip')}</summary>
          <ul>{failedDetails.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
        </details>}
        {overMax && <p className="market-listing__feedback" role="alert">{label('Цена за фишку не может быть выше 1 000 000 билетов.', 'Price per chip cannot exceed 1,000,000 tickets.')}</p>}
        <div className="market-listing__price-row">
          <label><span>{label('Цена за фишку', 'Price per chip')}</span><span className="market-listing__price-input"><ResourceGlyph kind="tickets" /><input type="number" inputMode="decimal" min="0.1" max="1000000" step="0.01" value={price} onChange={event => {setPrice(event.target.value);setFailure('');setFailedDetails([]);}} placeholder="0,00" aria-label={label('Цена за фишку в билетах', 'Price per chip in tickets')} /></span></label>
          <div className="market-listing__total"><span>{picked.length} {label(`${chipNoun(picked.length)} · всего`, picked.length === 1 ? 'chip · total' : 'chips · total')}</span><div className="market-listing__total-values"><strong><ResourceGlyph kind="tickets" />{picked.length && validPrice ? money(total) : '—'}</strong><small className="market-listing__net">{label('После комиссии 9%', 'After 9% fee')} · {picked.length && validPrice ? money(sellerTotal) : '—'}</small></div></div>
        </div>
        <button type="button" className="market-listing__submit" disabled={!picked.length || !validPrice || mutation.isPending || inv.isPending || inv.isError} onClick={() => setConfirming(true)}>{mutation.isPending ? label('Выставляем…', 'Listing…') : label(`Выставить${picked.length ? ` · ${picked.length}` : ''}`, `List${picked.length ? ` · ${picked.length}` : ''}`)}</button>
      </footer>
    </section>
    {confirming && <MarketBatchConfirm ru={ru} count={picked.length} price={money(amount)} net={money(sellerTotal)} pending={mutation.isPending} disabled={!picked.length || !validPrice || inv.isPending || inv.isError} onClose={() => setConfirming(false)} onConfirm={() => { if(!picked.length || !validPrice || mutation.isPending || inv.isPending || inv.isError)return; setFailure('');setFailedDetails([]);mutation.mutate(); }} />}
  </div>, document.body);
}
