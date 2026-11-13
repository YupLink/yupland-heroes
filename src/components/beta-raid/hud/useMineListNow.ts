// Часы сервера для списка шахт «Добычи» (lib/mineV2Clock): срок «ещё …» и
// поломка — по ним, а не по часам телефона.
import { useEffect, useState } from "react";
import { mineBrokenNow, mineServerNow, type MineClockStamps } from "@/lib/mineV2Clock";
import type { MineRow } from "@/server/api/beta-raid/mine-pendings";

const HOUR_MS = 3_600_000;

/**
 * Тикают, пока есть работающая v2: в последний час до поломки — раз в секунду
 * (там «мин с»), иначе раз в полминуты. Работающих нет — стоят.
 */
export function useMineListNow(clock: MineClockStamps | undefined, mines: MineRow[]): number {
  const [device, setDevice] = useState(() => Date.now());
  const now = mineServerNow(clock, device);
  const live = mines.filter((m) => m.v2 && !mineBrokenNow(m.v2, now));
  const soon = live.some((m) => (m.v2?.breakAt ?? 0) - now < HOUR_MS);
  const step = live.length === 0 ? 0 : soon ? 1000 : 30_000;
  useEffect(() => {
    if (!step) return;
    const id = setInterval(() => setDevice(Date.now()), step);
    return () => clearInterval(id);
  }, [step]);
  return now;
}
