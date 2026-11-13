// Таймер ячейки грибов: сколько до самого раннего выпадения из рюкзака (час
// или конец жизни — lib/daraiMine). Тикает сам, раз в секунду; на ячейке
// рюкзака — коротко «мм:сс» (больше часа не бывает: час в рюкзаке — предел),
// в окне «Посадить» — строкой «Выпадет через мм:сс». heroId — чей рюкзак
// (в замке смотрят любого своего героя); нет — выбранного героя.
import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";
import { useT } from "@/lib/i18n";
import { dmineClock, dmineLeftMs } from "@/lib/daraiMine";
import { useDaraiMineExpiry } from "./useDaraiMines";

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function DaraiMineTimer({
  stackKey,
  heroId,
  line = false,
  className = "",
}: {
  stackKey: string;
  heroId?: string | null;
  line?: boolean;
  /** Ячейка своего вида (замок, склад): где стоять и подложка. */
  className?: string;
}) {
  const t = useT();
  const at = useDaraiMineExpiry(stackKey, heroId);
  const now = useNow(at !== null);
  if (at === null) return null;
  const left = dmineLeftMs(at, now);
  const clock = dmineClock(left);
  if (line) {
    return (
      <p className="flex items-center justify-center gap-1 text-xs font-semibold tabular-nums text-amber-200">
        <Hourglass className="h-3.5 w-3.5" />
        {t("dmine.left", { t: clock })}
      </p>
    );
  }
  // span, не div: ячейка склада и замка — кнопка.
  return (
    <span
      role="timer"
      aria-label={t("dmine.left", { t: clock })}
      className={`flex w-max items-center gap-0.5 whitespace-nowrap text-[9px] font-bold leading-tight tabular-nums ${left < 5 * 60_000 ? "text-destructive" : "text-gold"} ${className}`}
    >
      <Hourglass className="h-2.5 w-2.5 shrink-0" />
      {clock}
    </span>
  );
}
