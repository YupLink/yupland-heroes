import { useEffect, useRef, useId } from "react";
import "./weather-visuals.css";
import { FogCorners } from "./FogCorners";
import {createHeroFog, type FogPoint} from "./heroFog";
import frost from "./frost-border-raster.webp";
// Only two small raster wisps, shared by every storm instance.
const dustSprites=new Map<boolean,HTMLCanvasElement>();
function stormDust(cold:boolean){
 let sprite=dustSprites.get(cold);if(sprite)return sprite;
 sprite=document.createElement('canvas');sprite.width=sprite.height=128;
 const g=sprite.getContext('2d')!,gradient=g.createRadialGradient(64,64,0,64,64,64);
 gradient.addColorStop(0,cold?'rgba(223,241,250,.30)':'rgba(199,177,130,.23)');
 gradient.addColorStop(.45,cold?'rgba(194,219,235,.17)':'rgba(164,141,101,.12)');
 gradient.addColorStop(1,cold?'rgba(194,219,235,0)':'rgba(164,141,101,0)');
 g.fillStyle=gradient;g.fillRect(0,0,128,128);dustSprites.set(cold,sprite);return sprite;
}
// One tiny cached bitmap: softened ends without per-frame gradients or blur.
let rainStreak: HTMLCanvasElement | undefined;
function softRainStreak() {
 if(rainStreak)return rainStreak;
 const sprite=document.createElement('canvas');sprite.width=12;sprite.height=64;
 const g=sprite.getContext('2d')!;
 const fade=g.createLinearGradient(0,0,0,64);
 fade.addColorStop(0,'rgba(207,228,239,0)');
 fade.addColorStop(.22,'rgba(207,228,239,.48)');
 fade.addColorStop(.62,'rgba(207,228,239,.70)');
 fade.addColorStop(1,'rgba(207,228,239,0)');
 g.strokeStyle=fade;g.lineWidth=2.6;
 g.beginPath();g.moveTo(2,0);g.lineTo(10,64);g.stroke();
 rainStreak=sprite;return sprite;
}
let thunderStreak: HTMLCanvasElement | undefined;
function thunderRainStreak() {
 if(thunderStreak)return thunderStreak;
 const c=document.createElement('canvas');c.width=48;c.height=64;
 const g=c.getContext('2d')!;
 // Crisp small pixels, no enlarged droplet head or blurred tail.
 for(let y=6;y<60;y+=3){
   g.fillStyle=y<24?'#657eaa':y<45?'#a2c0e6':'#e2eeff';
   g.fillRect(Math.round(4+y*.625),y,2,3);
 }
 thunderStreak=c;return c;
}
// Original small raster bolts, art direction referenced from PixelFX Storm.
// Prepared once; no glow filters or branch generation during an animation frame.
let thunderBolts: HTMLCanvasElement[] | undefined;
function pixelBolts() {
 if(thunderBolts)return thunderBolts;
 thunderBolts=Array.from({length:2},(_,variant)=>{
  const c=document.createElement('canvas');c.width=96;c.height=256;
  const g=c.getContext('2d')!;let seed=variant+37;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  const trunk:Array<[number,number]>=[[48,0]];
  for(let y=8;y<=248;y+=8)trunk.push([Math.max(22,Math.min(74,trunk[trunk.length-1][0]+Math.round((random()-.5)*22))),y]);
  const paths=[trunk];
  for(const k of [7,13,19]){
   const branch:Array<[number,number]>=[trunk[k]];const direction=k===13?-1:1;
   for(let j=1;j<=6;j++)branch.push([Math.max(3,Math.min(92,branch[j-1][0]+direction*(3+random()*5))),branch[j-1][1]+5+random()*4]);
   paths.push(branch);
  }
  for(const [width,color] of [[5,'#3e4078'],[3,'#839bd1'],[1,'#eff7ff']] as const){
   g.fillStyle=color;
   for(const path of paths)for(let i=1;i<path.length;i++){
    const [x0,y0]=path[i-1],[x1,y1]=path[i];const steps=Math.ceil(Math.max(Math.abs(x1-x0),Math.abs(y1-y0)));
    for(let j=0;j<=steps;j++)g.fillRect(Math.round(x0+(x1-x0)*j/steps)-Math.floor(width/2),Math.round(y0+(y1-y0)*j/steps),width,1);
   }
  }
  return c;
 });
 return thunderBolts;
}
export type WeatherKind = "clear" | "overcast" | "fog" | "rain" | "storm" | "thunderstorm" | "blizzard" | "fire_rain" | "snow";
// Fire rain (heat anomaly, 05.11.2026): the rain effect in ember tones per stroke width — no glow.
const EMBER=['rgba(255,150,60,.62)','rgba(236,92,34,.6)','rgba(255,196,96,.58)'];
// Спрайт снежинки: круг радиусом FLAKE_R с той же тёмной тенью, что была у каждой.
const FLAKE_R = 8, FLAKE_SIZE = 40, FLAKE_SCALE = FLAKE_SIZE / 2 / FLAKE_R;
function snowSprite() {
 const c = document.createElement('canvas'); c.width = c.height = FLAKE_SIZE;
 const g = c.getContext('2d')!;
 g.fillStyle = '#fafdff'; g.shadowColor = '#526a72'; g.shadowBlur = FLAKE_R * .7;
 g.beginPath(); g.arc(FLAKE_SIZE / 2, FLAKE_SIZE / 2, FLAKE_R, 0, Math.PI * 2); g.fill();
 return c;
}
// Fixed viewport budget. No map traversal, DOM particles or per-frame filters.
const BLIZZARD_WIND_COUNT = 144;
let sprite: HTMLCanvasElement | undefined;
function snowGrain() {
  if (sprite) return sprite;
  sprite = document.createElement('canvas');
  sprite.width = sprite.height = 16;
  const g = sprite.getContext('2d')!;
  const fade = g.createRadialGradient(8, 8, 1, 8, 8, 7);
  fade.addColorStop(0, 'rgba(249,253,255,1)');
  fade.addColorStop(.45, 'rgba(231,243,250,.8)');
  fade.addColorStop(1, 'rgba(231,243,250,0)');
  g.fillStyle = fade; g.fillRect(0, 0, 16, 16);
  return sprite;
}
function createBlizzardWind() {
  const image = snowGrain();
  const flakes = Array.from({length: BLIZZARD_WIND_COUNT}, (_, i) => ({
    x: (i * .61803398875) % 1, y: (i * .41421356237) % 1,
    speed: .65 + (i % 7) * .11, size: 2 + i % 4, phase: i * 2.39996,
  }));
  let elapsed = 0;
  return (ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) => {
    if (!w || !h) return;
    const step = Math.min(80, Math.max(0, dt)) / 1000;
    elapsed += step;
    const speed = 620 + 90 * Math.sin(elapsed * 2.2);
    for (let i = 0; i < flakes.length; i++) {
      const p = flakes[i];
      const x = p.x * w + speed * .7 * p.speed * step;
      const y = p.y * h + speed * p.speed * step;
      p.x = (((x + 12) % (w + 24) + w + 24) % (w + 24) - 12) / w;
      p.y = (((y + 12) % (h + 24) + h + 24) % (h + 24) - 12) / h;
      ctx.globalAlpha = .65 + (i % 3) * .12;
      ctx.drawImage(image, p.x * w, p.y * h, p.size * 1.2, p.size * 1.5);
    }
    ctx.globalAlpha = 1;
  };
}

export type WeatherTemperature = "very-cold" | "cold" | "mild" | "warm" | "hot";
export type WeatherCamera = {onPuddles?:(enabled:boolean)=>void;onSnowStage?:(stage:number)=>void;rainPoint?:(x:number,y:number)=>FogPoint|null;heroRef?:{readonly current:FogPoint|null};offsetRef:{readonly current:{x:number;y:number}|null};scaleRef:{readonly current:number|null}};
type WeatherLayerProps = {kind: WeatherKind;temperature?:WeatherTemperature;camera?:WeatherCamera};
export function WeatherLayer(props: WeatherLayerProps) {
 if(props.kind==='fog')return <FogCorners/>;
 return <ActiveWeatherLayer {...props}/>;
}
function ActiveWeatherLayer({kind,temperature="warm",camera}: WeatherLayerProps) {
 const filterPrefix = useId().replace(/:/g, '');
 const contourId = `${filterPrefix}-fog-contour`;
 const wispsId = `${filterPrefix}-fog-wisps`;
 const root = useRef<HTMLDivElement>(null);
 useEffect(()=>{
  camera?.onPuddles?.(kind==='rain'||kind==='thunderstorm');
  return()=>camera?.onPuddles?.(false);
 },[kind,camera?.onPuddles]);
 useEffect(()=>{
  const update=camera?.onSnowStage;
  if(!update)return;
  if(kind!=='blizzard'){update(0);return;}
  let stage=1;update(stage);
  const timer=setInterval(()=>{if(document.hidden)return;update(++stage);if(stage===4)clearInterval(timer)},2000);
  return()=>{clearInterval(timer);update(0)};
 },[kind,camera?.onSnowStage]);
 useEffect(() => {
  const scene = root.current!;
  const blizzard=kind==='blizzard';
  const wind=blizzard?createBlizzardWind():null;
  const cold=temperature==='cold'||temperature==='very-cold';
  const dustSprite=kind==='storm'?stormDust(cold):null;
  const thunder=kind==='thunderstorm';
  const bolts=thunder?pixelBolts():null;
  const rainSprite=thunder?thunderRainStreak():kind==='rain'?softRainStreak():null;
  const cellSnow=kind==='blizzard'&&!!camera?.rainPoint;
  const cellRain=(kind==='rain'||thunder||cellSnow)&&!!camera?.rainPoint;
  const impacts=Array.from({length:cellRain?(thunder?300:36):0},(_,i)=>({x:0,y:0,age:(thunder?i%60:i)*(cellSnow?15:(thunder?5:10.62)),life:cellSnow?550+i%4*50:(thunder?300+i%4*30:384+i%4*38.4),valid:false,seed:i+1}));
  const canvas = scene.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d', {alpha:true})!;
  const heroFog = kind==='fog' ? createHeroFog(ctx) : null;
  const flake=kind==='blizzard'?snowSprite():null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let drops: Array<{x:number;y:number;speed:number;size:number;drift:number}> = [];
  let debris: Array<{x:number;y:number;size:number;phase:number;speed:number}> = [];
  const soft=kind==='fog'||kind==='overcast';
  const active=kind!=='clear'&&kind!=='overcast';
  let visible=true, timer:ReturnType<typeof setTimeout>|undefined;
  let viewWidth=0,viewHeight=0, cameraKey='';
  const frameInterval=soft?1000/12:1000/24;
  let last=0, flashUntil=0, nextFlash=performance.now()+700;
  let flashSide=0;
  const lightningLeft=scene.querySelector<SVGElement>('.lightning-left')!;
  const lightningRight=scene.querySelector<SVGElement>('.lightning-right')!;
  const flash=scene.querySelector<HTMLElement>('.storm-flash')!;
  lightningLeft.style.opacity='0';lightningRight.style.opacity='0';
function resize() {
  const rect = scene.getBoundingClientRect();
  viewWidth=rect.width;viewHeight=rect.height;
  // Decorative weather does not need retina-resolution buffers.
  const ratio=active?Math.min(soft ? .375 : 1,Math.sqrt((soft?131072:350000)/Math.max(1,rect.width*rect.height))):0;
  canvas.width = Math.max(1,Math.floor(rect.width*ratio));
  canvas.height = Math.max(1,Math.floor(rect.height*ratio));
  ctx.setTransform(canvas.width/Math.max(1,rect.width),0,0,canvas.height/Math.max(1,rect.height),0,0);
  cameraKey='';
  seed(rect.width, rect.height);
  restart();
}
function seed(w: number, h: number) {
  debris = kind === 'storm' ? Array.from({length:Math.min(36,Math.max(16,Math.round(w*h/18000)))},(_,i)=>({
    x:(i*.6180339887%1)*w,y:(i*.41421356%1)*h,
    size:4.5+(i%5)*1.2,phase:i*2.4,speed:.7+(i%7)*.12,
  })) : [];

  const density = kind === 'blizzard' ? 4200 : kind === 'storm' ? 2800 : kind === 'thunderstorm' ? 3000 : kind === 'rain' || kind === 'fire_rain' ? 4800 : 0;
  const n = density && !cellRain && !blizzard ? Math.max(48, Math.min(kind === 'blizzard' ? 96 : 120, Math.round(w * h / density))) : 0;
  drops = Array.from({ length: n }, (_, i) => ({
    x: (i * .6180339887 % 1) * w,
    y: ((i * 73.87) % n) / Math.max(n, 1) * h,
    speed: .35 + ((i * 53) % 100) / 170,
    size: 1.1 + ((i * 17) % 13) / 8,
    drift: ((i * 31) % 7) / 7,
  }));
}
function draw(now: number) {
  if (document.hidden || !visible || !active) return;
  const trackCamera=(kind==='fog'&&!!camera?.heroRef)||cellRain;
  if(!reduced.matches||trackCamera) timer=setTimeout(()=>draw(performance.now()),reduced.matches?250:frameInterval);
  const offset=camera?.offsetRef.current,hero=camera?.heroRef?.current;
  const key=[offset?.x,offset?.y,hero?.x,hero?.y,camera?.scaleRef.current].join('/');
  if(reduced.matches&&trackCamera&&key===cameraKey)return;
  cameraKey=key;
  const dt = Math.min(now - (last || now), 150);
  last = now;
  const w = viewWidth, h = viewHeight;
  ctx.clearRect(0, 0, w, h);
  if(thunder&&!reduced.matches&&now>=nextFlash){
    flashUntil=now+420;nextFlash=now+4500+Math.random()*3000;
    flashSide=1-flashSide;flash.style.transform=flashSide?'none':'scaleX(-1)';
  }
  const strikeAge=420-(flashUntil-now);
  const thunderLight=thunder&&!reduced.matches&&strikeAge>=0&&strikeAge<420
    ?strikeAge<85?1-strikeAge/140:strikeAge<180?0:strikeAge<265?.9-(strikeAge-180)/150:Math.max(0,(420-strikeAge)/600):0;


  if(heroFog && camera?.heroRef?.current) heroFog(w,h,camera.heroRef.current,camera.offsetRef.current??{x:0,y:0},camera.scaleRef.current??1,reduced.matches?0:now);
  const snow = kind === 'blizzard';
  if(cellRain&&(rainSprite||cellSnow)){
    const scale=camera?.scaleRef.current??1,off=camera?.offsetRef.current??{x:0,y:0};
    const originX=w/2+off.x,originY=h/2+off.y;
    for(const p of impacts){
      p.age+=reduced.matches?0:dt;
      if(!p.valid||p.age>=p.life){
        if(p.valid)p.age%=p.life;
        p.valid=false;
        // Bounded sampling: at most four O(1) map lookups per recycled drop.
        for(let attempt=0;attempt<4;attempt++){
          p.seed=(p.seed*1664525+1013904223)>>>0;const u=p.seed/4294967296;
          p.seed=(p.seed*1664525+1013904223)>>>0;const v=p.seed/4294967296;
          const point=camera!.rainPoint!((u*w-originX)/scale,((.16+v*.78)*h-originY)/scale);
          if(point){p.x=point.x;p.y=point.y;p.valid=true;break;}
        }
      }
      if(!p.valid)continue;
      const x=originX+p.x*scale,y=originY+p.y*scale;
      const phase=reduced.matches?.84:p.age/p.life;
      if(cellSnow){
        const falling=phase<.8;
        const t=falling?phase/.8:(phase-.8)/.2;
        const remaining=falling?(1-t)*65*scale:0;
        const drift=falling?-45.5*scale*(1-t):0;
        ctx.globalAlpha=falling?.85:(1-t)*.65;
        ctx.fillStyle='#edf5fa';
        ctx.beginPath();ctx.ellipse(x+drift,y-remaining,Math.max(.8,1.9*scale),Math.max(.5,(falling?1.9:.7)*scale),0,0,Math.PI*2);ctx.fill();
      }else if(phase<.5625){
        const remaining=(1-phase/.5625)*60*scale;
        const length=Math.min(remaining,(thunder?(p.seed%3===0?12:23):19)*scale);
        if(length>0){ctx.globalAlpha=thunder?Math.min(1,(p.seed%3===0?.38:.75)+thunderLight*.4):.8;ctx.drawImage(rainSprite!,x-remaining*(thunder?.625:.125)-length*(thunder?.6875:.03125),y-remaining-length,length*(thunder?.75:.1875),length);}
      }else{
        const t=(phase-.5625)/.4375,radius=(1+t*5)*scale;
        ctx.globalAlpha=(1-t)*(thunder?.55+thunderLight*.3:.55);ctx.strokeStyle=thunder&&thunderLight>.3?'#f1f6ff':'#d0e5ed';ctx.lineWidth=Math.max(.65,scale*.45);
        ctx.beginPath();ctx.ellipse(x,y,radius,radius*.38,0,0,Math.PI*2);ctx.stroke();
      }
    }
    ctx.globalAlpha=1;
  }
  wind?.(ctx,w,h,reduced.matches?0:dt);
  if (!cellRain && (snow || ['rain', 'fire_rain', 'storm', 'thunderstorm'].includes(kind))) {
    const fast = kind === 'storm' || kind === 'thunderstorm';
    ctx.lineCap = 'round';
    if(snow&&flake){
      for(const p of drops){const size=p.size*.75*FLAKE_SCALE;ctx.globalAlpha=.55+p.drift*.35;ctx.drawImage(flake,p.x-size,p.y-size,size*2,size*2);}
      ctx.globalAlpha=1;
    }else if(rainSprite){
      for(const p of drops){
        const length=15+p.speed*19+p.drift*7;
        ctx.globalAlpha=.65+p.drift*.35;
        ctx.drawImage(rainSprite,p.x,p.y,length*(thunder?.75:.1875),length);
      }
      ctx.globalAlpha=1;
    }else{
      // Batch rain paths by width instead of one stroke per drop.
      for(let group=0;group<3;group++){
        ctx.beginPath();ctx.strokeStyle=kind==='fire_rain'?EMBER[group]:fast?'rgba(207,236,247,.56)':'rgba(207,236,247,.48)';ctx.lineWidth=1.15+group*.3;
        for(const p of drops){
          if(Math.min(2,Math.floor(p.size))!==group)continue;
          const dx=fast?13+p.drift*10:4+p.drift*4,dy=15+p.speed*(fast?22:14);
          ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+dx*(cold&&kind==='storm'?.25:.42),p.y+dy*(cold&&kind==='storm'?.08:.55));
        }
        ctx.stroke();
      }
    }
    if(!reduced.matches)for(const p of drops){
      const dy=snow?4+p.speed*7:15+p.speed*(fast?22:14);
      const dx=snow?8+p.drift*12:fast?13+p.drift*10:kind==='rain'?dy*.125:4+p.drift*4;
      p.x+=dx*dt/32;p.y+=dy*dt/32;
      const margin=snow?12:30;
      if(p.x>w+margin)p.x-=w+margin*2;
      if(p.y>h+margin)p.y-=h+margin*2;
    }
  }
  if (kind === 'storm') {
    const time=reduced.matches?0:now/1000;
    const gust=1.1+.65*Math.sin(time*1.7)+.2*Math.sin(time*3.1);
    // Broad translucent dust wisps remain visible over both grass and water.
    for(let i=0;i<5;i++) {
      const x=((time*(85+i*11)+i*w*.29)%(w+400))-200;
      const y=h*(.12+i*.19)+Math.sin(time*.8+i)*35;
      ctx.save();ctx.translate(x,y);ctx.rotate(.16);ctx.scale(2.8,1);
      ctx.drawImage(dustSprite!,-85,-85,170,170);ctx.restore();
    }
    for(const [i,p] of debris.entries()) {
      if(!reduced.matches) {
        p.x+=(12+gust*14)*p.speed*dt/32;
        p.y+=(3+Math.sin(time*3+p.phase)*5)*p.speed*dt/32;
        if(p.x>w+20)p.x-=w+40;
        if(p.y>h+20)p.y-=h+40;
        if(p.y< -20)p.y+=h+40;
      }
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(time*(2+p.speed)+p.phase);
      ctx.globalAlpha=.9;
      if(cold) {
        ctx.fillStyle=i%2?'#edf9ff':'#b8d9ec';
        const size=p.size*.38;
        ctx.beginPath();ctx.moveTo(-size,0);ctx.lineTo(0,-size*.65);
        ctx.lineTo(size,0);ctx.lineTo(0,size*.45);ctx.closePath();ctx.fill();
      } else if(i%3===0) {
        ctx.fillStyle='#c3b99b';ctx.beginPath();ctx.ellipse(0,0,p.size*.6,.7,0,0,Math.PI*2);ctx.fill();
      } else {
        ctx.scale(1,.35+.65*Math.abs(Math.sin(time*4+p.phase)));
        ctx.fillStyle=i%2?'#c18a42':'#52391e';
        ctx.strokeStyle='#e7bd78';ctx.lineWidth=.8;
        ctx.beginPath();ctx.moveTo(-p.size,0);
        ctx.quadraticCurveTo(0,-p.size*1.1,p.size*1.7,0);
        ctx.quadraticCurveTo(0,p.size*.8,-p.size,0);ctx.fill();
        ctx.beginPath();ctx.moveTo(-p.size,0);ctx.lineTo(p.size*1.5,0);ctx.stroke();
      }
      ctx.restore();
    }
  }
  if(thunder){
    flash.style.opacity=String(thunderLight*.1);
    if(thunderLight>0&&bolts){
      const bh=Math.min(h*.58,390),bw=bh*96/256;
      ctx.globalAlpha=thunderLight;ctx.imageSmoothingEnabled=false;
      ctx.drawImage(bolts[flashSide?0:1],flashSide?-bw*.22:w-bw*.78,0,bw,bh);
      ctx.imageSmoothingEnabled=true;ctx.globalAlpha=1;
    }
  }

}

  const observer = new ResizeObserver(resize); observer.observe(scene);
  function restart(){scene.dataset.hidden=String(document.hidden||!visible);clearTimeout(timer);last=0;cameraKey='';if(!document.hidden&&visible)draw(performance.now())}
  document.addEventListener('visibilitychange',restart); reduced.addEventListener('change',restart);
  const intersection=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;restart()});intersection.observe(scene);
  resize();
  return () => {clearTimeout(timer);intersection.disconnect();observer.disconnect();document.removeEventListener('visibilitychange',restart);reduced.removeEventListener('change',restart)};
 },[kind,temperature,camera?.offsetRef,camera?.scaleRef,camera?.heroRef,camera?.rainPoint]);
 return <div ref={root} className="raid-weather-visuals" style={{"--weather-contour":`url(#${contourId})`} as import("react").CSSProperties} data-hero-fog={kind==='fog'&&!!camera?.heroRef} data-weather={kind} data-temperature={temperature} aria-hidden="true"><svg width="0" height="0" style={{position:"absolute"}}><defs><filter id={contourId} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".012 .017" numOctaves="2" seed="7" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="95" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="2.4"/></filter><filter id={wispsId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".007 .018" numOctaves="4" seed="12"/><feColorMatrix type="matrix" values="0 0 0 0 .88 0 0 0 0 .93 0 0 0 0 .95 3.8 0 0 0 -1.65"/><feGaussianBlur stdDeviation=".65"/></filter></defs></svg><div className="shade"/><div className="clouds"/><div className="fog-anchor"/><div className="fog-middle fog-middle-a"/><div className="fog-middle fog-middle-b"/><div className="fog fog-a"/><div className="fog fog-b"/><div className="fog-wisps-region"><svg className="fog-wisps" width="100%" height="100%"><rect width="100%" height="100%" filter={`url(#${wispsId})`}/></svg></div><canvas/>{kind==='blizzard'&&<img className="frost" src={frost} alt=""/>}<div className="storm-flash"/>{['left','right'].map(side=><svg key={side} className={`lightning lightning-${side}`} viewBox="0 0 100 600" preserveAspectRatio="none"><path className="lightning-glow"/><path className="lightning-branches"/><path className="lightning-core"/></svg>)}</div>;
}




