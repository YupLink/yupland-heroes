import {useState,useLayoutEffect,type RefObject} from "react";
export function useCastleViewportSize(host:RefObject<HTMLDivElement|null>,editing:boolean){
  const [size, setSize] = useState({ width: 360, height: 640 });
  const [insets, setInsets] = useState({ top: 104, bottom: 48 });
  useLayoutEffect(() => {
    const el = host.current!;
    const root = el.closest("main");
    const measure = () => {
      const bounds = el.getBoundingClientRect();
      setSize({ width: el.clientWidth, height: el.clientHeight });
      // Reserve actual HUD height, not the empty space under side rewards.
      const panels = root?.querySelectorAll(".castle-main-hud");
      const panelBottom = Math.max(bounds.top, ...Array.from(panels ?? []).map(p => p.getBoundingClientRect().bottom));
      const rail = root?.querySelector(".castle-resource-dock__rail");
      const next = {
        top: editing ? 0 : panelBottom > bounds.top ? Math.ceil(panelBottom - bounds.top + 12) : 104,
        bottom: editing ? 0 : rail ? Math.ceil(bounds.bottom - rail.getBoundingClientRect().top + 12) : 48,
      };
      setInsets(previous => previous.top === next.top && previous.bottom === next.bottom ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const panel of Array.from(root?.querySelectorAll(".castle-main-hud, .castle-resource-dock__rail") ?? [])) observer.observe(panel);
    measure();
    return () => observer.disconnect();
  }, [editing]);
return {size,insets};
}
