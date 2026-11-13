import { SoundDrop } from "../castle-live/SoundDrop";
import { useEffect, useRef, useState } from "react";
import { getRaidMusic, raidMusicTrackFor } from "@/lib/audio/raidMusic";
import { useRaidMapId } from "./useEnergyMult";
import { useRaidWeather } from "./useMoveMult";
import { HIDE_GRACE_MS } from "@/lib/audio/castleMusicController";
import "./raid-music.css";

/** One owner for the raid scene, including its internal windows. */
export function RaidMusic({ active = true, suspended = false, hidden = false }: { active?: boolean; suspended?: boolean; hidden?: boolean }) {
  const [player] = useState(getRaidMusic);
  const mapId = useRaidMapId();
  const weather = useRaidWeather(active ? mapId : null);
  const slot = weather.data;
  const track = !weather.isError && slot?.mapId === mapId && slot.nextAt > Date.now()
    ? raidMusicTrackFor(slot.kind, slot.temperatureC) : 0;
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  useEffect(() => { if (active) player.selectTrack(track); }, [player, active, track]);
  useEffect(() => {
    if (!active) return;
    // A brief hidden flip of the webview must not cut the music; an overlay with its own audio pauses at once.
    const visibility = () => player.setHidden(document.hidden || suspendedRef.current, suspendedRef.current ? 0 : HIDE_GRACE_MS);
    const hide = () => player.setHidden(true);
    visibility();
    const release = player.enter();
    // Start after a permitted gesture if the browser rejected autoplay.
    const unlock = (event: Event) => {
      if (!(event.target instanceof Element && event.target.closest(".sound-drop"))) player.resume(true);
    };
    document.addEventListener("pointerup", unlock);
    document.addEventListener("keydown", unlock);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", visibility);
    return () => {
      release();
      document.removeEventListener("pointerup", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", visibility);
    };
  }, [player, active]);
  // A separate game overlay owns its audio; keep this visit and track for return.
  useEffect(() => { if (active) player.setHidden(document.hidden || suspended, suspended ? 0 : HIDE_GRACE_MS); }, [player, active, suspended]);
  if (!active) return null;
  return <SoundDrop player={player} scene="raid" hidden={hidden} />;
}

