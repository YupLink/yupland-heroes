import { createContext, useContext } from "react";
import { Clock } from "lucide-react";
import { timeLeft } from "./auctionFormat";

export const AuctionTime = createContext(0);
/** Only the clock subscribes to the second tick; cards retain memoization. */
export function AuctionClock({ endAt, en, mine }: { endAt: string; en: boolean; mine: boolean }) {
  const now = useContext(AuctionTime);
  return <div className="auction-lot__clock">
    {mine && <span>{en ? "Your lot" : "Твой лот"}</span>}
    <b><Clock aria-hidden="true" />{timeLeft(endAt, now, en)}</b>
    <small>{en ? "Time left" : "До конца"}</small>
  </div>;
}
