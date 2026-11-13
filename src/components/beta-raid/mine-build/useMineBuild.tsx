// Режим стройки шахты и мой чертёж на экране рейда (ПРАВИЛА §8.59 п. 8):
//  · держит режим, пока карта открыта (attachMineBuild), и подаёт ему клетку
//    героя и круг кандидатов с сервера (minePlaceCandidates);
//  · подаёт кадру мой чертёж (getMyMinePlan);
//  · тап по карте: в режиме — призрак на клетку (раньше всего остального); по
//    своему чертежу — окно «Разместить · ⚡N», издалека — маршрут «дойти и
//    разместить» (approachCell). Чертёж ловит только тап, который иначе стал бы
//    обычным ходом: мешочки, сундуки, суда, объекты и постройки — раньше него.
// «✓» положил чертёж — сразу то же, что тап по нему.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import { hexDist, type MinePlanView } from "@/lib/mineBuild";
import { getMyMinePlan, minePlaceCandidates } from "@/server/api/beta-raid/mine-place/mine-plan";
import type { PendingAction } from "../useBetaMovement";
import { MinePlanSheet } from "./MinePlanSheet";
import {
  aimMineBuild,
  attachMineBuild,
  exitMineBuild,
  getMineBuild,
  minePlanKey,
  moveMineGhost,
  planOnMap,
  setBuildCells,
  setMineBuildMap,
  setMinePlan,
  subscribeMineBuild,
  subscribePlanCreated,
} from "./mineBuildStore";

type Hex = { q: number; r: number };

const buildStackKey = (): string | null => getMineBuild()?.stackKey ?? null;

export function useMineBuild(o: {
  /** Открытая карта: чертёж с другой карты не рисуем и не тапаем. */
  mapId: string | null | undefined;
  playerPos: Hex | null;
  energy: number;
  approachCell: (q: number, r: number, action?: PendingAction | null) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  // Экрану — только заготовка режима (строка) и чертёж: движение призрака экран
  // рейда не пересобирает (его рисуют кадр и MineBuildLayer).
  const stackKey = useSyncExternalStore(subscribeMineBuild, buildStackKey, () => null);
  const plan = useSyncExternalStore(subscribeMineBuild, planOnMap, () => null);
  const [sheet, setSheet] = useState(false);
  useEffect(() => attachMineBuild(), []);
  const mapId = o.mapId ?? null;
  useEffect(() => setMineBuildMap(mapId), [mapId]);

  const planQ = useQuery({
    queryKey: minePlanKey(mapId),
    queryFn: () => getMyMinePlan(),
    enabled: mapId !== null,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (planQ.data !== undefined) setMinePlan(planQ.data);
  }, [planQ.data]);

  const hq = o.playerPos?.q ?? null;
  const hr = o.playerPos?.r ?? null;
  /** Сколько раз подряд круг пришёл про другую клетку (повтор — не больше 3). */
  const misses = useRef(0);
  useEffect(() => {
    misses.current = 0;
    if (stackKey && hq !== null && hr !== null) aimMineBuild({ q: hq, r: hr });
  }, [stackKey, hq, hr]);
  const cands = useQuery({
    // Клетка в ключе — только в режиме стройки: иначе запись на каждый шаг героя (сутки в кэше).
    queryKey: ["beta-raid-mine-build", stackKey, stackKey ? hq : null, stackKey ? hr : null],
    queryFn: () => minePlaceCandidates({ data: { stackKey: stackKey ?? "" } }),
    enabled: !!stackKey && hq !== null,
    staleTime: 15_000,
    retry: false,
  });
  // Ответ про другую клетку (сервер ещё не знал о шаге) — спросить заново для
  // нынешней: иначе круг остался бы бесцветным до конца 15-секундного кэша.
  const refetch = cands.refetch;
  useEffect(() => {
    const d = cands.data;
    if (!d) return;
    if (setBuildCells(d.center, d.cells)) {
      misses.current = 0;
      return;
    }
    if (misses.current >= 3) return;
    misses.current++;
    const timer = setTimeout(() => void refetch(), 400);
    return () => clearTimeout(timer);
  }, [cands.data, refetch]);
  useEffect(() => {
    if (!cands.error) return;
    toast.error(serverErrorText(cands.error, t));
    exitMineBuild();
    // Иначе следующий вход в режим взял бы ту же ошибку из кэша и вышел сразу.
    qc.removeQueries({ queryKey: ["beta-raid-mine-build"] });
  }, [cands.error, t, qc]);

  // К чертежу: рядом (или на нём) — окно, далеко — маршрут с ценой постановки.
  const latest = useRef(o);
  latest.current = o;
  const goTo = (p: MinePlanView) => {
    const pos = latest.current.playerPos;
    if (!pos) return;
    if (hexDist(pos, p) <= 1) setSheet(true);
    else
      latest.current.approachCell(p.q, p.r, {
        kind: "mineplan",
        q: p.q,
        r: p.r,
        extraCost: p.energy,
      });
  };
  const goRef = useRef(goTo);
  goRef.current = goTo;
  useEffect(() => subscribePlanCreated((p) => goRef.current(p)), []);

  return {
    /** Тап в режиме стройки — призрак на клетку; true — тап забран режимом. */
    buildTap: (q: number, r: number): boolean => {
      if (!getMineBuild()) return false;
      moveMineGhost(q, r);
      return true;
    },
    /** Тап, ставший бы обычным ходом, по своему чертежу: окно или маршрут к нему. */
    planTap: (q: number, r: number): boolean => {
      const p = planOnMap();
      if (!p || p.q !== q || p.r !== r) return false;
      goTo(p);
      return true;
    },
    /** Дошли до чертежа маршрутом «дойти и разместить». */
    arrive: () => setSheet(true),
    sheet:
      sheet && plan ? (
        <MinePlanSheet plan={plan} energy={o.energy} onClose={() => setSheet(false)} />
      ) : null,
  };
}
