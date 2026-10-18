// Выделение клеток под генератор (кисть «Биом» в режиме бога).
//
// Вынесено из BetaRaidScreen: там жил только тумблер «кистью», а с
// прямоугольником по двум углам логика переросла экран. В БД и модель клетки
// выделение не пишется — временный маркер (жёлтая пунктирная обводка).
//
// Два способа набрать зону:
// - кисть: мазок радиусом size, тумблер добавить/снять — по первой клетке
//   мазка, как купол;
// - прямоугольник: первый тап — угол, второй — противоположный угол; клетки
//   между ними (offset-прямоугольник, см. rectSelect) добавляются к зоне.
//   Угол сразу кладётся в выделение — так он виден на карте, пока ждём второй.
// Границ карты нет: тап в пустоту за краем — обычные координаты, выгрузка
// создаст там клетки. Слишком большой прямоугольник не режем молча — отдаём
// ошибку наверх, панель её покажет.
import { useCallback, useState } from "react";
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { rectCells, rectSize } from "./rectSelect";

export type GenSelectMode = "brush" | "rect";

const key = (c: ZoneCell) => `${c.q},${c.r}`;

export function useGenSelection() {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectMode, setSelectMode] = useState<GenSelectMode>("brush");
  /** Первый угол прямоугольника, пока ждём второй тап. */
  const [corner, setCorner] = useState<ZoneCell | null>(null);
  /** «Прямоугольник слишком большой» — сообщение панели, гаснет следующим тапом. */
  const [tooBig, setTooBig] = useState<number | null>(null);

  /**
   * Тап кистью «Биом»: cells — область мазка, center — сама тапнутая клетка
   * (в прямоугольнике важен только он, радиус кисти не участвует).
   */
  const onGenToggle = useCallback(
    (cells: ZoneCell[], center: ZoneCell) => {
      if (cells.length === 0) return;
      setTooBig(null);
      if (selectMode === "rect") {
        if (!corner) {
          setCorner(center);
          setSelected((prev) => new Set(prev).add(key(center)));
          return;
        }
        const rect = rectCells(corner, center);
        if (!rect) {
          setTooBig(rectSize(corner, center));
          setCorner(null);
          return;
        }
        setCorner(null);
        setSelected((prev) => {
          const next = new Set(prev);
          for (const c of rect) next.add(key(c));
          return next;
        });
        return;
      }
      setSelected((prev) => {
        const first = key(cells[0]);
        const removing = prev.has(first);
        const next = new Set(prev);
        for (const c of cells) {
          if (removing) next.delete(key(c));
          else next.add(key(c));
        }
        return next;
      });
    },
    [selectMode, corner],
  );

  const reset = useCallback(() => {
    setSelected(new Set());
    setCorner(null);
    setTooBig(null);
  }, []);

  const changeMode = useCallback((mode: GenSelectMode) => {
    setSelectMode(mode);
    // Недоставленный угол с другим режимом не имеет смысла.
    setCorner(null);
    setTooBig(null);
  }, []);

  return { selected, selectMode, setSelectMode: changeMode, corner, tooBig, onGenToggle, reset };
}
