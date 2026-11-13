import {useEffect,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import './newspaper.css';
/** Full building screen. Focus returns to its opener; background cannot receive taps. */
export function NewspaperFrame({children}:{children:ReactNode}){
 const root=useRef<HTMLDivElement>(null);
 const opener=useRef(typeof document!=='undefined'?document.activeElement as HTMLElement|null:null);
 useEffect(()=>{const overflow=document.body.style.overflow;document.body.style.overflow='hidden';if(!root.current?.contains(document.activeElement))root.current?.querySelector<HTMLButtonElement>('button')?.focus();return()=>{document.body.style.overflow=overflow;opener.current?.focus();};},[]);
 return createPortal(<div ref={root} className="np-game-overlay" role="dialog" aria-modal="true" aria-label="Newspaper" tabIndex={-1} onKeyDown={e=>{
  if(e.key!=='Tab')return;
  const items=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]')??[]);
  if(!items.length){e.preventDefault();return;}
  if(e.shiftKey&&(document.activeElement===items[0]||document.activeElement===root.current)){e.preventDefault();items.at(-1)?.focus();}
  else if(!e.shiftKey&&(document.activeElement===items.at(-1)||document.activeElement===root.current)){e.preventDefault();items[0]?.focus();}
 }}>{children}</div>,document.body);
}
