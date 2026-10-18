// Золотое кольцо вокруг кнопки и короткая подсказка рядом — поверх всего, но
// мимо пальца: кольцо не ловит нажатия, кнопка под ним работает. Закрыть —
// «Понятно» или нажать саму кнопку. Элемента нет на экране — подсказка ждёт
// его пару секунд (меню могло быть свёрнуто) и тихо гаснет.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { findVisible, showSpotlight, subscribeSpotlight, type Spotlight } from "./spotlightBus";
import "./island.css";

const PAD = 6;
const TICK_MS = 250;
const GIVE_UP_MS = 4000;

type Box = { x: number; y: number; w: number; h: number };

export function IslandSpotlight() {
  const t = useT();
  const [spot, setSpot] = useState<Spotlight | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => subscribeSpotlight(setSpot), []);
  useEffect(() => {
    if (!spot) {
      setBox(null);
      return;
    }
    const started = Date.now();
    let el: HTMLElement | null = null;
    const close = () => showSpotlight(null);
    const measure = () => {
      el = findVisible(spot.selector);
      if (!el) {
        if (Date.now() - started > (spot.waitMs ?? GIVE_UP_MS)) close();
        setBox((b) => (b === null ? b : null));
        return;
      }
      const r = el.getBoundingClientRect();
      const next = { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
      // Кольцо стоит на месте — состояние не трогаем: перерисовка 4 раза в секунду ни к чему.
      setBox((b) =>
        b && b.x === next.x && b.y === next.y && b.w === next.w && b.h === next.h ? b : next,
      );
    };
    measure();
    const id = window.setInterval(measure, TICK_MS);
    // Нажал подсвеченную кнопку — подсказка своё сделала.
    const onTap = (e: Event) => {
      if (!el || !(e.target instanceof Node) || !el.contains(e.target)) return;
      spot.onTap?.();
      close();
    };
    document.addEventListener("pointerdown", onTap, true);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("pointerdown", onTap, true);
    };
  }, [spot]);
  if (!spot || !box || typeof document === "undefined") return null;
  const below = box.y + box.h + 120 < window.innerHeight;
  const tipTop = below ? box.y + box.h + 10 : Math.max(8, box.y - 10);
  const tipLeft = Math.min(Math.max(8, box.x + box.w / 2 - 140), window.innerWidth - 288);
  return createPortal(
    <>
      <div
        className="island-spot__ring"
        style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        aria-hidden="true"
      />
      <div
        role="status"
        className={`island-spot__tip${below ? "" : " island-spot__tip--above"}`}
        style={{ left: tipLeft, top: tipTop }}
      >
        <p>{spot.text}</p>
        <button
          type="button"
          onClick={() => {
            showSpotlight(null);
            spot.onNext?.();
          }}
        >
          {spot.button ?? t("island.got_it")}
        </button>
      </div>
    </>,
    document.body,
  );
}
