import { useEffect, useRef } from "react";
export function useFindFlight() {
  const flights = useRef(new Set<HTMLElement>());
  useEffect(
    () => () => {
      flights.current.forEach((node) => {
        node.getAnimations().forEach((a) => a.cancel());
        node.remove();
      });
      flights.current.clear();
    },
    [],
  );
  return async (scene: HTMLElement | null, kind: string, source: string) => {
    if (!scene || matchMedia("(prefers-reduced-motion:reduce)").matches) return;
    const origin = scene.querySelector<HTMLElement>(source),
      target = scene.querySelector<HTMLElement>(
        `[data-find-kind="${kind}"] .finds-stack`,
      );
    if (!origin || !target) return;
    const from = origin.getBoundingClientRect(),
      to = target.getBoundingClientRect(),
      box = scene.getBoundingClientRect();
    if (!from.width || !to.width) return;
    const flyer = document.createElement("span");
    flyer.className = "find-flight";
    flyer.setAttribute("aria-hidden", "true");
    const art = document.createElement("span");
    art.className = "find-art find-" + kind;
    flyer.append(art);
    Object.assign(flyer.style, {
      left: from.left - box.left + "px",
      top: from.top - box.top + "px",
      width: from.width + "px",
      height: from.height + "px",
    });
    flights.current.add(flyer);
    scene.append(flyer);
    const motion = flyer.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        {
          transform: `translate(${to.left - from.left}px,${to.top - from.top}px) scale(${to.width / from.width})`,
          opacity: 0.9,
        },
      ],
      { duration: 520, easing: "cubic-bezier(.3,0,.3,1)", fill: "forwards" },
    );
    try {
      await motion.finished;
    } catch {
      /* Scene closed. */
    } finally {
      flights.current.delete(flyer);
      flyer.remove();
    }
  };
}
