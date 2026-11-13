import {memo,useEffect,useRef,type CSSProperties} from 'react';
import ember from './fire-rain-ember.webp';
import spark from './fire-rain-spark.webp';

// Fixed count independent of map size. Two shared rasters; transform/opacity only.
const particles=Array.from({length:12},(_,i)=>({
 left:`${(i*37+5)%100}%`,
 animationDuration:`${3.1+(i%5)*.37}s`,
 animationDelay:`${-i*.83}s`,
 width:`${24+i%3*3}px`,height:`${16+(i*7)%13}px`,opacity:.72+(i%4)*.09,
} satisfies CSSProperties));
export const FireRain=memo(function FireRain(){
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const sync=()=>{if(root.current)root.current.dataset.paused=String(document.hidden);};
  sync();document.addEventListener('visibilitychange',sync);
  return()=>document.removeEventListener('visibilitychange',sync);
 },[]);
 return <div ref={root} className="raid-anomaly__fire-rain" aria-hidden="true">
  {particles.map((style,i)=><span className="raid-anomaly__fire-particle" key={i} style={style}><img src={ember} alt="" draggable={false}/><img className="raid-anomaly__spark raid-anomaly__spark--a" src={spark} alt="" draggable={false}/><img className="raid-anomaly__spark raid-anomaly__spark--b" src={spark} alt="" draggable={false}/></span>)}
 </div>;
});
