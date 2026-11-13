// Радиус «второго обзора» на клиенте: 40 под биноклем, иначе 20
// (lib/raid/sight.ts). Срок берётся из списка бустов состояния рейда; в момент
// окончания хук сам перерисовывает — плёнка тумана и мешочки сжимаются без
// перечитки состояния.
import { useEffect, useState } from "react";
import { FOG_ACTIVE_RADIUS } from "@/lib/raid/fogRadius";
import { BINOCULAR_RADIUS, sightUntil } from "@/lib/raid/sight";

export function useSightRadius(buff: unknown): number {
  const [now, setNow] = useState(() => Date.now());
  const until = sightUntil(buff, now);
  useEffect(() => {
    if (!until) return;
    const id = setTimeout(() => setNow(Date.now()), Math.min(until - Date.now() + 50, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [until]);
  return until > now ? BINOCULAR_RADIUS : FOG_ACTIVE_RADIUS;
}
