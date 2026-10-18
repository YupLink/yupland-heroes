// Точки миникарты: разведанное КОПИТСЯ, а не пересчитывается на каждый шаг.
//
// Раньше миникарта на каждое изменение тумана обходила всё разведанное
// множество (до 16 384 ключей) со split/Number на каждый ключ и отдавала React
// до 3000 <rect> на реконциляцию — а шаг героя открывает от силы десяток новых
// клеток. Здесь набор точек живёт между рендерами: добираем только новые ключи,
// а сама картинка пересобирается не чаще раза в COMMIT_MS.
import { useEffect, useRef, useState } from "react";
import type { KeySet } from "./fogMask";
import { axialToPixel } from "./hexGeometry";

/**
 * Потолок точек на миникарте.
 *
 * Раскрытая карта — 16 384 клетки: угол 92×92 px отводит клетке меньше пикселя,
 * и на глаз разницы нет. Потолок высокий нарочно: обычная разведка в него
 * укладывается целиком, шаг решётки остаётся единицей, и у игрока миникарта
 * прежняя до пикселя. Режется только раскрытая админом карта.
 */
const MAX_DOTS = 3000;

/** Как часто картинка пересобирается: шаг героя её больше не гонит. */
const COMMIT_MS = 400;

export type DotBox = { minX: number; maxX: number; minY: number; maxY: number };

export type DotAcc = {
  /** Шаг прореживающей решётки: 1 — рисуем всё. */
  step: number;
  centerQ: number;
  c0q: number;
  /** Ключи, уже разобранные в точки: по ним видно, что в наборе нового. */
  known: Set<string>;
  xs: number[];
  ys: number[];
  /**
   * Рамка по ВСЕМ разведанным клеткам, а не только по нарисованным: решётка
   * теряет края, и герой у фронтира выпадал бы за угол миникарты.
   */
  bounds: DotBox;
};

const emptyAcc = (): DotAcc => ({
  step: 1,
  centerQ: NaN,
  c0q: NaN,
  known: new Set(),
  xs: [],
  ys: [],
  bounds: { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
});

function reset(acc: DotAcc, step: number, centerQ: number, c0q: number) {
  acc.step = step;
  acc.centerQ = centerQ;
  acc.c0q = c0q;
  acc.known = new Set();
  acc.xs = [];
  acc.ys = [];
  acc.bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
}

/** Добрать в набор ключи, которых в нём ещё нет. Возвращает, сколько добрали. */
function addNew(acc: DotAcc, seen: KeySet): number {
  let added = 0;
  const { step, centerQ, c0q, bounds } = acc;
  for (const key of seen) {
    if (acc.known.has(key)) continue;
    acc.known.add(key);
    added++;
    const comma = key.indexOf(",");
    const q = Number(key.slice(0, comma));
    const r = Number(key.slice(comma + 1));
    if (!Number.isFinite(q) || !Number.isFinite(r)) continue;
    const p = axialToPixel(q, r, centerQ, c0q);
    if (p.x < bounds.minX) bounds.minX = p.x;
    if (p.x > bounds.maxX) bounds.maxX = p.x;
    if (p.y < bounds.minY) bounds.minY = p.y;
    if (p.y > bounds.maxY) bounds.maxY = p.y;
    // Остаток берём с поправкой на знак: координаты бывают отрицательными, а
    // `-1 % 3` в JS даёт -1, и половина решётки просыпалась бы мимо.
    if (step > 1 && (((q % step) + step) % step || ((r % step) + step) % step)) continue;
    acc.xs.push(p.x);
    acc.ys.push(p.y);
  }
  return added;
}

/** Влить свежее разведанное в набор. Возвращает true, если картинка изменилась. */
export function absorb(acc: DotAcc, seen: KeySet, centerQ: number, c0q: number): boolean {
  const step = Math.max(1, Math.ceil(Math.sqrt(seen.size / MAX_DOTS)));
  // Решётка сменила шаг, сдвинулась точка отсчёта или клетки ПРОПАЛИ (сменилась
  // карта) — накопленному верить нельзя.
  const stale =
    step !== acc.step || centerQ !== acc.centerQ || c0q !== acc.c0q || acc.known.size > seen.size;
  if (stale) reset(acc, step, centerQ, c0q);
  const added = addNew(acc, seen);
  // Размер тот же, а состав другой: клетку накрыло куполом, рядом открылась
  // новая. Тогда known разошёлся с seen — пересобираем целиком.
  if (acc.known.size !== seen.size) {
    reset(acc, step, centerQ, c0q);
    addNew(acc, seen);
    return true;
  }
  return stale || added > 0;
}

/**
 * Набор точек и номер его сборки. Сам набор — один объект на всю жизнь
 * компонента: пересчёты вешаются на version, а не на ссылку.
 */
export function useMinimapDots(
  seen: KeySet,
  centerQ: number,
  c0q: number,
): { dots: DotAcc; version: number } {
  // Первую сборку делаем прямо на первом рендере: отложи её в эффект — и кадр
  // появления карты успел бы мигнуть пустым углом.
  const ref = useRef<DotAcc | null>(null);
  if (ref.current === null) {
    ref.current = emptyAcc();
    absorb(ref.current, seen, centerQ, c0q);
  }
  const acc = ref.current;
  const [version, setVersion] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committedAt = useRef(0);
  // Свежайшее разведанное — отложенная сборка берёт его, а не то, что было в
  // момент постановки таймера.
  const latest = useRef({ seen, centerQ, c0q });
  latest.current = { seen, centerQ, c0q };

  useEffect(() => {
    const commit = () => {
      committedAt.current = Date.now();
      const now = latest.current;
      if (absorb(acc, now.seen, now.centerQ, now.c0q)) setVersion((v) => v + 1);
    };
    const wait = COMMIT_MS - (Date.now() - committedAt.current);
    if (wait <= 0) {
      commit();
      return;
    }
    if (timer.current) return; // сборка уже назначена — заберёт и это изменение
    timer.current = setTimeout(() => {
      timer.current = null;
      commit();
    }, wait);
    // acc — один и тот же объект на всю жизнь хука, в зависимостях он ради
    // линтера: пересборку гонят seen/centerQ/c0q.
  }, [acc, seen, centerQ, c0q]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { dots: acc, version };
}

/**
 * Рамка миникарты: разведанное плюс замок.
 *
 * Герой в неё НЕ входит, пока стоит внутри: иначе рамка дышала бы на каждый его
 * шаг и вся картинка пересобиралась заново. Вышел за край (набор точек догоняет
 * с задержкой) — впускаем, чтобы фигурка не улетела за угол.
 */
export function dotsBox(
  acc: DotAcc,
  castle: { x: number; y: number },
  hero: { x: number; y: number } | null,
  pad: number,
): DotBox {
  const b = acc.bounds;
  let minX = Math.min(b.minX, castle.x);
  let maxX = Math.max(b.maxX, castle.x);
  let minY = Math.min(b.minY, castle.y);
  let maxY = Math.max(b.maxY, castle.y);
  if (hero) {
    minX = Math.min(minX, hero.x);
    maxX = Math.max(maxX, hero.x);
    minY = Math.min(minY, hero.y);
    maxY = Math.max(maxY, hero.y);
  }
  return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
}

/**
 * Разведанное одним <path> вместо тысяч <rect>: рисунок тот же (те же квадраты
 * той же заливкой), а в DOM — один узел, который React не реконцилит поштучно.
 */
export function dotsPath(acc: DotAcc, box: DotBox, size: number, dot: number): string {
  const w = Math.max(1, box.maxX - box.minX);
  const h = Math.max(1, box.maxY - box.minY);
  const d = dot.toFixed(2);
  const out: string[] = [];
  for (let i = 0; i < acc.xs.length; i++) {
    const x = (((acc.xs[i] - box.minX) / w) * size).toFixed(2);
    const y = (((acc.ys[i] - box.minY) / h) * size).toFixed(2);
    out.push(`M${x} ${y}h${d}v${d}h-${d}z`);
  }
  return out.join("");
}
