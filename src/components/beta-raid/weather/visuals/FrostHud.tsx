import {useEffect,useRef,type ReactNode} from 'react';
import './hud-frost.css';

const surfaces=[
 '.sound-drop__frost-surface',
 '.raid-weather__drawer','.raid-weather__details',
 '.raid-hero-group','.raid-hero-group__portrait-button','.raid-right-menu__toggle','.raid-right-menu__items > button','.raid-lower-actions__toggle','.raid-lower-actions__item > button','.raid-preset-access__toggle','.raid-resource-bar__surface',
 '.raid-live-balances','.raid-live-portrait','.raid-energy__buy',
 '.raid-right-menu-preview-toggle','.raid-world-utilities button',
 '.raid-map-nav__button','.raid-lower57__toggle','.raid-lower57__item button',
 '.raid-quick-access','.raid-main-hand','.raid-preset-quick-access',
 '.castle-main-hud__effects-pill','.castle-main-hud__effects-toggle--icon',
 '.raid-hud-resource-bar',
].join(',');

/**
 * Weather coating clipped to the painted surface, including its outline.
 * Static coating: ignore text ticks, coalesce structural updates, measure only
 * affected surfaces and ancestors, and batch geometry reads before style writes.
 */
export function FrostHud({temperature,children}:{temperature:string;children?:ReactNode}) {
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const host=children ? root.current : root.current?.parentElement;
  if(!host || !['cold','very-cold'].includes(temperature))return;
  const attached=new Map<HTMLElement,{layer:HTMLSpanElement;position:string}>();
  const dirty=new Set<HTMLElement>();
  let discover=true,frame=0,stopped=false;
  const mark=(node:Node)=>{for(const el of attached.keys())if(el===node||el.contains(node)||node.contains(el))dirty.add(el);};
  const schedule=()=>{if(!stopped&&!document.hidden&&!frame)frame=requestAnimationFrame(()=>{frame=0;sync()});};
  const resize=new ResizeObserver(entries=>{for(const entry of entries)mark(entry.target);schedule();});
  const sync=()=>{
   if(stopped||document.hidden)return;
   if(discover){
    discover=false;
    for(const [el,{layer,position}] of attached)if(!host.contains(el)){
     resize.unobserve(el);layer.remove();el.style.position=position;attached.delete(el);dirty.delete(el);
    }
    host.querySelectorAll<HTMLElement>(surfaces).forEach(el=>{
     if(attached.has(el)||el.closest('[role="dialog"],[role="menu"]'))return;
     const position=el.style.position;
     if(getComputedStyle(el).position==='static')el.style.position='relative';
     const layer=document.createElement('span');
     layer.className='hud-frost-coating';layer.dataset.frostTemperature=temperature;layer.setAttribute('aria-hidden','true');
     const identity=el.getAttribute('aria-label')||el.className;
     const seed=Array.from(identity).reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0);
     layer.dataset.pattern=String(seed%4);
     layer.dataset.round=String(el.matches('.raid-live-portrait,.raid-hero-group__portrait-button,.raid-right-menu__toggle,.raid-right-menu__items > button,.raid-lower-actions__toggle,.raid-lower-actions__item > button,.raid-lower57__item button,.raid-right-menu-preview-toggle,.raid-world-utilities button,.raid-lower57__toggle,.raid-quick-access,.raid-main-hand,.raid-preset-access__toggle,.castle-main-hud__effects-toggle--icon'));
     el.append(layer);attached.set(el,{layer,position});resize.observe(el);mark(el);
    });
   }
   if(!dirty.size)return;
   // Read all geometry first, then write styles. Never force a second layout
   // by measuring the newly written coating to compute its nested cut-outs.
   const boxes=new Map<Element,DOMRect>();
   const styles=new Map<Element,CSSStyleDeclaration>();
   const box=(el:Element)=>{let value=boxes.get(el);if(!value){value=el.getBoundingClientRect();boxes.set(el,value);}return value;};
   const style=(el:Element)=>{let value=styles.get(el);if(!value){value=getComputedStyle(el);styles.set(el,value);}return value;};
   const updates:Array<{layer:HTMLSpanElement;values:Record<string,string>;radius:string;clip:string;mask:string;compact:string}>=[];
   for(const el of dirty){
    const entry=attached.get(el);if(!entry)continue;
    const compact=el.matches('.raid-energy__buy');
    const painted=compact?el.querySelector('svg'):el;if(!painted)continue;
    const bounds=box(el),paint=box(painted),css=style(el),paintCss=style(painted);
    // Use layout pixels: expanding items are scaled, so viewport bounds
    // would apply the menu animation scale to the coating a second time.
    const expandingAction=!!el.closest('.raid-lower-actions__item,.raid-lower57__item');
    const values={
     '--frost-top':`${paint.top-bounds.top-(parseFloat(css.borderTopWidth)||0)}px`,
     '--frost-left':`${paint.left-bounds.left-(parseFloat(css.borderLeftWidth)||0)}px`,
     '--frost-width':`${expandingAction?el.offsetWidth:paint.width}px`,'--frost-height':`${expandingAction?el.offsetHeight:paint.height}px`,
     '--frost-radius':paintCss.borderTopLeftRadius,
    };
    const glass=el.querySelector('.raid-weather__glass');
    const nested=[...attached.keys()].filter(child=>child!==el&&el.contains(child));
    let mask='';
    if(nested.length&&paint.width&&paint.height){
     const holes=nested.map(child=>{
      const target=child.matches('.raid-energy__buy')?child.querySelector('svg')||child:child;
      const rect=box(target),radius=style(target).borderTopLeftRadius;
      const rx=radius.includes('%')?Math.min(rect.width,rect.height)/2:parseFloat(radius)||0;
      return `<rect x="${rect.left-paint.left}" y="${rect.top-paint.top}" width="${rect.width}" height="${rect.height}" rx="${rx}" fill="black"/>`;
     }).join('');
     mask=`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${paint.width}" height="${paint.height}"><rect width="100%" height="100%" fill="white"/>${holes}</svg>`)}")`;
    }
    updates.push({layer:entry.layer,values,radius:paintCss.borderTopLeftRadius,clip:glass?style(glass).clipPath:el.matches('.sound-drop__frost-surface')?css.clipPath:'',mask,compact:String(compact)});
   }
   dirty.clear();
   for(const {layer,values,radius,clip,mask,compact} of updates){
    for(const [key,value] of Object.entries(values))if(layer.style.getPropertyValue(key)!==value)layer.style.setProperty(key,value);
    if(layer.style.borderRadius!==radius)layer.style.borderRadius=radius;
    if(layer.style.clipPath!==clip)layer.style.clipPath=clip;
    if(layer.style.maskImage!==mask)layer.style.maskImage=mask;
    const mode=mask?'luminance':'';if(layer.style.maskMode!==mode)layer.style.maskMode=mode;
    if(layer.dataset.compact!==compact)layer.dataset.compact=compact;
   }
  };
  const observer=new MutationObserver(records=>{
   for(const record of records){
    if(record.type==='attributes'){mark(record.target);continue;}
    // Timer/balance text and our own coating mounts do not change topology.
    const nodes=[...record.addedNodes,...record.removedNodes].filter((node):node is Element=>node instanceof Element&&!node.classList.contains('hud-frost-coating'));
    if(!nodes.length)continue;
    if(nodes.some(node=>node.matches(surfaces)||node.querySelector(surfaces)))discover=true;
    mark(record.target);
   }
   if(discover||dirty.size)schedule();
  });
  const resume=()=>{if(!document.hidden&&(discover||dirty.size))schedule();};
  sync();observer.observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:['data-open']});
  document.addEventListener('visibilitychange',resume);
  return()=>{stopped=true;cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();document.removeEventListener('visibilitychange',resume);dirty.clear();for(const [el,{layer,position}] of attached){layer.remove();el.style.position=position;}};
 },[temperature,!!children]);
 return <div hidden={!children} ref={root} className="weather-map-hud" data-hud-temperature={temperature}>{children}</div>;
}
