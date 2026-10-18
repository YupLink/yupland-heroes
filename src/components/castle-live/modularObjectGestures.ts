type Pointer = {pointerId:number;clientX:number;clientY:number};
type ObjectState = {id:string;x:number;y:number;size:number};
/** An object owns the whole pointer sequence; background gestures never join it. */
export function modularObjectGestures(api:{get:(id:string)=>ObjectState|undefined;scale:()=>number;begin:()=>void;update:(id:string,value:{x:number;y:number;size:number})=>void;finish:(cancelled:boolean)=>void}){
 const pointers=new Map<number,Pointer>();
 let id:string|null=null;
 let base:ObjectState|null=null;
 let origin={x:0,y:0,distance:0};
 const rebase=()=>{if(!id)return;base=api.get(id)||null;const [a,b]=[...pointers.values()];if(a)origin={x:a.clientX,y:a.clientY,distance:b?Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY):0};};
 return {
  down(point:Pointer,target?:string){
   if(!pointers.size){if(!target||!api.get(target))return false;id=target;api.begin();}
   pointers.set(point.pointerId,{pointerId:point.pointerId,clientX:point.clientX,clientY:point.clientY});rebase();return true;
  },
  move(point:Pointer){
   if(!id||!base||!pointers.has(point.pointerId))return false;
   pointers.set(point.pointerId,{pointerId:point.pointerId,clientX:point.clientX,clientY:point.clientY});const [a,b]=[...pointers.values()];
   if(b){const distance=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);if(origin.distance>2)api.update(id,{x:base.x,y:base.y,size:base.size*distance/origin.distance});else rebase();}
   else api.update(id,{x:base.x+(a.clientX-origin.x)/api.scale(),y:base.y+(a.clientY-origin.y)/api.scale(),size:base.size});
   return true;
  },
  up(pointerId:number,cancelled=false){if(!pointers.delete(pointerId))return false;if(cancelled){pointers.clear();api.finish(true);id=null;base=null;return true;}if(!pointers.size){api.finish(cancelled);id=null;base=null;}else rebase();return true;},
  reset(){if(id)api.finish(true);pointers.clear();id=null;base=null;},
  active:()=>id!==null,
 };
}
