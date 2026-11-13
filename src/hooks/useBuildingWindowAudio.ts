import { useEffect, useRef } from 'react';
import { playBuildingAudio, warmBuildingAudio } from '@/lib/audio/buildingWindowAudio';

/** A cue belongs to the building window, not its tabs, requests or rerenders. */
export function useBuildingWindowAudio(open: boolean) {
  const previous = useRef(false);
  useEffect(() => { void warmBuildingAudio().catch(() => {}); }, []);
  useEffect(() => {
    if (previous.current === open) return;
    previous.current = open;
    playBuildingAudio(open);
  }, [open]);
}
