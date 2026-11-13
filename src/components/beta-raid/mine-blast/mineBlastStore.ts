// Взрывы шахт от динамита — мимо React, как полосы шахт (mineLifeStore):
// живое событие «mine_blast» кладёт сюда клетки (mineBlastLive), кадр карты
// рисует их отсюда (drawMineBlasts) и будит себя к смене кадра анимации
// (wakeMineBlasts → подписка useMapRenderer). Своего rAF нет.
//
// Ход взрыва: пришёл — ждёт, пока клетка окажется на экране и лист кадров
// докачается (не дольше BLAST_WAIT_MS — иначе момент прошёл, не играем);
// первый нарисованный кадр — начало; после последнего кадра взрыв уходит.
// Снос постройки делает дельта карты — анимация от неё не зависит.
import type { MineArtKind } from "@/lib/mineArt";

export type MineBlast = {
  mapId: string | null;
  q: number;
  r: number;
  kind: MineArtKind;
  /** Когда пришло событие (performance.now). */
  at: number;
  /** Первый нарисованный кадр (performance.now); 0 — ещё не начат. */
  start: number;
};

/** Сколько взрыв ждёт экрана и листа кадров, мс. */
export const BLAST_WAIT_MS = 4000;
/** Потолок одновременных взрывов: лишние не копим. */
const MAX_BLASTS = 48;

let blasts: MineBlast[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let timerAt = Infinity;
const listeners = new Set<() => void>();

const emit = () => {
  for (const fn of listeners) fn();
};

export const getMineBlasts = (): readonly MineBlast[] => blasts;

export function subscribeMineBlasts(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Новые взрывы; та же клетка, что ещё играет, второй раз не ставится. */
export function addMineBlasts(
  mapId: string | null,
  cells: ReadonlyArray<{ q: number; r: number; kind: MineArtKind }>,
  now = performance.now(),
): number {
  let added = 0;
  for (const c of cells) {
    if (blasts.length >= MAX_BLASTS) break;
    if (blasts.some((b) => b.mapId === mapId && b.q === c.q && b.r === c.r)) continue;
    blasts.push({ mapId, q: c.q, r: c.r, kind: c.kind, at: now, start: 0 });
    added++;
  }
  if (added) emit();
  return added;
}

/** Убрать отыгравшие и просроченные (решает кадр). */
export function dropMineBlasts(gone: ReadonlySet<MineBlast>): void {
  if (gone.size === 0) return;
  blasts = blasts.filter((b) => !gone.has(b));
}

/** Разбудить кадр через ms (смена кадра анимации). Ранний будильник важнее позднего. */
export function wakeMineBlasts(ms: number): void {
  const due = performance.now() + Math.max(0, ms);
  if (timer && timerAt <= due) return;
  if (timer) clearTimeout(timer);
  timerAt = due;
  timer = setTimeout(
    () => {
      timer = null;
      timerAt = Infinity;
      emit();
    },
    Math.max(0, ms),
  );
}

/** Для тестов и смены экрана: всё забыть. */
export function resetMineBlasts(): void {
  blasts = [];
  if (timer) clearTimeout(timer);
  timer = null;
  timerAt = Infinity;
}
