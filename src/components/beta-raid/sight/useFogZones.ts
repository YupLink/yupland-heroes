// Зоны тумана номерами клеток — кэшируются, чтобы не пересчитывать каждый
// кадр. Только герой и mineFlags 'own': fieldSlots и warehouseBadges зоны
// НЕ дают (см. fogZones.ts) — чужие поля и соседи складов стояли без плёнки.
// Радиус активной зоны — «второй обзор»: 20, под биноклем 40 (useSightRadius).
// Вынесено из BetaRaidCanvas.tsx (файл за лимитом строк).
import { useMemo } from "react";
import { buildFogZones } from "../fogZones";
import { useSightRadius } from "./useSightRadius";
import { fogReachRadius } from "@/lib/raid/sight";

type Args = Omit<Parameters<typeof buildFogZones>[0], "heroQ" | "heroR" | "mounds" | "radius" | "reach"> & {
  playerPos: { q: number; r: number } | null | undefined;
  ground: { mounds: readonly string[] } | null | undefined;
  /** Бусты состояния рейда: в них срок бинокля. */
  buff: unknown;
  /** Карта: в Свартальвхейме досягаемости в неразведанном нет. */
  mapId: string | null | undefined;
};

export function useFogZones({ store, playerPos, mineFlags, ground, buff, mapId }: Args) {
  const heroQ = playerPos?.q ?? null;
  const heroR = playerPos?.r ?? null;
  const radius = useSightRadius(buff);
  // Бинокль раздвигает и досягаемость в неразведанном: 10 → 20 (в Свартальвхейме — нет).
  const reach = fogReachRadius(mapId, radius);
  // Мои бугорки строкой: слой мешочков перечитывается часто, а зоны тумана
  // пересчитываем, только когда сменился сам набор бугорков.
  const moundsKey = ground?.mounds.join(";") ?? "";
  return useMemo(
    () =>
      buildFogZones({
        store,
        heroQ,
        heroR,
        mineFlags,
        mounds: moundsKey ? moundsKey.split(";") : [],
        radius,
        reach,
      }),
    [heroQ, heroR, mineFlags, moundsKey, store, radius, reach],
  );
}
