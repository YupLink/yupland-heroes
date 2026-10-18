// Состояние клеток интерьера: кисть по слоям, ластик слоя, объединение клеток.
//
// Объединённые клетки (общий groupId) — ОДНА большая клетка: постройка/объект/
// декор/дорога пишутся во все её клетки разом и рисуются один раз на весь
// блок. Местность остаётся у каждой клетки своя (подложка).
import { useCallback, useState } from "react";
import { nanoid } from "nanoid";
import { isConnected } from "./hexGeom";
import { MERGE_MAX_CELLS, clampIconScale, stepIconScale } from "@/lib/mergeScale";
import {
  EMPTY_CELL,
  LAYER_FIELD,
  cellHasContent,
  type Brush,
  type CastleCell,
  type CellMap,
} from "./types";

/** Спека 21.09: блок до 10 клеток (было 4). */
export const MAX_MERGE = MERGE_MAX_CELLS;

export function useCastleCells(initial: CellMap) {
  const [cells, setCells] = useState<CellMap>(initial);
  /** Выделение для объединения (режим «Объединить»). */
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  /** Блок, выбранный тапом в режиме объединения — для масштаба и «Разъединить». */
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const membersOf = useCallback((map: CellMap, key: string): string[] => {
    const gid = map[key]?.groupId;
    if (!gid) return [key];
    return Object.keys(map).filter((k) => map[k]?.groupId === gid);
  }, []);

  /** Мазок кистью: ассет слоя (или ластик слоя при assetId=null). */
  const paint = useCallback(
    (key: string, brush: Brush) => {
      setCells((prev) => {
        const next: CellMap = { ...prev };
        const field = LAYER_FIELD[brush.kind];
        // Местность — своя у каждой клетки; остальные слои — на весь блок.
        const targets = brush.kind === "terrain" ? [key] : membersOf(prev, key);
        for (const k of targets) {
          const cell: CastleCell = { ...(prev[k] ?? EMPTY_CELL), [field]: brush.assetId };
          if (cellHasContent(cell)) next[k] = cell;
          else delete next[k];
        }
        return next;
      });
    },
    [membersOf],
  );

  /** Тумблер клетки в выделении (режим объединения). */
  const toggleSelect = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setActiveGroup(null);
  }, []);

  /** Объединить выделенные (2–10 соседних) в одну клетку. Слои поверх подложки
   *  берём по каждому слою с первой клетки, где он есть, и раскатываем на весь
   *  блок — иначе блок рисовал бы разное или терял здание/декор.
   *  Возвращает null при успехе, иначе — текст причины отказа. */
  const mergeSelected = useCallback((): string | null => {
    const keys = [...selected];
    if (keys.length < 2) return "Выдели хотя бы две клетки";
    if (keys.length > MAX_MERGE) return `Не больше ${MAX_MERGE} клеток в одном блоке`;
    if (!isConnected(keys)) return "Клетки должны быть соседями";
    const gid = `g_${nanoid(8)}`;
    setCells((prev) => {
      const next: CellMap = { ...prev };
      // Каждый слой — с первой клетки, где он стоит: объединяя дом с деревом
      // рядом, теряли дерево (раньше все слои копировались с одной «ведущей»).
      const firstOf = (field: "buildingId" | "objectId" | "decorationId" | "roadId") =>
        keys.map((k) => prev[k]?.[field] ?? null).find((v) => v) ?? null;
      const layers = {
        buildingId: firstOf("buildingId"),
        objectId: firstOf("objectId"),
        decorationId: firstOf("decorationId"),
        roadId: firstOf("roadId"),
      };
      const scale = keys.map((k) => prev[k]?.iconScale).find((v) => v != null) ?? null;
      for (const k of keys) {
        next[k] = { ...(prev[k] ?? EMPTY_CELL), ...layers, groupId: gid, iconScale: scale };
      }
      return next;
    });
    setSelected(new Set());
    setActiveGroup(gid);
    return null;
  }, [selected]);

  /** Масштаб картинки блока: шаг «−»/«+» на все клетки блока разом. */
  const stepGroupScale = useCallback((gid: string, dir: 1 | -1) => {
    setCells((prev) => {
      const next: CellMap = { ...prev };
      const keys = Object.keys(prev).filter((k) => prev[k]?.groupId === gid);
      if (keys.length === 0) return prev;
      const value = stepIconScale(prev[keys[0]].iconScale, dir);
      if (value === clampIconScale(prev[keys[0]].iconScale)) return prev;
      for (const k of keys) next[k] = { ...prev[k], iconScale: value };
      return next;
    });
  }, []);

  /** Разъединить блок, в который входит клетка. */
  const unmerge = useCallback(
    (key: string) => {
      setCells((prev) => {
        const next: CellMap = { ...prev };
        for (const k of membersOf(prev, key)) {
          const cell: CastleCell = { ...(prev[k] ?? EMPTY_CELL), groupId: null, iconScale: null };
          if (cellHasContent(cell)) next[k] = cell;
          else delete next[k];
        }
        return next;
      });
      setSelected(new Set());
      setActiveGroup(null);
    },
    [membersOf],
  );

  return {
    cells,
    setCells,
    selected,
    activeGroup,
    setActiveGroup,
    paint,
    toggleSelect,
    clearSelection,
    mergeSelected,
    stepGroupScale,
    unmerge,
    membersOf: (key: string) => membersOf(cells, key),
  };
}
