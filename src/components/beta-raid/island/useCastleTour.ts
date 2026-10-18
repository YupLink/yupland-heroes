// Тур по замку (владелец, 14.10.2026: «войти в ратушу и провести — коротко,
// ненавязчиво, с подсветками»): новичок входит в замок через ратушу острова, и
// по очереди подсвечиваются постройки — что где. «Дальше» — следующая; нажал
// саму постройку — открылось её окно, тур ждёт, пока он вернётся в замок.
// Последний шаг пройден — задание «Замок» засчитано.
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import { currentSpotlight, findVisible, showSpotlight } from "./spotlightBus";

const STOPS = ["training", "tavern", "shop", "warehouse", "hall", "gates"] as const;
const POLL_MS = 800;

const selectorOf = (id: string) => `[data-modular-building="${id}"]`;
/** Открыто окно постройки замка или диалог — тур ждёт, пока его закроют. */
const WINDOW_OPEN =
  'section[aria-labelledby="castle-window-title"], section[aria-labelledby="quest-preview-title"], [role="dialog"]';

export function useCastleTour(active: boolean, onDone: () => void): void {
  const t = useT();
  const step = useRef(0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (step.current >= STOPS.length || currentSpotlight()) return;
      // Дёшево сначала: на карте построек замка в документе нет — стили не считаем.
      if (!document.querySelector(selectorOf("training"))) return;
      // Замок на экране и окна построек закрыты: видна хотя бы первая постройка.
      const stop = STOPS[step.current];
      if (findVisible(WINDOW_OPEN)) return;
      if (!findVisible(selectorOf("training")) || !findVisible(selectorOf(stop))) return;
      const last = step.current === STOPS.length - 1;
      showSpotlight({
        selector: selectorOf(stop),
        text: t(`island.tour.${stop}`),
        button: last ? t("island.got_it") : t("island.next"),
        onNext: () => {
          step.current += 1;
          if (step.current >= STOPS.length) done.current();
        },
      });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [active, t]);
}
