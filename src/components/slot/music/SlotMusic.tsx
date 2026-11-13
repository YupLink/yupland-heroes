import { getExplorationAudioContext } from "@/lib/audio/castleMusicChannel";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Volume2, VolumeX } from "lucide-react";
import { musicForPhase, SlotMusicPlayer, type MusicStatus } from "./musicPlayer";
import { soundForChange, type SoundState } from "./slotSounds";
import { subscribeReelLandings } from "./reelSounds";
import "./music.css";

const PREFERENCE = "yuplink.slot.music-muted";

export function SlotMusic({ state, ru, transition = "playing", onReady }: { state: SoundState & { spinId: number }; ru: boolean; transition?: "entering" | "playing" | "leaving"; onReady?: (ready: boolean) => void }) {
  const phase = state.phase;
  const transitionRef = useRef(transition);
  transitionRef.current = transition;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const previous = useRef<SoundState | null>(null);
  const player = useRef<SlotMusicPlayer | null>(null);
  const muted = useRef(false);
  const [status, setStatus] = useState<MusicStatus>("ready");
  const [target, setTarget] = useState<Element | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const audio = new SlotMusicPlayer(value => {
      setStatus(value);
      if (["playing", "off", "effects", "error"].includes(value)) readyRef.current?.(true);
    }, getExplorationAudioContext());
    audio.setTransitionVisible(transitionRef.current === "playing", 0);
    player.current = audio;
    const unsubscribe = subscribeReelLandings(event => audio.landReel(event));
    try { muted.current = localStorage.getItem(PREFERENCE) === "1"; } catch { /* Private browsing. */ }
    audio.setEnabled(!muted.current);
    audio.setTrack(musicForPhase(phaseRef.current));
    audio.setVisible(!document.hidden);
    audio.activate();
    if (getExplorationAudioContext().state !== "running") readyRef.current?.(true);
    const visibility = () => audio.setVisible(!document.hidden);
    const gesture = (event: Event) => {
      const node = event.target instanceof Element ? event.target : null;
      if (!node?.closest(".casino-ui, .casino-transition") || node.closest(".slot-music-toggle")) return;
      if (event instanceof KeyboardEvent && !["Enter", " "].includes(event.key)) return;
      audio.activate();
    };
    // A native dialog occupies the top layer. Keep mute reachable inside it.
    const host = () => {
      const dialogs = document.querySelectorAll(".casino-ui dialog[open]");
      setTarget(dialogs.length ? dialogs[dialogs.length - 1] :
        document.querySelector(".casino-ui .scene:not([hidden])") ||
        document.querySelector(".casino-ui .cabinet-stage"));
    };
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type === "attributes" ||
        [...record.addedNodes, ...record.removedNodes].some(node =>
          node instanceof Element && (node.matches("dialog, .casino-ui, .scene") || node.querySelector("dialog, .casino-ui, .scene"))))) host();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
    host();
    document.addEventListener("click", gesture, true);
    document.addEventListener("keydown", gesture, true);
    document.addEventListener("visibilitychange", visibility);
    const preference = (event: StorageEvent) => {
      if (event.key !== PREFERENCE) return;
      muted.current = event.newValue === "1";
      audio.setEnabled(!muted.current);
    };
    window.addEventListener("storage", preference);
    return () => {
      unsubscribe();
      observer.disconnect();
      document.removeEventListener("click", gesture, true);
      document.removeEventListener("keydown", gesture, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("storage", preference);
      audio.dispose();
      player.current = null;
    };
  }, []);

  useEffect(() => { player.current?.setTransitionVisible(transition === "playing", transition === "leaving" ? .7 : .75); }, [transition]);
  useEffect(() => { player.current?.setTrack(musicForPhase(phase)); }, [phase]);
  useEffect(() => {
    player.current?.setReelSpin(phase === "spinning" ? state.spinId : null);
  }, [phase, state.spinId]);
  useEffect(() => {
    const sound = soundForChange(previous.current, state);
    previous.current = state;
    if (sound) void player.current?.playEffect(sound);
  }, [state]);
  const on = status === "playing" || status === "loading" || status === "effects";
  const label = on ? (ru ? "Выключить звук" : "Mute sound")
    : status === "error" ? (ru ? "Повторить включение звука" : "Retry sound")
    : (ru ? "Включить звук" : "Enable sound");
  const toggle = () => {
    muted.current = on;
    try { localStorage.setItem(PREFERENCE, on ? "1" : "0"); } catch { /* Optional preference. */ }
    player.current?.setEnabled(!on);
    if (!on) player.current?.activate();
  };
  return target ? createPortal(
    <button type="button" className="slot-music-toggle" onClick={toggle}
      data-scene={["bonus", "super", "risk", "bonus-end"].includes(phase)}
      aria-label={label} title={label} aria-pressed={on} aria-busy={status === "loading"}>
      {on ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
    </button>, target,
  ) : null;
}


