import "./pack-buy-shelf-slot.css";

export function PackBuyShelfSlot({ count, onClick, ru }: { count: number; onClick: () => void; ru: boolean }) {
  return <div className={`pack-shelf-item pack-shelf-buy-item${count % 3 === 1 ? " pack-shelf-buy-item--end" : ""}`}>
    <button type="button" className="pack-shelf-buy-trigger" onClick={onClick} aria-label={ru ? "Купить паки" : "Buy packs"}>
      <span className="pack-shelf-buy-art" aria-hidden="true">
        <svg viewBox="10 14 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 31 31 17h56l9 14v58L81 101H16V31Z" fill="currentColor" fillOpacity=".06" />
          <path d="M16 31h65v70H16V31Zm65 0 15-14v58L81 101V31ZM16 31l15-14h65L81 31H16Z" stroke="currentColor" strokeWidth="1.7" strokeDasharray="5 5" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="pack-shelf-buy-label barracks-buy-packs">{ru ? "Купить паки" : "Buy packs"}</span>
    </button>
  </div>;
}
