// Помещается ли полоса ресурсов в одну строку.
//
// Энергия и лайки стоят в линию с остальными, пока хватает места; когда цифры
// разрастаются (10к дерева, 1.24М лайков), они складываются обратно в стопку —
// иначе ряд расползается и последние ресурсы уезжают за край.
//
// Считаем по длине уже отформатированных чисел, а не по факту переполнения:
// измерять «влезло ли» после отрисовки значит переключаться туда-обратно —
// свёрнутая полоса всегда влезает, и её тут же разворачивало бы назад.
import { useEffect, useRef, useState } from "react";

/** Ширины на глаз, под текущий стиль: иконка 16px и цифры в 11px моноширинно. */
const ICON = 16;
const CHAR = 6.6;
const GAP = 8;
const DIVIDER = 9;

/** Сколько места просит ряд из этих подписей, если выложить его в линию. */
export function lineWidth(labels: string[]): number {
  return labels.reduce((sum, l) => sum + ICON + 2 + l.length * CHAR + GAP, DIVIDER);
}

/**
 * Следить за шириной полосы. Возвращает саму ширину и ref на контейнер —
 * решение «в линию или стопкой» принимает вызывающий, сравнив её с lineWidth.
 */
export function useBarWidth(): {
  ref: React.RefObject<HTMLDivElement | null>;
  width: number;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}
