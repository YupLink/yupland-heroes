import {useState,useEffect} from "react";
export function useCastleZoom(){
  const [zoom, setZoom] = useState(() => {
    try {
      const stored = localStorage.getItem("castle-modular-zoom-v1");
      const value = stored === null ? 0 : Number(stored);
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
    } catch { return 1; }
  });
  useEffect(() => {
    try { localStorage.setItem("castle-modular-zoom-v1", String(zoom)); } catch { /* Storage may be unavailable. */ }
  }, [zoom]);
  return [zoom,setZoom] as const;
}
