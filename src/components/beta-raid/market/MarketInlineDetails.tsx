import {useLayoutEffect, useRef, useState, type ReactNode} from 'react';

/** The probe is out of flow: details may use spare space, never create it. */
export function MarketInlineDetails({lines, children, reserveAction=false}: {lines: string[]; children: ReactNode; reserveAction?:boolean}) {
  const meta = useRef<HTMLDivElement>(null);
  const offer = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState<string[]>([]);
  const key = JSON.stringify(lines);
  useLayoutEffect(() => {
    const box = meta.current, price = offer.current, label = probe.current;
    if (!box || !price || !label) return;
    const measure = () => {
      const columns = box.closest('.raid-market-grid')?.getAttribute('data-columns');
      const list = columns === '1';
      const compact = columns === '2';
      const inset = list ? Math.max(112, price.offsetWidth + 12) : 0;
      const width = box.clientWidth - inset - (!list && reserveAction ? 16 : 0);
      label.style.width = `${Math.max(0, width)}px`;
      label.style.whiteSpace = list ? 'pre-line' : 'nowrap';
      const available = list ? box.clientHeight : box.clientHeight - price.offsetHeight - 2;
      box.style.setProperty('--brief-width', `${Math.max(0, width)}px`);
      box.style.setProperty('--brief-inset', `${inset}px`);
      box.style.setProperty('--offer-height', `${price.offsetHeight}px`);
      const capacity = compact ? (price.offsetHeight + 14 <= 48 ? 1 : 0) : Math.min(list ? 2 : 1, Math.max(0, Math.floor(available / 12)));
      const next: string[] = [];
      for (const line of JSON.parse(key) as string[]) {
        if (next.length >= capacity) break;
        label.textContent = list ? [...next, line].join('\n') : line;
        // Keep whole properties: one compact line, or at most two in list view.
        if (width >= 48 && label.scrollWidth <= width && label.scrollHeight <= capacity * 12) next.push(line);
      }
      setShown(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box); observer.observe(price);
    return () => observer.disconnect();
  }, [key,reserveAction]);
  return <div ref={meta} className="raid-market-meta" data-inline={!!shown.length || undefined}>
    <span ref={probe} className="raid-market-brief-probe" aria-hidden="true"/>
    {!!shown.length && <span className="raid-market-brief">{shown.map((line,i)=><span key={i}>{line}</span>)}</span>}
    <div ref={offer} className="raid-market-offer">{children}</div>
  </div>;
}
