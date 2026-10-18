// Battle figures are shown only when the live feature state is known.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ChipImage } from '@/components/ChipImage';
import { ResourceGlyph } from '@/components/ui/ResourceGlyph';
import { hpOf, powerOf } from '@/lib/chipStats';
import { tirageBonus } from '@/lib/tirageBonus';
import { useLang } from '@/lib/i18n';
import './market-listing-detail.css';

type MarketLot = {
  chip: {
    imageUrl: string | null;
    level: number;
    name: string;
    templateNo: number | null;
    serialNo: number | null;
    tirage: number | null;
    isPremium: boolean;
  };
  collectionName: string | null;
  sellerUsername: string | null;
  sellerWallet: string;
  priceTickets: number;
};

export function MarketListingDetail({ listing, mine, buying, buyBlockedReason, buyError, bonusEnabled, onBuy, onClose }: {
  listing: MarketLot;
  mine: boolean;
  buying: boolean;
  buyBlockedReason: string | null;
  buyError: string;
  bonusEnabled?: boolean;
  onBuy: () => void;
  onClose: () => void;
}) {
  const ru = useLang() === 'ru';
  const label = (a: string, b: string) => ru ? a : b;
  const [confirm, setConfirm] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const buyRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const c = listing.chip;
  const [baseMin, baseMax] = powerOf(c.level);
  const baseLife = hpOf(c.level);
  const bonus = tirageBonus(c.tirage, c.isPremium);
  const attackScale = bonusEnabled ? bonus.atkMult : 1;
  const lifeScale = bonusEnabled ? bonus.hpMult : 1;
  const bossAttack = `${Math.round(baseMin * attackScale)}–${Math.round(baseMax * attackScale)}`;
  const bossLife = Math.round(baseLife * lifeScale).toLocaleString(ru ? 'ru-RU' : 'en-US');
  const duelAttack = `${baseMin}–${baseMax}`;
  const price = listing.priceTickets.toLocaleString(ru ? 'ru-RU' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const attackBonusPct = bonusEnabled ? bonus.atkPct : 0;
  const lifeBonusPct = bonusEnabled ? bonus.hpPct : 0;
  const addedLife = Math.round(baseLife * lifeBonusPct / 100).toLocaleString(ru ? 'ru-RU' : 'en-US');
  const baseLifeText = baseLife.toLocaleString(ru ? 'ru-RU' : 'en-US');

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { if (confirm) cancelRef.current?.focus(); }, [confirm]);
  const cancelConfirm = () => {
    setConfirm(false);
    requestAnimationFrame(() => buyRef.current?.focus());
  };

  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (confirm) cancelConfirm();
      else if (!buying) onClose();
    }
    if (event.key !== 'Tab') return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(<div className="market-detail__veil" onClick={event => { if (event.target === event.currentTarget && !buying) onClose(); }}>
    <section className="market-detail" role="dialog" aria-modal="true" aria-labelledby="market-detail-title" onKeyDown={keyDown}>
      <button ref={closeRef} type="button" className="market-detail__close" aria-label={label('Закрыть карточку', 'Close chip details')} disabled={buying} onClick={onClose}><X aria-hidden="true" /></button>
      <div className="market-detail__overview">
        <div className="market-detail__chip-info">
          <div className="market-detail__portrait"><ChipImage src={c.imageUrl ?? ''} level={c.level} alt={c.name} className="w-full" /></div>
          <h2 id="market-detail-title">{listing.collectionName ?? c.name}</h2>
          <div className="market-detail__identity">
            {c.templateNo != null && <span>{label('Вид', 'Type')} №{c.templateNo}</span>}
            <span>{label('Фишка', 'Chip')} №{c.serialNo ?? '?'}</span>
            {c.isPremium && <span className="market-detail__premium">{label('Премиум', 'Premium')}</span>}
          </div>
        </div>
        {bonusEnabled !== undefined && <div className="market-detail__combat">
          <h3>{label('Босс и рейд', 'Boss and raid')}</h3>
          <div className="market-detail__combat-grid">
            <div><span>{label('Атака', 'Attack')}</span><strong>{bossAttack}</strong></div>
            <div><span>{label('Жизнь', 'Health')}</span><strong>{bossLife}</strong></div>
          </div>
          <div className="market-detail__duel"><span>{label('Дуэль с игроком', 'Player duel')}</span><span>{label('Сила', 'Power')} <strong>{duelAttack}</strong></span></div>
        </div>}
      </div>
      {bonusEnabled !== undefined && <details className="market-detail__math">
        <summary>{label('Как получились эти числа', 'How these numbers are calculated')}</summary>
        <div className="market-detail__math-body">
          <p>{label(`Основа фишки ${c.level}★: атака ${duelAttack}, жизнь ${baseLifeText}.`, `Base chip at ${c.level} stars: attack ${duelAttack}, health ${baseLifeText}.`)}</p>
          {bonusEnabled ? <>
            <p>{label(`Тираж коллекции ${c.tirage?.toLocaleString('ru-RU') ?? '—'}: +${bonus.tirageAtkPct}% к атаке, +${bonus.tirageHpPct}% к жизни.`, `Collection supply ${c.tirage?.toLocaleString('en-US') ?? '—'}: +${bonus.tirageAtkPct}% attack, +${bonus.tirageHpPct}% health.`)}</p>
            {c.isPremium && <p>{label('Премиум добавляет ещё +100% к атаке и жизни.', 'Premium adds another +100% attack and health.')}</p>}
          </> : <p>{label('Бонус коллекции сейчас выключен.', 'The collection bonus is currently off.')}</p>}
          <p><strong>{label('Босс и рейд, атака:', 'Boss and raid, attack:')}</strong> {attackBonusPct ? `${duelAttack} × ${attackScale.toLocaleString(ru ? 'ru-RU' : 'en-US')} = ${bossAttack}` : `${duelAttack} = ${bossAttack}`}</p>
          <p><strong>{label('Босс и рейд, жизнь:', 'Boss and raid, health:')}</strong> {lifeBonusPct ? label(`${baseLifeText} + ${addedLife} (${lifeBonusPct}% от ${baseLifeText}) = ${bossLife}`, `${baseLifeText} + ${addedLife} (${lifeBonusPct}% of ${baseLifeText}) = ${bossLife}`) : `${baseLifeText} = ${bossLife}`}</p>
          <p>{label(`В дуэли бонус коллекции не действует: сила ${duelAttack}.`, `The collection bonus does not apply in a duel: power ${duelAttack}.`)}</p>
        </div>
      </details>}
      <div className="market-detail__seller"><span>{label('Продавец', 'Seller')}</span><strong title={listing.sellerUsername ?? listing.sellerWallet}>@{listing.sellerUsername ?? listing.sellerWallet}</strong></div>
      <div className="market-detail__price"><ResourceGlyph kind="tickets" /><span>{price}</span></div>
      {mine ? <p className="market-detail__own">{label('Это твоё объявление', 'This is your listing')}</p> : confirm ?
        <div className="market-detail__confirm" role="group" aria-label={label('Подтверждение покупки', 'Confirm purchase')}>
          <p>{label('Купить фишку за', 'Buy this chip for')} <ResourceGlyph kind="tickets" /> {price}?</p>
          <div><button ref={cancelRef} type="button" disabled={buying} onClick={cancelConfirm}>{label('Отмена', 'Cancel')}</button><button type="button" disabled={buying||!!buyBlockedReason} onClick={onBuy}>{buying ? label('Покупаем…', 'Buying…') : label('Подтвердить', 'Confirm')}</button></div>
        </div> :
        <button ref={buyRef} type="button" className="market-detail__buy" disabled={buying||!!buyBlockedReason} onClick={() => setConfirm(true)}>{label('Купить', 'Buy')}</button>}
      {!mine&&buyBlockedReason&&<p className="market-detail__blocked" role="status">{buyBlockedReason}</p>}
      {!mine&&buyError&&<p className="market-detail__blocked" role="alert">{buyError}</p>}
    </section>
  </div>, document.body);
}
