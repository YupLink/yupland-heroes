// Тур по замку (владелец, 14.10.2026: «войти в ратушу и провести — коротко,
// ненавязчиво, с подсветками»): новичок входит в замок через ратушу острова, и
// по очереди подсвечиваются постройки — что где. «Дальше» — следующая; нажал
// саму постройку — открылось её окно, тур ждёт, пока он вернётся в замок.
// Последний шаг пройден — задание «Замок» засчитано.
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import { currentSpotlight, findVisible, showSpotlight } from "./spotlightBus";

// End beside the Tavern: the next recorded lesson opens the player’s hero there.
// «Торговый дом» (shop) убран из замка 16.10 — паки теперь в лагере; с ним в
// списке тур вставал на второй остановке, и «Замок» не засчитывался (06.11).
const STOPS = ["training", "warehouse", "hall", "gates", "tavern"] as const;
const POLL_MS = 800;

const selectorOf = (id: string) => `[data-modular-building="${id}"]`;
/** Открыто окно постройки замка или диалог — тур ждёт, пока его закроют. */
const WINDOW_OPEN =
  'section[aria-labelledby="castle-window-title"], section[aria-labelledby="quest-preview-title"], [role="dialog"]';

export function useCastleTour(active: boolean, onDone: () => void): void {
  const translate = useT();
  const t = useRef(translate);
  t.current = translate;
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
      const advance = () => {
        step.current += 1;
        if (step.current >= STOPS.length) done.current();
      };
      // Постройки нет в замке вовсе (убрали, не построена) — остановку пропускаем,
      // иначе тур ждёт её вечно.
      if (!document.querySelector(selectorOf(stop))) return advance();
      if (findVisible(WINDOW_OPEN)) return;
      if (!findVisible(selectorOf("training")) || !findVisible(selectorOf(stop))) return;
      const last = step.current === STOPS.length - 1;
      showSpotlight({
        selector: selectorOf(stop),
        text: t.current(`island.tour.${stop}`),
        button: last ? t.current("island.got_it") : t.current("island.next"),
        // Opening a highlighted building also completes that stop. Continue
        // after its window closes instead of showing the same building again.
        onTap: advance,
        onNext: advance,
      });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [active]);
}
