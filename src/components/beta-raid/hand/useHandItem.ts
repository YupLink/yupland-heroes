// Вещь в руке на карте (handStore): круг досягаемости идёт за героем, тап решает
// handTapPlan, кладёт землю тот же путь, что окно рюкзака (useLandPlace), жилу — тот
// же, что окно жилы (useVeinPlace), бросает — тот же, что окно динамита
// (useDynamiteThrow), гриб — тот же, что окно посадки (useMushroomPlace). Стопка кончилась или здесь нельзя (другой мир, остров) — рука
// освобождается сама.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import { DYNAMITE_ENERGY } from "@/lib/dynamite";
import { MUSHROOM_ENERGY } from "@/lib/daraiMine";
import { getMyBackpack } from "@/server/api/beta-raid/market-backpack-read";
import { useLandPlace } from "@/components/beta-raid/land/useLandPlace";
import { useVeinPlace } from "@/components/beta-raid/vein/useVeinPlace";
import { useDynamiteThrow } from "@/components/beta-raid/dynamite/useDynamiteThrow";
import { useMushroomPlace } from "@/components/beta-raid/dmine/useMushroomPlace";
import { isWaterCell, type TerrainInfo } from "@/components/beta-raid/hexStepCost";
import type { MapLike } from "@/components/beta-raid/patchMapCache";
import type { Cell } from "@/components/beta-raid/unpackMap";
import {
  DOUBLE_TAP_MS,
  blueShipTooFar,
  handTapPlan,
  redOnForeignShip,
  withLiveShip,
} from "./handTap";
import { SHIPS_KEY, type ShipsData } from "@/components/beta-raid/patchShipsCache";
import {
  attachHand,
  dropHand,
  getHand,
  getQuick,
  handAt,
  setHandCells,
  setHandRunner,
  setSpot,
  subscribeHand,
  tapMuted,
  toggleMark,
  unmark,
  type HandCell,
} from "./handStore";

type Hex = { q: number; r: number };
const noop = () => {};
type Circle = { center: Hex; cells: Array<Omit<HandCell, "q" | "r" | "cost"> & { cost?: number }> };

/** Круг досягаемости — абсолютными клетками; у динамита цена — бросок. */
const toCells = (d: Circle | undefined, cost: number | null): HandCell[] | null =>
  d
    ? d.cells.map((c) => ({
        ...c,
        q: d.center.q + c.dq,
        r: d.center.r + c.dr,
        cost: cost ?? c.cost ?? 0,
        hit: c.hit ?? null,
      }))
    : null;

/**
 * Клетка героя, когда он постоял: на ходу круг не перечитываем на каждый шаг.
 *
 * Только пока в руке что-то есть. Хук живёт в самом экране рейда, и раньше его
 * таймер через 300 мс после КАЖДОГО шага перерисовывал экран целиком (замер
 * 06.11.2026: лишняя перерисовка на каждый конец пути), а ключи подсветки с
 * клеткой оставляли в кэше по три записи на каждую пройденную клетку на сутки.
 * С пустой рукой клетки нет вовсе; взяли вещь — клетка нынешняя, сразу.
 */
function useSettled(pos: Hex | null, active: boolean): Hex | null {
  const [at, setAt] = useState<Hex | null>(active ? pos : null);
  const [q, r] = [pos?.q, pos?.r];
  const was = useRef(active);
  useEffect(() => {
    if (!active) {
      was.current = false;
      return;
    }
    const here = q == null || r == null ? null : { q, r };
    if (!was.current) {
      was.current = true;
      setAt(here);
      return;
    }
    const id = setTimeout(() => setAt(here), 300);
    return () => clearTimeout(id);
  }, [q, r, active]);
  return active ? at : null;
}

export function useHandItem({
  playerPos,
  cells,
  clearPath,
}: {
  playerPos: Hex | null;
  /** Клетки карты: вода ли под тапом. */
  cells: Record<string, Cell>;
  /** Снять плашку маршрута (двойной тап сделал дело вместо хода). */
  clearPath: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const hand = useSyncExternalStore(subscribeHand, getHand, () => null);
  useEffect(() => attachHand(), []);
  const stackKey = hand?.stackKey ?? null;
  const at = useSettled(playerPos, stackKey !== null);
  const land = useLandPlace(hand?.kind === "land" ? stackKey : null, at);
  const vein = useVeinPlace(hand?.kind === "vein" ? stackKey : null, at);
  const dyn = useDynamiteThrow(hand?.kind === "dynamite" ? stackKey : null, noop, at);
  const shroom = useMushroomPlace(hand?.kind === "mushroom" ? stackKey : null, at);
  const use =
    hand?.kind === "dynamite"
      ? dyn
      : hand?.kind === "vein"
        ? vein
        : hand?.kind === "mushroom"
          ? shroom
          : land;
  const bp = useQuery({
    queryKey: ["my-hero-backpack"],
    queryFn: () => getMyBackpack(),
    enabled: !!stackKey,
  });
  const stack = bp.data?.stacks.find((s) => s.stackKey === stackKey) ?? null;

  const data = use.cells.data as Circle | undefined;
  const cost =
    hand?.kind === "dynamite"
      ? DYNAMITE_ENERGY
      : hand?.kind === "mushroom"
        ? MUSHROOM_ENERGY
        : null;
  useEffect(() => {
    if (stackKey) setHandCells(stackKey, toCells(data, cost));
  }, [data, cost, stackKey]);

  // Здесь нельзя (другой мир, остров) — рука свободна, причина в тосте.
  const failed = use.cells.isError;
  const error = use.cells.error;
  useEffect(() => {
    if (!stackKey || !failed) return;
    toast.error(serverErrorText(error, t));
    dropHand();
  }, [failed, error, stackKey, t]);

  // Последняя штука ушла — в руке больше нечего держать.
  const busy = use.batch.busy;
  useEffect(() => {
    if (stackKey && bp.isSuccess && !busy && (!stack || stack.count < 1)) dropHand();
  }, [stackKey, bp.isSuccess, busy, stack]);

  // Кнопки руки и кисть: отметки этих клеток снимаются сразу, итог — тостом (как в окне).
  const run = useRef<(targets: Hex[]) => void>(() => {});
  run.current = (targets) => {
    if (busy) return;
    unmark(targets);
    setSpot(null);
    clearPath();
    use.batch.start(targets);
  };
  useEffect(() => {
    setHandRunner((targets) => run.current(targets));
    return () => setHandRunner(null);
  }, []);

  const last = useRef<{ q: number; r: number; at: number } | null>(null);

  /** Тап карты: true — тап взяла рука, false — обычный тап (ход, бой, постройка). */
  const tap = (q: number, r: number): boolean => {
    const h = getHand();
    if (!h) return false;
    if (tapMuted()) return true;
    const now = Date.now();
    const prev = last.current;
    const double = !!prev && prev.q === q && prev.r === r && now - prev.at < DOUBLE_TAP_MS;
    last.current = double ? null : { q, r, at: now };
    const ships = qc.getQueryData(SHIPS_KEY) as ShipsData;
    const shipHere = ships?.ships.find((s) => s.q === q && s.r === r);
    // Синий по кораблю — по живым причалам: корабль мог приплыть или уплыть после круга.
    const c = withLiveShip(h, handAt(q, r), shipHere);
    const terrains = ((qc.getQueryData(["beta-raid-map"]) as MapLike)?.terrains ?? {}) as Record<
      string,
      TerrainInfo
    >;
    const water = isWaterCell(cells[`${q},${r}`], terrains);
    if (blueShipTooFar(h, c, shipHere)) {
      toast(t("dynamite.far"));
      return true;
    }
    if (redOnForeignShip(h, c, shipHere)) {
      toast(t("dynamite.ship_blue_only"));
      return true;
    }
    const plan = handTapPlan(h, c, { double, quick: getQuick(), water });
    if (plan.do === "pass" || plan.do === "offer") {
      setSpot(plan.do === "offer" ? { q, r } : null);
      return false;
    }
    if (busy) return true;
    if (plan.do === "mark") {
      setSpot(null);
      toggleMark({ q, r });
      return true;
    }
    const rest = plan.do === "now" ? h.marks.filter((m) => m.q !== q || m.r !== r) : [];
    run.current([...rest, { q, r }]);
    return true;
  };
  return { tap };
}
