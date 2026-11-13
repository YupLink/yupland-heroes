import { useEffect, useRef } from 'react';
import './fog-corners.css';
/** Two bounded, pre-rendered sprites. No map traversal or per-frame JavaScript. */
export function FogCorners() {
 const root = useRef<HTMLDivElement>(null);
 useEffect(() => {
  const node = root.current;
  if (!node) return;
  let visible = false;
  const update = () => { node.dataset.paused = String(document.hidden || !visible); };
  const observer = new IntersectionObserver(([entry]) => {
   visible = entry.isIntersecting;
   update();
  });
  observer.observe(node);
  document.addEventListener('visibilitychange', update);
  update();
  return () => {
   observer.disconnect();
   document.removeEventListener('visibilitychange', update);
  };
 }, []);
 return <div ref={root} className="raid-fog-corners" data-paused="true" aria-hidden="true"><div className="raid-fog-corner"/><div className="raid-fog-corner"/></div>;
}
