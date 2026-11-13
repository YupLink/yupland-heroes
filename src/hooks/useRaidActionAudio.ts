import { singleToolStrikeBuffer } from "@/lib/audio/toolStrikeBuffer";
import { useCallback, useEffect, useRef } from "react";
import axeUrl from "@/assets/raid-audio/axe.mp3";
import pickUrl from "@/assets/raid-audio/pick.mp3";
import fistUrl from "@/assets/raid-audio/fist.mp3";
import castUrl from "@/assets/raid-audio/cast.mp3";
import { getExplorationAudioContext, getExplorationAudioOutput } from "@/lib/audio/castleMusicChannel";
import { getRaidMusic } from "@/lib/audio/raidMusic";
import { actionSoundForTool, RaidActionPlayer, type ActionSound } from "@/lib/audio/raidActionPlayer";

const buffers: Partial<Record<ActionSound, Promise<AudioBuffer>>> = {};
export function useRaidCueAudio() {
  const player = useRef<RaidActionPlayer | null>(null);
  useEffect(() => {
    const music = getRaidMusic();
    const allowed = () => {
      const state = music.getSnapshot();
      return !document.hidden && state.playing && !state.muted && state.volume > 0;
    };
    const load = (kind: ActionSound) => buffers[kind] ??= fetch({ axe: axeUrl, pick: pickUrl, cast: castUrl, fist: fistUrl }[kind])
      .then(r => { if (!r.ok) throw new Error("Audio unavailable"); return r.arrayBuffer(); })
      .then(data => getExplorationAudioContext().decodeAudioData(data))
      .then(buffer => singleToolStrikeBuffer(buffer, kind, getExplorationAudioContext()))
      .catch(error => { delete buffers[kind]; throw error; });
    const instance = new RaidActionPlayer(load, buffer => {
      const context = getExplorationAudioContext();
      if (context.state !== "running") return () => {};
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(getExplorationAudioOutput(context));
      let ended = false;
      source.onended = () => { ended = true; source.disconnect(); };
      source.start();
      return () => { if (!ended) { ended = true; source.stop(); source.disconnect(); } };
    }, allowed);
    player.current = instance;
    const update = () => {
      if (!allowed()) instance.stop();
      else for (const kind of ["axe", "pick", "cast", "fist"] as const) void load(kind).catch(() => {});
    };
    const hide = () => instance.stop();
    const release = music.subscribe(update);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pagehide", hide);
    update();
    return () => {
      release(); instance.dispose(); player.current = null;
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pagehide", hide);
    };
  }, []);
  return useCallback((kind: ActionSound | null) => {
    if (kind) player.current?.play(kind);
    else player.current?.stop();
  }, []);
}

export function useRaidActionAudio() {
  const play = useRaidCueAudio();
  return useCallback((tool: string | null | undefined, hand = false) => {
    const kind = actionSoundForTool(tool, hand);
    if (kind) play(kind);
  }, [play]);
}

