// Приближение замка без перерисовки на каждом шаге — как на карте (17.10.2026).
// Раньше каждый шаг щипка или колеса менял масштаб React-состоянием: заново
// рисовались оба слоя сцены с размытыми тенями и перемерялись все подписи.
// Теперь, пока жест идёт, готовую картинку растягивает видеокарта (CSS scale вокруг
// центра экрана), а честная перерисовка в новом масштабе — одна, когда жест кончился.
import { useRef, type RefObject } from "react";
import { castleMotion } from "./castleMotion";

/** Пауза колеса, после которой масштаб фиксируется. */
const SETTLE_MS = 180;

export function useCastleZoomPreview(opts: {
  host: RefObject<HTMLDivElement | null>;
  stage: RefObject<HTMLDivElement | null>;
  /** Масштаб, в котором сцена нарисована сейчас. */
  drawn: () => number;
  /** Зафиксировать масштаб (перерисовка). Вернёт false, если масштаб не изменился. */
  commit: (scale: number) => boolean;
}) {
  const pending = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearing = useRef(false);

  const reset = () => {
    const stage = opts.stage.current;
    if (!stage) return;
    stage.style.transform = "";
    stage.style.transformOrigin = "";
    stage.style.willChange = "";
  };

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const scale = pending.current;
    pending.current = null;
    if (scale === null) return;
    // Снимаем растяжку в том же кадре, где появится сцена в новом масштабе.
    if (opts.commit(scale)) clearing.current = true;
    else reset();
  };

  return {
    /** Идёт ли растяжка (масштаб ещё не зафиксирован). */
    active: () => pending.current !== null,
    /** Шаг жеста: растянуть готовую картинку до масштаба scale. */
    preview(scale: number) {
      const host = opts.host.current;
      const stage = opts.stage.current;
      if (!host || !stage) {
        opts.commit(scale);
        return;
      }
      pending.current = scale;
      castleMotion.mark(SETTLE_MS + 200);
      const k = scale / opts.drawn();
      stage.style.willChange = "transform";
      stage.style.transformOrigin = `${host.scrollLeft + host.clientWidth / 2}px ${host.scrollTop + host.clientHeight / 2}px`;
      stage.style.transform = `scale(${k})`;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SETTLE_MS);
    },
    /** Жест кончился (пальцы отпустили) — зафиксировать сразу. */
    flush,
    /** Звать после перерисовки в новом масштабе (layout-эффект камеры). */
    afterDraw() {
      if (!clearing.current) return;
      clearing.current = false;
      reset();
    },
  };
}
