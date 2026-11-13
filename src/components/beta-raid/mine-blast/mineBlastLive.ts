// Живое событие «mine_blast» (сервер динамита, server/raidLive.ts): взрыв
// задел шахты — на каждой клетке проигрываем анимацию взрыва своего вида
// (drawMineBlasts). Только по этому событию: ни поломка, ни разборка, ни
// дельта карты взрыв не показывают. Снос постройки приходит дельтой «map».
//
// Вид шахты — из события (ресурс шахты: wood/stone/gold/diamonds или имя файла
// набора); вид без анимации в наборе — пропускаем.
import { mineArtKindOf, type MineArtKind } from "@/lib/mineArt";
import { addMineBlasts } from "./mineBlastStore";

export const MINE_BLAST_EVENT = "mine_blast";

type Wire = { type?: string; mapId?: string | null; cells?: unknown };

/** Клетки события → взрывы; кривые записи пропускаем. */
export function blastCells(cells: unknown): Array<{ q: number; r: number; kind: MineArtKind }> {
  if (!Array.isArray(cells)) return [];
  const out: Array<{ q: number; r: number; kind: MineArtKind }> = [];
  for (const c of cells as unknown[]) {
    if (!c || typeof c !== "object") continue;
    const { q, r, kind } = c as { q?: unknown; r?: unknown; kind?: unknown };
    const k = mineArtKindOf(kind);
    if (!k || !Number.isInteger(q) || !Number.isInteger(r)) continue;
    out.push({ q: q as number, r: r as number, kind: k });
  }
  return out;
}

/** Событие потока: «mine_blast» — забрать и вернуть true; прочее — false. */
export function handleMineBlast(event: Wire): boolean {
  if (event.type !== MINE_BLAST_EVENT) return false;
  addMineBlasts(event.mapId ?? null, blastCells(event.cells));
  return true;
}
