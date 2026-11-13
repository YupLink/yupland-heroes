// «Исчезнет через N мин» для окна подбитого корабля (dynamite-08). Срок тикает сам, без
// запросов: убирает обломок сервер (ship-sweep), карта узнаёт об этом событием «ships».
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { blastedLeftMin } from "@/lib/shipBlasted";

/** Раз в 15 с хватает: показываем целые минуты. */
const TICK_MS = 15_000;

/** Подпись срока; штампа нет (корабль не подбит) — null, и таймер не заводится. */
export function useBlastedLeft(at: number | null | undefined): string | null {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  const on = at != null;
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [on]);
  const min = blastedLeftMin(at, now);
  if (min === null) return null;
  return min > 0 ? t("braid.ship_blasted_left", { n: min }) : t("braid.ship_blasted_gone");
}
