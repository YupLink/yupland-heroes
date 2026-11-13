import { useAuctionUnread } from "@/components/trade/useAuctionUnread";
import { AuctionUnreadBadge } from "@/components/trade/AuctionUnreadBadge";
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useLang } from '@/lib/i18n';
import { onTradeOpen, type TradeRequest } from '@/lib/tradeBus';
import { openAuction, onAuctionToggle } from '@/lib/auctionBus';
import { openBank, onBankToggle } from '@/lib/bankBus';
import './trade-entry.css';
const Market = lazy(() => import('@/components/castle-live/CastleMarketWindow').then(m => ({ default: m.CastleMarketWindow })));

/** Shared entry; buildings continue to call their own existing destinations. */
export function TradeOverlay() {
  const { unreadCount } = useAuctionUnread();
  const ru = useLang() === 'ru';
  const [request, setRequest] = useState<TradeRequest | null>(null);
  const [market, setMarket] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const destination = useRef(false);
  const ownsAuction = useRef(false);
  const ownsBank = useRef(false);
  const back = useRef<HTMLButtonElement>(null);
  const restore = () => requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus());
  useEffect(() => onTradeOpen(next => {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    destination.current = false;
    setRequest(next);
  }), []);
  useEffect(() => onAuctionToggle(open => {
    if (!open && ownsAuction.current) { ownsAuction.current = false; restore(); }
  }), []);
  useEffect(() => onBankToggle(open => {
    if (!open && ownsBank.current) { ownsBank.current = false; restore(); }
  }), []);
  useEffect(() => { if (market) back.current?.focus(); }, [market]);
  const closeMarket = () => { setMarket(false); restore(); };
  return <>
    <Dialog open={request !== null} onOpenChange={open => { if (!open) setRequest(null); }}>
      <DialogContent className="trade-choice" closeLabel={ru ? 'Закрыть' : 'Close'} onCloseAutoFocus={event => {
        event.preventDefault(); if (!destination.current) restore();
      }}>
        <DialogTitle>{ru ? 'Торговля' : 'Trade'}</DialogTitle>
        <DialogDescription className="sr-only">{ru ? 'Выбери аукцион, рынок фишек или банк' : 'Choose auctions, the chip market or the bank'}</DialogDescription>
        <button type="button" className="trade-choice__option" disabled={!request?.auctionAvailable} onClick={() => {
          destination.current = true; ownsAuction.current = true; setRequest(null);
          // Let the chooser release its modal layer before opening the existing auction.
          requestAnimationFrame(() => openAuction());
        }}>
          <img src="/resources/trade-auction.webp" alt=""/><span><strong>{ru ? 'Аукцион' : 'Auction'}</strong><small>{request?.auctionAvailable ? (ru ? 'Торги за лоты' : 'Bid on lots') : (ru ? 'Сейчас недоступен' : 'Currently unavailable')}</small></span>
          {request?.auctionAvailable && <AuctionUnreadBadge count={unreadCount} menu en={!ru} />}<ChevronRight aria-hidden="true"/>
        </button>
        <button type="button" className="trade-choice__option" onClick={() => { destination.current = true; setRequest(null); setMarket(true); }}>
          <img src="/resources/trade-market.webp" alt=""/><span><strong>{ru ? 'Рынок' : 'Market'}</strong><small>{ru ? 'Покупка и продажа фишек' : 'Buy and sell chips'}</small></span><ChevronRight aria-hidden="true"/>
        </button>
        <button type="button" className="trade-choice__option" onClick={() => {
          destination.current = true; ownsBank.current = true; setRequest(null);
          requestAnimationFrame(() => openBank());
        }}>
          <img src="/resources/trade-bank.webp" alt=""/><span><strong>{ru ? 'Банк' : 'Bank'}</strong><small>{ru ? 'Банковские услуги' : 'Bank services'}</small></span><ChevronRight aria-hidden="true"/>
        </button>
      </DialogContent>
    </Dialog>
    {market && <section className="trade-market" onKeyDown={event => {
      const section = event.currentTarget;
      if (event.target instanceof Element && event.target.closest('[role="dialog"], [role="alertdialog"]') !== section) return;
      if (event.defaultPrevented || section.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (event.key === 'Escape') { event.preventDefault(); closeMarket(); }
      if (event.key === 'Tab') {
        const items = Array.from(section.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]')).filter(el => el.getClientRects().length > 0);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }} role="dialog" aria-modal="true" aria-label={ru ? 'Рынок' : 'Market'}>
      <header><button type="button" ref={back} onClick={closeMarket}><ArrowLeft aria-hidden="true"/>{ru ? 'Назад' : 'Back'}</button><h1>{ru ? 'Рынок' : 'Market'}</h1></header>
      <div className="trade-market__body"><Suspense fallback={<p role="status">{ru ? 'Загрузка…' : 'Loading…'}</p>}><Market /></Suspense></div>
    </section>}
  </>;
}
