// Миникарта в углу карты рейда: разведанное — точками, герой — золотом,
// замок — меткой. Тап переносит камеру в выбранную точку.
//
// Координаты гоняем через ту же axialToPixel, что и большая карта: рисовать
// q/r «как есть» нельзя — гекс-сетка скошена, и тап уводил бы не туда.
//
// Разведанное копится в minimapDots и рисуется одним <path>: шаг героя больше
// не заставляет обходить всё множество ключей и реконцилить тысячи узлов.
import type { KeySet } from "./fogMask";
import { memo, useMemo, useState } from "react";
import { useLang } from "@/lib/i18n";
import { R, SQRT3, axialToPixel, hexRound } from "./hexGeometry";
import { dotsBox, dotsPath, useMinimapDots } from "./minimapDots";

const SIZE = 92;

function Minimap({
  seen,
  playerQ,
  playerR,
  castle,
  castleShown,
  centerQ,
  c0q,
  players,
  onPick,
  interactive = true,
}: {
  /** Ключи "q,r" уже разведанных клеток. */
  seen: KeySet;
  /** Координаты героя числами: объект ломал бы memo на каждом рефетче. */
  playerQ: number | null;
  playerR: number | null;
  castle: { q: number; r: number };
  castleShown: boolean;
  /** Точка отсчёта гекс-сетки — та же, что у большой карты. */
  centerQ: number;
  c0q: number;
  /** Клетки с игроками — на миникарте это красные точки. */
  players: Map<string, number>;
  onPick: (q: number, r: number) => void;
  interactive?: boolean;
}) {
  const ru = useLang() === "ru";
  const [cursor, setCursor] = useState<{q:number;r:number} | null>(null);
  const { dots, version } = useMinimapDots(seen, centerQ, c0q);

  // Чужие игроки: та же гекс-геометрия, что у клеток. Их немного — считаем как
  // считали, без накопителя.
  const crowd = useMemo(() => {
    const out: Array<{ k: string; x: number; y: number }> = [];
    for (const k of players.keys()) {
      const [q, r] = k.split(",").map(Number);
      if (!Number.isFinite(q) || !Number.isFinite(r)) continue;
      const p = axialToPixel(q, r, centerQ, c0q);
      out.push({ k, x: p.x, y: p.y });
    }
    return out;
  }, [players, centerQ, c0q]);

  const cp = useMemo(
    () => axialToPixel(castle.q, castle.r, centerQ, c0q),
    [castle.q, castle.r, centerQ, c0q],
  );
  const hp = useMemo(
    () =>
      playerQ != null && playerR != null ? axialToPixel(playerQ, playerR, centerQ, c0q) : null,
    [playerQ, playerR, centerQ, c0q],
  );

  // Рамка по всему, что показываем, плюс гекс запаса. Считается за O(1) —
  // границы разведанного ведёт сам накопитель.
  const box = dotsBox(dots, cp, hp, R * 1.5);
  const w = Math.max(1, box.maxX - box.minX);
  const h = Math.max(1, box.maxY - box.minY);
  const sx = (x: number) => ((x - box.minX) / w) * SIZE;
  const sy = (y: number) => ((y - box.minY) / h) * SIZE;
  // Точка растёт вместе с шагом решётки: одна нарисованная клетка закрывает
  // step×step пропущенных, иначе прореженное поле выглядело бы дырявым.
  const dot = Math.max(1.5, (SIZE / Math.max(w, h)) * R * 1.2 * dots.step);

  // Пересобираем рисунок только когда набор точек или рамка правда изменились:
  // сам шаг героя внутри разведанного не двигает ни то, ни другое.
  const boxKey = `${box.minX}|${box.minY}|${box.maxX}|${box.maxY}`;
  const seenPath = useMemo(
    () => dotsPath(dots, box, SIZE, dot),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dots, version, boxKey, dot],
  );

  /** Обратный ход: экран миникарты → пиксели карты → гекс. */
  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = box.minX + ((e.clientX - rect.left) / rect.width) * w;
    const py = box.minY + ((e.clientY - rect.top) / rect.height) * h;
    // Округляем как большая карта — кубическим hexRound, иначе у границ
    // клеток промах на гекс.
    const rf = py / (1.5 * R) + c0q;
    const qf = px / (SQRT3 * R) - (rf - c0q) / 2 + centerQ;
    const { q, r } = hexRound(qf, rf);
    onPick(q, r);
  };

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={ru ? "Исследованная карта. Стрелки выбирают точку, Enter показывает её." : "Explored map. Arrow keys select a point; Enter shows it."}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? e => {
        const point = cursor ?? {q: playerQ ?? castle.q, r: playerR ?? castle.r};
        const delta: Record<string, [number,number]> = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
        if (delta[e.key]) {e.preventDefault(); const [q,r]=delta[e.key]; setCursor({q:point.q+q,r:point.r+r});}
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(point.q,point.r); }
      } : undefined}
      onClick={interactive ? pick : undefined}
      className="h-[92px] w-[92px] cursor-pointer rounded-lg border border-border bg-black/70"
    >
      <path d={seenPath} fill="#3b4256" />
      {castleShown && (
        <rect x={sx(cp.x) - 2} y={sy(cp.y) - 2} width={4.5} height={4.5} fill="#4fd6e0" />
      )}
      {crowd.map((c) => (
        <circle key={c.k} cx={sx(c.x)} cy={sy(c.y)} r={2.2} fill="#ff5470" />
      ))}
      {cursor && (() => { const p = axialToPixel(cursor.q,cursor.r,centerQ,c0q); return <circle cx={sx(p.x)} cy={sy(p.y)} r={3.5} fill="none" stroke="white" strokeWidth={1} />; })()}
      {hp && <circle cx={sx(hp.x)} cy={sy(hp.y)} r={3} fill="#f5b301" />}
    </svg>
  );
}

// Камера двигается покадрово — без memo миникарта перерисовывала бы все
// разведанные клетки на каждый кадр.
export const BetaRaidMinimap = memo(Minimap);

