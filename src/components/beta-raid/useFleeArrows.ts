// Красная стрелка «куда убежал беглец» — вспышка на 0.8с в момент побега.
//
// Не постоянный оверлей: мелькнула по клеткам пути и погасла. Показываем и
// свой спуг, и чужой — оба идут через emitFlee (fleeFlash). Вынесено из
// BetaRaidCanvas (файл за лимитом), рисует drawObject.drawRunnerArrow.
//
// Побег на две клетки рисуется ДВУМЯ стрелками — from→via и via→to, — а не
// одной прямой from→to. Прямая между клетками на дистанции два идёт по ребру
// между двумя общими соседями, и когда один из них скала или вода (по проду —
// 22 % таких побегов), гриб с виду «перепрыгивал камень». По клеткам пути
// видно, что он их обошёл.
import { useEffect, useState } from "react";
import { parseCellKey } from "./applyFled";
import { subscribeFlee } from "./fleeFlash";

/** Клетка «откуда» → клетка «куда»: по стрелке на каждый отрезок пути. */
export type FleeArrows = Record<string, { toQ: number; toR: number }>;

const FLASH_MS = 800;

export function useFleeArrows(requestRedraw: () => void): FleeArrows {
  const [arrows, setArrows] = useState<FleeArrows>({});
  useEffect(
    () =>
      subscribeFlee((moves) => {
        const add: FleeArrows = {};
        for (const m of moves) {
          const from = parseCellKey(m.from);
          const to = parseCellKey(m.to);
          const via = parseCellKey(m.via);
          if (!from || !to) continue;
          // Ключ — клетка, ОТКУДА ведёт отрезок; значение — КУДА.
          if (via) {
            add[`${from.q},${from.r}`] = { toQ: via.q, toR: via.r };
            add[`${via.q},${via.r}`] = { toQ: to.q, toR: to.r };
          } else add[`${from.q},${from.r}`] = { toQ: to.q, toR: to.r };
        }
        const keys = Object.keys(add);
        if (keys.length === 0) return;
        setArrows((prev) => ({ ...prev, ...add }));
        setTimeout(() => {
          setArrows((prev) => {
            let changed = false;
            const next = { ...prev };
            // Убираем ровно свои записи; более свежий побег в ту же клетку
            // (другой объект-ссылка) не гасим раньше времени.
            for (const k of keys)
              if (next[k] === add[k]) {
                delete next[k];
                changed = true;
              }
            return changed ? next : prev;
          });
        }, FLASH_MS);
      }),
    [],
  );
  // Появление/исчезновение вспышки — вне цикла кадров, будим отрисовку сами.
  useEffect(() => {
    requestRedraw();
  }, [arrows, requestRedraw]);
  return arrows;
}
