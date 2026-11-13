import { useSyncExternalStore, type CSSProperties } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useLang } from "@/lib/i18n";
import type { CastleMusicController } from "@/lib/audio/castleMusicController";
import "./scene-music-controls.css";

/** The same sound switch and volume in every exploration scene. */
export function SceneMusicControls({ player, hidden = false, scene }: {
  player: CastleMusicController; hidden?: boolean; scene: "castle" | "raid";
}) {
  const ru = useLang() === "ru";
  const state = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
  const off = state.muted || state.volume === 0;
  const label = off ? (ru ? "Включить звук" : "Enable sound") : (ru ? "Выключить звук" : "Mute sound");
  const percent = Math.round(state.volume * 100);
  return <div className="scene-music-controls" hidden={hidden} role="group" aria-label={ru ? "Звук игры" : "Game sound"}
    data-music-scene={scene} data-music-playing={state.playing} data-music-track={state.track + 1}>
    <button type="button" className="scene-music-controls__toggle" aria-label={label} title={label} aria-pressed={!off} onClick={player.toggle}>
      {off ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
    </button>
    <div className="scene-music-controls__level">
      <input type="range" min="0" max="100" step="1" value={percent} aria-label={ru ? "Громкость" : "Volume"}
        aria-valuetext={`${percent}%`} style={{ "--music-level": `${percent}%` } as CSSProperties}
        onInput={event => player.setVolume(Number(event.currentTarget.value) / 100)}
        onChange={event => player.setVolume(Number(event.target.value) / 100)} />
      <span aria-hidden="true">{percent}%</span>
    </div>
  </div>;
}

