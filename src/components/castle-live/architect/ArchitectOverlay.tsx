import {useEffect,useState} from 'react';
import {useBuildingWindowAudio} from '@/hooks/useBuildingWindowAudio';
import {onArchitectToggle,closeArchitect} from '@/lib/architectBus';
import {MineBuildingsWindow} from '../mine-buildings/MineBuildingsWindow';
export function ArchitectOverlay(){
 const [open,setOpen]=useState(false);useBuildingWindowAudio(open);
 useEffect(()=>onArchitectToggle(setOpen),[]);
 return open?<MineBuildingsWindow entry="architect" onClose={closeArchitect}/>:null;
}
