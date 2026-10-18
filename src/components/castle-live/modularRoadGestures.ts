import {snapRoadStart,makeRoadSegment,roadSegmentAllowed,roadSegmentDuplicate,eraseRoadPieces,type RoadSegment} from './roadSegments';
import type {SceneBuilding} from './modularCastleLayout';
export type RoadStroke={pointer:PointerEvent;start:{x:number;y:number};candidate:RoadSegment|null;valid:boolean;erased:RoadSegment[]|null;last:{x:number;y:number}};
type Ref<T>={current:T};
export function modularRoadGestures({el,pointAt,pathStroke,latestBuildings,pathModeRef,setRoadDraft,setRoadErasePreview,changeRef,setSaveError,suppressClickUntil,lang}:{
 el:HTMLElement;pointAt:(e:PointerEvent)=>{x:number;y:number};pathStroke:Ref<RoadStroke|null>;latestBuildings:Ref<SceneBuilding[]>;pathModeRef:Ref<'draw'|'erase'|'pan'>;
 setRoadDraft:(v:{segment:RoadSegment;valid:boolean}|null)=>void;setRoadErasePreview:(v:RoadSegment[]|null)=>void;
 changeRef:Ref<(v:SceneBuilding[])=>boolean|undefined>;setSaveError:(v:string)=>void;suppressClickUntil:Ref<number>;lang:string;
}){
    const paint=(event:PointerEvent)=>{const stroke=pathStroke.current;if(!stroke)return;
      if(stroke.erased){stroke.erased=eraseRoadPieces(stroke.erased,stroke.last,pointAt(event));stroke.last=pointAt(event);setRoadErasePreview(stroke.erased);return;}
      const roads=latestBuildings.current.find(b=>b.id==='gates')?.roadSegments||[],candidate=makeRoadSegment(stroke.start,pointAt(event),roads);
      stroke.candidate=candidate;stroke.valid=!!candidate&&roadSegmentAllowed(candidate,[])&&!roadSegmentDuplicate(candidate,roads)&&roads.length<160;
      setRoadDraft(candidate?{segment:candidate,valid:stroke.valid}:null);
    };
    const start=(event:PointerEvent)=>{
        const roads=latestBuildings.current.find(b=>b.id==='gates')?.roadSegments||[],point=pointAt(event);
        pathStroke.current={pointer:event,start:snapRoadStart(point,roads),candidate:null,valid:false,erased:pathModeRef.current==='erase'?eraseRoadPieces(roads,point):null,last:point};setRoadErasePreview(pathStroke.current.erased);el.setPointerCapture(event.pointerId);event.preventDefault();return;
    };
    const finish=(event:PointerEvent)=>{
        const stroke=pathStroke.current;if(!stroke)return;pathStroke.current=null;setRoadDraft(null);setRoadErasePreview(null);
        if(event.type==='pointerup'){
          const roads=latestBuildings.current.find(b=>b.id==='gates')?.roadSegments||[];
          const next=stroke.erased?stroke.erased:stroke.candidate&&stroke.valid?[...roads,stroke.candidate]:null;
          if(next)changeRef.current(latestBuildings.current.map(b=>b.id==='gates'?{...b,roadSegments:next}:b));
          else if(stroke.candidate&&!stroke.valid)setSaveError(lang==='ru'?'Участок выходит за границу или уже построен. Измени его длину.':'Section blocked or out of bounds. Adjust its length.');
        }
        suppressClickUntil.current=Date.now()+500;if(el.hasPointerCapture(event.pointerId))el.releasePointerCapture(event.pointerId);return;
    };
    return {paint,start,finish};
}
