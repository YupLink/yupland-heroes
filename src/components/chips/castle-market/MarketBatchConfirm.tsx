import { TavernDialog } from '@/components/castle-live/TavernDialog';
import { ResourceGlyph } from '@/components/ui/ResourceGlyph';

export function MarketBatchConfirm({ ru, count, price, net, pending, disabled, onClose, onConfirm }: {
  ru: boolean; count: number; price: string; net: string; pending: boolean; disabled: boolean; onClose: () => void; onConfirm: () => void;
}) {
  return <TavernDialog title={ru ? 'Подтверждение выставления' : 'Confirm listings'} onClose={onClose} locked={pending} className="market-sweep-confirm" overlayClassName="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-3">
    <h2>{ru ? `Выставить фишки: ${count}?` : `List ${count} chips?`}</h2>
    <dl><div><dt>{ru ? 'Цена за фишку' : 'Price per chip'}</dt><dd><ResourceGlyph kind="tickets" />{price}</dd></div><div><dt>{ru ? 'Получишь после продажи всех, с учётом комиссии 9%' : 'After all sell, including the 9% fee'}</dt><dd><ResourceGlyph kind="tickets" />{net}</dd></div></dl>
    <div className="market-sweep-confirm__actions"><button type="button" disabled={pending} onClick={onClose}>{ru ? 'Отмена' : 'Cancel'}</button><button type="button" className="market-listing__submit" disabled={disabled || pending} onClick={onConfirm}>{pending ? (ru ? 'Выставляем…' : 'Listing…') : (ru ? 'Выставить' : 'List')}</button></div>
  </TavernDialog>;
}
