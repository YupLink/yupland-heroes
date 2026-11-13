import anomalyHeat from "@/assets/raid-music/anomaly-heat.mp3";
import anomalyCold from "@/assets/raid-music/anomaly-cold.mp3";
import coolClear from "@/assets/raid-music/cool-clear.mp3";
import coolOvercast from "@/assets/raid-music/cool-overcast.mp3";
import coolFog from "@/assets/raid-music/cool-fog.mp3";
import coolRain from "@/assets/raid-music/cool-rain.mp3";
import coolStorm from "@/assets/raid-music/cool-storm.mp3";
import coolThunder from "@/assets/raid-music/cool-thunder.mp3";
import hotClear from "@/assets/raid-music/hot-clear.mp3";
import hotOvercast from "@/assets/raid-music/hot-overcast.mp3";
import hotFog from "@/assets/raid-music/hot-fog.mp3";
import hotRain from "@/assets/raid-music/hot-rain.mp3";
import hotStorm from "@/assets/raid-music/hot-storm.mp3";
import hotThunder from "@/assets/raid-music/hot-thunder.mp3";
import hotRainEarth from "@/assets/raid-music/hot-rain-earth.wav";
import coolStormWind from "@/assets/raid-music/cool-storm-wind.mp3";
import hotStormSand from "@/assets/raid-music/hot-storm-sand.wav";
import coldClear from "@/assets/raid-music/cold-clear.mp3";
import coldOvercast from "@/assets/raid-music/cold-overcast.mp3";
import coldFog from "@/assets/raid-music/cold-fog.mp3";
import coldRain from "@/assets/raid-music/cold-rain.mp3";
import coldStorm from "@/assets/raid-music/cold-storm.mp3";
import coldBlizzard from "@/assets/raid-music/cold-blizzard.mp3";
import veryColdClear from "@/assets/raid-music/very-cold-clear.mp3";
import veryColdOvercast from "@/assets/raid-music/very-cold-overcast.mp3";
import veryColdFog from "@/assets/raid-music/very-cold-fog.mp3";
import veryColdRain from "@/assets/raid-music/very-cold-rain.mp3";
import veryColdStorm from "@/assets/raid-music/very-cold-storm.mp3";
import veryColdBlizzard from "@/assets/raid-music/very-cold-blizzard.mp3";
import coldRainGlass from "@/assets/raid-music/cold-rain-glass.wav";
import exploration from "@/assets/raid-music/raid-exploration.mp3";
import warmClear from "@/assets/raid-music/warm-clear.mp3";
import warmOvercastRain from "@/assets/raid-music/warm-overcast-rain.mp3";
import warmFog from "@/assets/raid-music/warm-fog.mp3";
import warmRainLeaves from "@/assets/raid-music/warm-rain-leaves.mp3";
import warmStorm from "@/assets/raid-music/warm-storm.mp3";
import warmThunderMusic from "@/assets/raid-music/warm-thunder-music.mp3";
import warmThunder from "@/assets/raid-music/warm-thunder.mp3";
import { weatherAnomalyOf, weatherBandOf, type WeatherKind } from "@/lib/raid/weather";
import { CastleMusicController, getExplorationMusicPreference, type MusicChannel } from "./castleMusicController";
import { createCastleMusicChannel, getExplorationAudioContext } from "./castleMusicChannel";

type Track = { music: string; effect?: string; effectVolume?: number };
const tracks: readonly Track[] = [
  { music: exploration },
  { music: warmClear },
  { music: warmOvercastRain },
  { music: warmFog },
  { music: warmOvercastRain, effect: warmRainLeaves, effectVolume: .45 },
  { music: warmStorm },
  { music: warmThunderMusic, effect: warmThunder, effectVolume: .9 },
  { music: coldClear },
  { music: coldOvercast },
  { music: coldFog },
  { music: coldRain, effect: coldRainGlass, effectVolume: .8 },
  { music: coldStorm },
  { music: coldBlizzard },
  { music: veryColdClear },
  { music: veryColdOvercast },
  { music: veryColdFog },
  { music: veryColdRain, effect: coldRainGlass, effectVolume: .48 },
  { music: veryColdStorm },
  { music: veryColdBlizzard },
  { music: coolClear },
  { music: coolOvercast },
  { music: coolFog },
  { music: coolRain, effect: coldRainGlass, effectVolume: .8 },
  { music: coolStorm, effect: coolStormWind, effectVolume: .75 },
  { music: coolThunder, effect: warmThunder, effectVolume: .9 },
  { music: hotClear },
  { music: hotOvercast },
  { music: hotFog },
  { music: hotRain, effect: hotRainEarth, effectVolume: .55 },
  { music: hotStorm, effect: hotStormSand, effectVolume: .75 },
  { music: hotThunder, effect: warmThunder, effectVolume: .9 },
  { music: anomalyHeat },
  { music: anomalyCold },
];

/** Approved weather tracks; unknown weather retains the original raid theme. */
export function raidMusicTrackFor(kind: WeatherKind, temperatureC: number): number {
  if (!Number.isFinite(temperatureC)) return 0;
  const anomaly = weatherAnomalyOf(temperatureC);
  if (anomaly === "heat") return 31;
  if (anomaly === "cold") return 32;
  const band = weatherBandOf(temperatureC).band;
  if (band === "cold" || band === "very_cold") {
    const offset = band === "cold" ? 7 : 13;
    switch (kind) {
      case "clear": return offset;
      case "overcast": return offset + 1;
      case "fog": return offset + 2;
      case "rain": return offset + 3;
      case "storm": return offset + 4;
      case "blizzard": return offset + 5;
      // Снег (09.11): до мелодий Кайлани без звука дождя — трек пасмурной погоды того же холода.
      case "snow": return offset + 1;
      default: return 0;
    }
  }
  if (band === "cool" || band === "hot") {
    const offset = band === "cool" ? 19 : 25;
    switch (kind) {
      case "clear": return offset;
      case "overcast": return offset + 1;
      case "fog": return offset + 2;
      case "rain": return offset + 3;
      case "storm": return offset + 4;
      // Огненный дождь (жара-аномалия) — трек жаркого шторма.
      case "fire_rain": return offset + 4;
      case "thunderstorm": return offset + 5;
      default: return 0;
    }
  }
  if (band !== "warm") return 0;
  switch (kind) {
    case "clear": return 1;
    case "overcast": return 2;
    case "fog": return 3;
    case "rain": return 4;
    case "storm": return 5;
    case "thunderstorm": return 6;
    default: return 0;
  }
}

function createRaidChannel(index: number): MusicChannel {
  const spec = tracks[index] ?? tracks[0];
  const context = getExplorationAudioContext();
  const music = createCastleMusicChannel(context, spec.music);
  if (!spec.effect) return music;
  const effect = createCastleMusicChannel(context, spec.effect, spec.effectVolume);
  return {
    unlock() { music.unlock(); effect.unlock(); },
    async play(fadeSeconds) {
      // Start both while the same user gesture is still active on mobile browsers.
      const main = music.play(fadeSeconds);
      void effect.play(fadeSeconds).catch((error) => {
        console.error("Raid weather audio layer failed", error);
      });
      try { await main; }
      catch (error) { effect.pause(0); throw error; }
    },
    pause(seconds) { music.pause(seconds); effect.pause(seconds); },
    dispose(seconds) { music.dispose(seconds); effect.dispose(seconds); },
  };
}

let player: CastleMusicController | undefined;
export function getRaidMusic() {
  if (!player) {
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Private mode still plays. */ }
    player = new CastleMusicController(createRaidChannel, storage,
      { storagePrefix: "yupland.raid-music", trackCount: 1, preference: getExplorationMusicPreference(storage) });
  }
  return player;
}



