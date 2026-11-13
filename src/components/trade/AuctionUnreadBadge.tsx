import { memo } from "react";
import "./auction-unread.css";
function AuctionUnreadBadgeView({ count, menu = false, en = false, label }: {
  count?: number | null; menu?: boolean; en?: boolean;
  /** Своя подпись числа (свёрнутое меню рейда: «есть что забрать»). */
  label?: string;
}) {
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count <= 0) return null;
  return <span className={`auction-unread-badge${menu ? " auction-unread-badge--menu" : ""}`}
    aria-label={label ? `${label}: ${count}` : en ? `Unseen listings: ${count}` : `Непросмотренных лотов: ${count}`}>
    {count}
  </span>;
}

// memo: экран рейда перерисовывается на каждый шаг героя, а этому компоненту
// шаг ни при чём — без memo он с иконками шёл следом (замер 06.11.2026).
export const AuctionUnreadBadge = memo(AuctionUnreadBadgeView);
