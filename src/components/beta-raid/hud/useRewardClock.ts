// Часы окна «Добыча»: раз в полминуты — остаток до сгорания награды живёт без
// опроса сервера (RewardTimer). Один интервал на окно, а не на каждую строку.
import { useEffect, useState } from "react";

export function useRewardClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
