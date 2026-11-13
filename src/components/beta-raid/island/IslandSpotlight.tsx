// Золотое кольцо вокруг кнопки и короткая подсказка рядом — поверх всего, но
// мимо пальца: кольцо не ловит нажатия, кнопка под ним работает. Закрыть —
// «Понятно» или нажать саму кнопку. Элемента нет на экране — подсказка ждёт
// его пару секунд (меню могло быть свёрнуто) и тихо гаснет.
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { tgFullscreenTop } from "@/lib/telegram/mobileFullscreen";
import { placeSpotlightTip, reserveSpotlightFooter } from "./spotlightPlacement";
import { findVisible, showSpotlight, subscribeSpotlight, type Spotlight } from "./spotlightBus";
import "./island.css";

const PAD = 6;
const TICK_MS = 250;
const GIVE_UP_MS = 4000;

type Box = { x: number; y: number; w: number; h: number; panelLeft: number; panelTop: number; panelRight: number; panelBottom: number; viewportLeft: number; viewportTop: number; viewportWidth: number; viewportHeight: number };

function IslandSpotlightView() {
  const t = useT();
  const [spot, setSpot] = useState<Spotlight | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipSize, setTipSize] = useState<{ width: number; height: number } | null>(null);
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
      if (findVisible("[data-sonner-toast]")) {
        setBox(null);
        return;
      }
      const dialog = findVisible('[role="dialog"], [aria-modal="true"], section[aria-labelledby="castle-window-title"], section[aria-labelledby="quest-preview-title"]');
      if (dialog && el && !el.closest('[role="dialog"], [aria-modal="true"], section[aria-labelledby="castle-window-title"], section[aria-labelledby="quest-preview-title"]')) {
        setBox(null);
        return;
      }
      if (!el) {
        if (Date.now() - started > (spot.waitMs ?? GIVE_UP_MS)) close();
        setBox((b) => (b === null ? b : null));
        return;
      }
      const r = el.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportTop = Math.max(viewport?.offsetTop ?? 0, tgFullscreenTop());
      const contentViewport = reserveSpotlightFooter({
        left: viewport?.offsetLeft ?? 0, top: viewportTop,
        width: viewport?.width ?? window.innerWidth,
        height: Math.max(1, (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - viewportTop),
      }, findVisible(".island-skip__castle")?.getBoundingClientRect());
      const panel = spot.guide && !el.closest('[role="dialog"], [aria-modal="true"]') ? findVisible(".island-quest[data-guiding=\"true\"]")?.getBoundingClientRect() : null;
      const next = {
        x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2,
        panelLeft: panel?.left ?? 0, panelTop: panel?.top ?? 0,
        panelRight: panel?.right ?? 0, panelBottom: panel?.bottom ?? 0,
        viewportLeft: contentViewport.left, viewportTop: contentViewport.top,
        viewportWidth: contentViewport.width, viewportHeight: contentViewport.height,
      };
      // Кольцо стоит на месте — состояние не трогаем: перерисовка 4 раза в секунду ни к чему.
      setBox((b) =>
        b && b.x === next.x && b.y === next.y && b.w === next.w && b.h === next.h &&
        b.panelLeft === next.panelLeft && b.panelTop === next.panelTop &&
        b.panelRight === next.panelRight && b.panelBottom === next.panelBottom &&
        b.viewportLeft === next.viewportLeft && b.viewportTop === next.viewportTop &&
        b.viewportWidth === next.viewportWidth && b.viewportHeight === next.viewportHeight ? b : next,
      );
    };
    measure();
    const id = window.setInterval(measure, TICK_MS);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    // Нажал подсвеченную кнопку — подсказка своё сделала.
    const onTap = (e: Event) => {
      if (!el || !(e.target instanceof Node) || !el.contains(e.target)) return;
      spot.onTap?.();
      close();
    };
    document.addEventListener("pointerdown", onTap, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
      document.removeEventListener("pointerdown", onTap, true);
    };
  }, [spot]);
  const tipWidth = box ? Math.max(1, Math.min(box.panelBottom ? 340 : 300, box.viewportWidth - (box.panelBottom ? 72 : 16))) : 300;
  useLayoutEffect(() => {
    const node = tipRef.current;
    if (!spot || !box || !node) { setTipSize(null); return; }
    const measure = () => {
      const r = node.getBoundingClientRect();
      setTipSize(previous => previous?.width === r.width && previous?.height === r.height ? previous : { width: r.width, height: r.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [spot, !!box, tipWidth, box?.viewportHeight]);
  if (!spot || !box || typeof document === "undefined") return null;
  const position = placeSpotlightTip(box, tipSize ?? { width: tipWidth, height: 0 },
    { left: box.viewportLeft, top: box.viewportTop, width: box.viewportWidth, height: box.viewportHeight },
    box.panelBottom ? { left: box.panelLeft, top: box.panelTop, right: box.panelRight, bottom: box.panelBottom } : undefined);
  return createPortal(
    <>
      <div
        className="island-spot__ring"
        style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        aria-hidden="true"
      />
      <div
        ref={tipRef}
        role="status"
        className="island-spot__tip"
        style={{ left: position.left, top: position.top, maxWidth: tipWidth, maxHeight: position.maxHeight, overflow: "hidden", visibility: tipSize ? "visible" : "hidden", boxSizing: "border-box" }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p style={{ maxHeight: Math.max(1, position.maxHeight - 16), overflowY: "auto" }}>{spot.text}</p>
        {!spot.noButton && <button
          type="button"
          onClick={() => {
            showSpotlight(null);
            spot.onNext?.();
          }}
        >
          {spot.button ?? t("island.got_it")}
        </button>}
      </div>
    </>,
    document.body,
  );
}

// memo: экран рейда перерисовывается на каждый шаг героя, а этому компоненту
// шаг ни при чём — без memo он с иконками шёл следом (замер 06.11.2026).
export const IslandSpotlight = memo(IslandSpotlightView);
