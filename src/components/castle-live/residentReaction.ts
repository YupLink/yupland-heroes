import { getExplorationAudioContext, getExplorationAudioOutput } from '@/lib/audio/castleMusicChannel';
import { getExplorationMusicPreference } from '@/lib/audio/castleMusicController';
import yup from './yup.mp3';
import yupyup from './yupyup.mp3';

// Prepare both small clips when the scene mounts; never reload a source on tap.
export function residentReaction(root:SVGGElement,enabled:()=>boolean=()=>true){
 let audio:HTMLAudioElement|null=null,lockedUntil=0,disposed=false;
 const players=[yup,yupyup].map(src=>{const player=new Audio();player.hidden=true;player.preload='auto';player.dataset.residentVoice='';player.src=src;player.volume=.75;root.ownerSVGElement?.parentElement?.append(player);player.load();return player;});
 let context:AudioContext|undefined;
 const sources=new Map<HTMLAudioElement,MediaElementAudioSourceNode>();
 let storage:Storage|undefined;
 try{storage=window.localStorage;}catch{/* Session preference remains available. */}
 const preference=getExplorationMusicPreference(storage);
 const syncSound=()=>{if(preference.getSnapshot()||preference.getVolume()===0)players.forEach(player=>player.pause());};
 const unsubscribe=preference.subscribe(syncSound);
 const pauses=new WeakMap<Element,number>();
 const animations=new Set<Animation>();
 const react=(node:SVGGElement)=>{
  const now=performance.now();
  if(disposed||document.hidden||Number(node.getAttribute('opacity'))<.8||now<lockedUntil)return;
  lockedUntil=now+800;pauses.set(node,now+450);
  const sprite=node.querySelector('svg');
  if(sprite&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
   const animation=sprite.animate([{transform:'translateY(0)'},{transform:'translateY(-10px)',offset:.45},{transform:'translateY(0)'}],{duration:380,easing:'ease-out'});
   animations.add(animation);animation.onfinish=()=>animations.delete(animation);
  }
  if(!enabled()||preference.getSnapshot()||preference.getVolume()===0)return;
  audio?.pause();audio=players[Math.random()<.2?1:0];audio.currentTime=0;
  // A blocked playback must never break navigation or cause a late surprise sound.
  const playing=audio;
  try{
   context??=getExplorationAudioContext();
   if(!sources.has(playing)){
    const source=context.createMediaElementSource(playing);
    source.connect(getExplorationAudioOutput(context));sources.set(playing,source);
   }
   void Promise.all([context.resume(),playing.play()]).then(()=>{
    if(disposed||document.hidden||preference.getSnapshot()||preference.getVolume()===0)playing.pause();
   }).catch(()=>{playing.pause();});
  }catch{playing.pause();}
 };
 let tap:{node:SVGGElement;id:number;x:number;y:number;moved:boolean}|null=null;
 const cancelTap=()=>{if(tap)pauses.delete(tap.node);tap=null;};
 const pointers=new Set<number>();
 const down=(event:PointerEvent)=>{
  pointers.add(event.pointerId);if(pointers.size>1){cancelTap();return;}
  if(event.button!==0)return;
  const node=(event.target as Element).closest<SVGGElement>('[data-castle-resident]');
  if(!node||!root.contains(node))return;
  tap={node,id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
  pauses.set(node,Infinity);
 };
 const move=(event:PointerEvent)=>{if(tap&&tap.id===event.pointerId&&Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>6){tap.moved=true;pauses.delete(tap.node);}};
 const up=(event:PointerEvent)=>{
  pointers.delete(event.pointerId);
  if(!tap||tap.id!==event.pointerId)return;
  const current=tap;cancelTap();
  if(event.type==='pointerup'&&!current.moved)react(current.node);
 };
 const click=(event:MouseEvent)=>{
  const node=(event.target as Element).closest<SVGGElement>('[data-castle-resident]');
  if(!node||!root.contains(node))return;
  event.preventDefault();event.stopPropagation();if(event.detail===0)react(node);
 };
 const key=(event:KeyboardEvent)=>{
  if(event.key!=='Enter'&&event.key!==' ')return;
  const node=(event.target as Element).closest<SVGGElement>('[data-castle-resident]');
  if(!node||!root.contains(node))return;
  event.preventDefault();event.stopPropagation();if(!event.repeat)react(node);
 };
 const hide=()=>{if(document.hidden){audio?.pause();cancelTap();pointers.clear();}};
 window.addEventListener('pointerdown',down,true);window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',up,true);
 root.addEventListener('click',click);root.addEventListener('keydown',key);document.addEventListener('visibilitychange',hide);
 return {
  active:(node:Element,now:number)=>(pauses.get(node)??0)>now,
  dispose:()=>{disposed=true;unsubscribe();sources.forEach(source=>source.disconnect());cancelTap();window.removeEventListener('pointerdown',down,true);window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',up,true);players.forEach(player=>{player.pause();player.removeAttribute('src');player.load();player.remove();});animations.forEach(a=>a.cancel());root.removeEventListener('click',click);root.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',hide);},
 };
}

