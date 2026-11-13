// Разметка поля — в цвет, который виден на этой земле (владелец 09.11.2026: «на
// светлом песке хорошо видно, куда идти и где что стоит… а на чёрном фоне — почти
// незаметно»). Тон земли — средняя яркость текстуры. Замер всех земель карты
// 09.11: тёмные (адские, мёртвые, чёрная, болота, горы, замок) — 0,19–0,43,
// светлые (трава, пустыня, снег, мерзлота) — 0,51–0,82; порог между ними.
// На светлой земле клетки хода — тенью, на тёмной — светлой заливкой. Без свечения.
export type Tone = "light" | "dark";

const LIGHT_FROM = 0.47;
const memo = new WeakMap<HTMLImageElement, Tone>();

/** Тон испечённой текстуры; нет текстуры — нейтральная земля (она тёмная). */
export function toneOf(tex: HTMLImageElement | null): Tone {
  if (!tex) return "dark";
  const hit = memo.get(tex);
  if (hit) return hit;
  let tone: Tone = "light";
  try {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 16;
    const g = cv.getContext("2d", { willReadFrequently: true });
    if (g) {
      g.drawImage(tex, 0, 0, 16, 16);
      const d = g.getImageData(0, 0, 16, 16).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4)
        sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      tone = sum / ((d.length / 4) * 255) < LIGHT_FROM ? "dark" : "light";
    }
  } catch {
    // Картинка с чужого адреса — яркость не прочитать: светлая схема (рамки с обводкой).
  }
  memo.set(tex, tone);
  return tone;
}

export type Ink = {
  /** Вокруг поля. */
  outside: string;
  /** Лёгкая заливка поля (на тёмной земле — светлее, чтобы поле читалось). */
  field: string | null;
  /** Рамка клетки: обводка (её нет на тёмной земле) и сама линия. */
  gridUnder: string | null;
  grid: string;
  cellFill: string | null;
  /** Куда дойти и зона расстановки. */
  reachFill: string;
  reachEdge: string;
  /** Клетка, куда пойдёт боец под курсором; цель удара. */
  moveFill: string;
  targetFill: string;
};

export const INK: Record<Tone, Ink> = {
  light: {
    outside: "rgba(0, 0, 0, 0.22)",
    field: null,
    gridUnder: "rgba(0, 0, 0, 0.32)",
    grid: "rgba(255, 249, 220, 0.62)",
    cellFill: "rgba(0, 0, 0, 0.07)",
    reachFill: "rgba(0, 0, 0, 0.3)",
    reachEdge: "rgba(255, 246, 214, 0.8)",
    moveFill: "rgba(0, 0, 0, 0.32)",
    targetFill: "rgba(0, 0, 0, 0.22)",
  },
  dark: {
    outside: "rgba(0, 0, 0, 0.3)",
    field: "rgba(255, 246, 214, 0.06)",
    gridUnder: null,
    grid: "rgba(255, 246, 214, 0.55)",
    cellFill: null,
    reachFill: "rgba(255, 246, 214, 0.26)",
    reachEdge: "rgba(255, 246, 214, 0.95)",
    moveFill: "rgba(250, 204, 21, 0.32)",
    targetFill: "rgba(239, 68, 68, 0.3)",
  },
};
