// Мешочки на экране рейда (ПРАВИЛА §8.21): слой для карты, тап по клетке,
// «дойти и открыть» и окно. Вынесено отдельным хуком: BetaRaidScreen за
// лимитом строк — туда по строке на вызов.
//
// Слой — «второй обзор» героя (круг 20 на разведанном), фильтрует сервер
// (getLootBagsNear). Его перечитывают свои шаги (одним чтением, когда герой
// постоял STEP_MS, но не реже раза в MAX_WAIT_MS в пути) и событие 'bags'
// рядом (useRaidLiveStream → lootBagLive). До нового ответа мешочек, ушедший
// за круг, гаснет сразу — по позиции героя; сгоревший — по своему сроку, без
// опроса: таймер на ближайший срок.
//
// Тап: живой объект на клетке (или на ведущей клетке блока) и корабль важнее
// мешочка; мешочек важнее сундука, города и постройки — он временный, а
// постройка под ним открывается кнопкой из его окна. Декор, выросший поверх
// мешочка или бугорка (дополнение №5), перекрывает его: не рисуем, тап — декору.
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { hexDistance } from "@/lib/raid/hex";
import { LOOT_BAG_SEE, bagMarksOf, notUnderDecor, type LootBagMarks } from "@/lib/lootBag";
import type { GroundMarks } from "@/lib/digHole";
import { getLootBagsNear } from "@/server/api/beta-raid/loot-bag/bag-read";
import { DIRS } from "@/components/beta-raid/usePathfinding";
import type { Cell } from "@/components/beta-raid/unpackMap";
import type { PendingAction } from "@/components/beta-raid/useBetaMovement";
import type { ShipMark } from "@/components/beta-raid/useShips";
import type { useMagicChests } from "@/components/beta-raid/chest/useMagicChests";
import { LootBagWindow } from "@/components/beta-raid/loot-bag/LootBagWindow";
import { BAGS_NEAR_KEY } from "@/components/beta-raid/loot-bag/lootBagLive";
import { useShovel } from "@/components/beta-raid/tool/useShovel";

/** Герой постоял столько — слой перечитывается; в пути — не реже MAX_WAIT_MS. */
const STEP_MS = 600;
const MAX_WAIT_MS = 4000;

type At = { q: number; r: number };

/** Шаги героя → одно чтение слоя: после паузы, а в долгом пути — раз в MAX_WAIT_MS. */
function useStepRefetch(pos: At | null, refetch: () => void): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(0);
  // Первая позиция — не шаг: слой и так читается при появлении героя.
  const mounted = useRef(false);
  const [pq, pr] = [pos?.q, pos?.r];
  useEffect(() => {
    if (pq == null || pr == null) return;
    if (!mounted.current) return void (mounted.current = true);
    const now = Date.now();
    if (!timer.current) first.current = now;
    else clearTimeout(timer.current);
    const wait = Math.max(0, Math.min(STEP_MS, first.current + MAX_WAIT_MS - now));
    timer.current = setTimeout(() => {
      timer.current = null;
      refetch();
    }, wait);
  }, [pq, pr, refetch]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
}

export function useLootBags(o: {
  playerPos: At | null;
  cells: Record<string, Cell>;
  ships: Map<string, ShipMark>;
  chest: ReturnType<typeof useMagicChests>;
  approachCell: (q: number, r: number, action?: PendingAction | null) => void;
  walkTo: (q: number, r: number) => unknown;
  setBuilding: (cell: At) => void;
}) {
  const qc = useQueryClient();
  const t = useT();
  const pos = o.playerPos;
  const q = useQuery({
    queryKey: BAGS_NEAR_KEY,
    queryFn: () => getLootBagsNear(),
    staleTime: 60_000,
    enabled: !!pos,
  });
  useStepRefetch(
    pos,
    useCallback(() => void qc.invalidateQueries({ queryKey: BAGS_NEAR_KEY }), [qc]),
  );

  // Срок: перерисовка ровно к ближайшему сгоранию, а не тиканьем часов.
  const gotAt = q.dataUpdatedAt;
  const list = useMemo(() => (Array.isArray(q.data?.bags) ? q.data.bags : []), [q.data]);
  // Ямки от лопаты (02.10): ответ прошлой версии без поля — ямок нет.
  const holeList = useMemo(() => (Array.isArray(q.data?.holes) ? q.data.holes : []), [q.data]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const ends = [...list, ...holeList].map((b) => gotAt + b.leftMs);
    const next = Math.min(...ends.filter((e) => e > Date.now()));
    if (!Number.isFinite(next)) return;
    const id = setTimeout(() => setNow(Date.now()), Math.min(next - Date.now() + 50, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [list, holeList, gotAt, now]);
  const [hq, hr] = [pos?.q, pos?.r];
  const cells = o.cells;
  const marks: LootBagMarks = useMemo(
    () =>
      bagMarksOf(
        notUnderDecor(
          list.filter(
            (b) =>
              gotAt + b.leftMs > now &&
              hq != null &&
              hr != null &&
              // Мои бугорки — с любого расстояния (02.10, как свои шахты).
              (b.mine === true || hexDistance(hq, hr, b.q, b.r) <= LOOT_BAG_SEE),
          ),
          (q, r) => !!cells[`${q},${r}`]?.decorationId,
        ),
      ),
    [list, gotAt, now, hq, hr, cells],
  );
  // Земля для кадра: ямки (на клетке ничего не стоит и не выросло) и мои
  // бугорки — вокруг них первый обзор на клетку, как у своих шахт.
  const ground: GroundMarks = useMemo(() => {
    const holes = new Set<string>();
    for (const h of holeList) {
      const key = `${h.q},${h.r}`;
      const c = cells[key];
      if (gotAt + h.leftMs <= now || marks[key] || c?.decorationId || c?.buildingId) continue;
      if (hq == null || hr == null || hexDistance(hq, hr, h.q, h.r) > LOOT_BAG_SEE) continue;
      holes.add(key);
    }
    const mounds = list
      .filter((b) => b.mine === true && b.buried && gotAt + b.leftMs > now)
      .map((b) => `${b.q},${b.r}`);
    return { holes, mounds };
  }, [holeList, list, marks, cells, gotAt, now, hq, hr]);
  const marksRef = useRef(marks);
  marksRef.current = marks;
  // Лопата в руках (§8.24): тап сначала ей — «Копать» / «Закопать» / «Выкопать».
  const shovelTap = useShovel({
    pos,
    cells,
    bags: marks,
    chests: o.chest.chests,
    ships: o.ships,
    approachCell: o.approachCell,
  });

  const [open, setOpen] = useState<At | null>(null);
  const close = useCallback(() => setOpen(null), []);
  /** Клетка, к которой идём открыть мешочек: прибытие откроет его окно. */
  const headingTo = useRef<string | null>(null);
  const near = (c: At) =>
    !!pos &&
    ((pos.q === c.q && pos.r === c.r) ||
      DIRS.some((d) => pos.q + d.q === c.q && pos.r + d.r === c.r));

  // Отошёл от открытого мешочка — окно закрывается (содержимое только вплотную).
  const far = !!open && !near(open);
  useEffect(() => {
    if (far) setOpen(null);
  }, [far]);

  /** Постройка (или сундук) на клетке — то, что тап открыл бы без мешочка. */
  const openCell = o.chest.openOr(o.setBuilding, (c) => !!o.cells[`${c.q},${c.r}`]?.buildingId);

  /** Тап по клетке (lead — ведущая клетка блока): true — это мешочек, тап обработан. */
  const tap = (tq: number, tr: number, lead?: At | null): boolean => {
    headingTo.current = null;
    if (shovelTap(tq, tr)) return true;
    const key = `${tq},${tr}`;
    if (!marks[key] || !pos || o.ships.has(key)) return false;
    for (const c of [o.cells[key], lead ? o.cells[`${lead.q},${lead.r}`] : undefined]) {
      if (c?.objectId && !c.objectDefeated) return false;
    }
    if (near({ q: tq, r: tr })) setOpen({ q: tq, r: tr });
    else {
      headingTo.current = key;
      o.approachCell(tq, tr, { kind: "build", q: tq, r: tr, extraCost: 0 });
    }
    return true;
  };

  /** Прибытие «дойти и открыть»: шли к мешочку — его окно, иначе прежнее окно клетки. */
  const arrive = (cell: At) => {
    const key = `${cell.q},${cell.r}`;
    if (headingTo.current !== key) return openCell(cell);
    headingTo.current = null;
    if (marksRef.current[key]) setOpen({ q: cell.q, r: cell.r });
    else toast(t("braid.target_gone"));
  };

  const underKey = open ? `${open.q},${open.r}` : "";
  const under = !!open && (!!o.cells[underKey]?.buildingId || !!o.chest.chests?.[underKey]);
  const here = !!open && pos?.q === open.q && pos?.r === open.r;
  const sheet = open
    ? createElement(LootBagWindow, {
        key: underKey,
        at: open,
        onClose: close,
        onGoTo: here
          ? undefined
          : () => {
              close();
              void o.walkTo(open.q, open.r);
            },
        onBuilding: under
          ? () => {
              close();
              openCell(open);
            }
          : undefined,
      })
    : null;

  return { marks, ground, tap, arrive, sheet };
}
