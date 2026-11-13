import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { useRaidMapId } from "@/components/beta-raid/useEnergyMult";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { WEATHER_ANOMALY_KIND, WEATHER_KIND_NAMES, weatherAnomalyOf, weatherBandOf, weatherCoefs, type WeatherKind } from "@/lib/raid/weather";
import { RITUAL_PCT, isRitualTarget, type RitualTarget } from "@/lib/raid/weatherRitual";
import { stationLeft, stationPct, stationTemp } from "@/lib/weatherStationView";
import { castWeatherRitual } from "@/server/api/weather-station/wstation-ritual";
import type { StationWorld } from "@/server/api/weather-station/wstation-list";
import { WeatherWorldAdmin, WeatherWorldRename } from "./WeatherWorldAdmin";
import { WEATHER_STATION_WORLDS_KEY, useStationNow, useWeatherStationWorlds } from "./useWeatherStation";
import "./weather-station.css";

const kindRu: Record<WeatherKind, string> = Object.fromEntries(
  Object.entries(WEATHER_KIND_NAMES).map(([kind, names]) => [kind, names.ru]),
) as Record<WeatherKind, string>;
const kindEn: Record<WeatherKind, string> = Object.fromEntries(
  Object.entries(WEATHER_KIND_NAMES).map(([kind, names]) => [kind, names.en]),
) as Record<WeatherKind, string>;
const stationKindName = (kind: WeatherKind, temp: number, ru: boolean) =>
  kind === "rain" && temp <= -10 ? (ru ? "Снег" : "Snow") : (ru ? kindRu : kindEn)[kind];
const levelNamesRu: Record<string, string> = { clear: "Ясно", overcast: "Пасмурно", storm: "Шторм" };
const levelNamesEn: Record<string, string> = { clear: "Clear", overcast: "Overcast", storm: "Storm" };
const targetNamesRu: Record<RitualTarget, string> = {
  clear: "Ясно", overcast: "Пасмурно", storm: "Шторм", warmer: "Теплее", colder: "Холоднее",
};
const targetNamesEn: Record<RitualTarget, string> = {
  clear: "Clear", overcast: "Overcast", storm: "Storm", warmer: "Warmer", colder: "Colder",
};
const icons = ["fish", "mine", "farm", "step", "ship"] as const;
const effectNamesRu = ["Рыбалка", "Шахты", "Фермы", "Ход героя", "Ход корабля"];
const effectNamesEn = ["Fishing", "Mines", "Farms", "Hero travel", "Ship travel"];
const fmt = (n: number, ru: boolean) => n.toLocaleString(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2 });
const effectValue = (n: number, index: number, ru: boolean) => n === 1 ? (ru ? "Стандарт" : "Standard") :
  index === 0 ? (n === 0 ? (ru ? "Не клюёт" : "No bites") : `${ru ? "Шанс" : "Chance"} ×${fmt(n, ru)}`) :
  index < 3 ? (n === 0 ? (ru ? "Не работают" : "Not working") : `${ru ? "Добыча" : "Yield"} ×${fmt(n, ru)}`) : `${ru ? "Стоимость" : "Cost"} ×${fmt(n, ru)}`;
const sceneUrl = (kind: WeatherKind, temp: number) => {
  const band = weatherBandOf(temp).band;
  // Огненный дождь (жара-аномалия) — своей сцены нет, жаркий шторм.
  const shown = kind === "rain" && temp <= -10 ? "snow" :
    (band === "cool" && kind === "thunderstorm") || kind === "fire_rain" ? "storm" : kind;
  return `/weather-station/scenes/${band}/${shown}.webp`;
};

function RitualDialog({ world, mine, shamans, onClose, onSuccess }: {
  world: StationWorld; mine: RitualTarget | null; shamans: number; onClose: () => void;
  onSuccess: (target: RitualTarget) => void;
}) {
  const ru = useLang() !== "en";
  const targetNames = ru ? targetNamesRu : targetNamesEn;
  const qc = useQueryClient();
  const [selected, setSelected] = useState(false);
  const [target, setTarget] = useState<RitualTarget | null>(null);
  const [phase, setPhase] = useState<"choose" | "casting" | "success">(mine ? "success" : "choose");
  const [frame, setFrame] = useState(0);
  const [opId, setOpId] = useState(newOpId);
  const closeRef = useRef<HTMLButtonElement>(null);
  const cast = useMutation({
    mutationFn: (picked: RitualTarget) => castWeatherRitual({ data: { mapId: world.mapId, target: picked, opId } }),
    onSuccess: (_result, picked) => {
      setOpId(newOpId());
      onSuccess(picked);
      setPhase("casting");
      void qc.invalidateQueries({ queryKey: WEATHER_STATION_WORLDS_KEY });
    },
  });
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  useEffect(() => {
    if (phase !== "casting") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: number[] = [];
    if (!reduced) {
      timers.push(window.setTimeout(() => setFrame(1), 650));
      timers.push(window.setTimeout(() => setFrame(2), 1450));
    }
    timers.push(window.setTimeout(() => setPhase("success"), reduced ? 100 : 2350));
    return () => timers.forEach(window.clearTimeout);
  }, [phase]);
  const actualTarget = mine ?? target;
  return <div className="weather-station__dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="weather-ritual-title" className="weather-station__shaman-dialog">
      <div className="weather-station__dialog-head">
        <div><h2 id="weather-ritual-title">{phase === "choose" ? (ru ? "Выбери шамана" : "Choose a shaman") : phase === "casting" ? (ru ? "Шаман проводит ритуал" : "Shaman performs the ritual") : (ru ? "Ритуал завершён" : "Ritual complete")}</h2><p>{ru ? "Мир" : "World"}: {world.name} · {ru ? "ближайшая смена" : "next change"}</p></div>
        <button type="button" ref={closeRef} className="weather-station__shaman-close" aria-label={ru ? "Закрыть" : "Close"} onClick={onClose}>×</button>
      </div>
      {phase === "casting" ? <div className="weather-station__ritual" role="status" aria-live="polite"><div className="weather-station__ritual-scene" data-frame={frame} aria-hidden="true" /><p>{ru ? "Шаман проводит ритуал…" : "The shaman performs the ritual…"}</p></div> :
        phase === "success" ? <div className="weather-station__ritual-success" role="status" aria-live="polite"><div className="weather-station__ritual-scene" data-frame="2" aria-hidden="true" /><strong>{ru ? "Шанс повышен" : "Chance increased"}</strong><p>{ru ? "Шанс исхода" : "Chance of"} «{actualTarget ? targetNames[actualTarget] : (ru ? "выбранный исход" : "selected outcome")}» {ru ? "повышен на" : "increased by"} {RITUAL_PCT} {ru ? "п. п. для ближайшей смены погоды этого мира." : "percentage points for this world’s next weather change."}</p><button type="button" className="weather-station__shaman-confirm" onClick={onClose}>{ru ? "Продолжить" : "Continue"}</button></div> :
        shamans <= 0 ? <p className="weather-station__shaman-empty">{ru ? "В хижине нет шаманов." : "There are no shamans in the hut."}</p> : <>
          <button type="button" className="weather-station__shaman-option" aria-pressed={selected} onClick={() => setSelected(!selected)}><img src="/raid/shaman.webp" alt="" /><span><strong>{ru ? "Шаман" : "Shaman"}</strong><small>{ru ? "В хижине" : "In the hut"}: {shamans}</small><span className="weather-station__shaman-bonus">+{RITUAL_PCT} {ru ? "п. п. к шансу выбранного исхода" : "percentage points to the chosen outcome"}</span></span><span className="weather-station__shaman-check" aria-hidden="true">{selected ? "✓" : ""}</span></button>
          {selected && <><p className="weather-station__target-label">{ru ? "Выбери погоду или изменение температуры" : "Choose weather or a temperature change"}</p><div className="weather-station__targets" role="radiogroup" aria-label={ru ? "Исход ритуала" : "Ritual outcome"}>{(world.targets ?? []).map(item => <button type="button" key={item} role="radio" aria-checked={item === target} onClick={() => setTarget(item)}>{targetNames[item]}</button>)}</div>{(world.targets ?? []).length === 0 && <p className="weather-station__ritual-error">{ru ? "Сейчас нет доступных исходов для ритуала." : "No ritual outcomes are available now."}</p>}<button type="button" className="weather-station__shaman-confirm" disabled={!target || cast.isPending} onClick={() => target && cast.mutate(target)}>{cast.isPending ? (ru ? "Проводим ритуал…" : "Performing ritual…") : (ru ? "Провести ритуал" : "Perform ritual")}</button>{cast.isError && <p role="alert" className="weather-station__ritual-error">{humanError(cast.error)}</p>}</>}
        </>}
    </section>
  </div>;
}

export function WeatherStationModal({ onClose }: { onClose: () => void; icon: string }) {
  const ru = useLang() !== "en";
  const targetNames = ru ? targetNamesRu : targetNamesEn;
  const levelNames = ru ? levelNamesRu : levelNamesEn;
  const effectNames = ru ? effectNamesRu : effectNamesEn;
  const q = useWeatherStationWorlds();
  const currentMapId = useRaidMapId();
  const worlds = q.data?.worlds ?? [];
  const currentWorldIndex = worlds.findIndex(item => item.mapId === currentMapId);
  const currentWorld = currentWorldIndex < 0 ? null : worlds[currentWorldIndex];
  const worldOrder = worlds.map((_, index) => index);
  if (currentWorldIndex > 0) worldOrder.unshift(...worldOrder.splice(currentWorldIndex, 1));
  const now = useStationNow(q.data, worlds.length > 0);
  const [worldId, setWorldId] = useState<string | null>(null);
  const [worldOpen, setWorldOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [ritualOpen, setRitualOpen] = useState(false);
  const [completed, setCompleted] = useState<Record<string, RitualTarget>>({});
  const [renaming, setRenaming] = useState(false);
  const worldRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const world = worlds.find(item => item.mapId === worldId) ?? currentWorld ?? worlds[0];
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (ritualOpen) setRitualOpen(false);
      else if (worldOpen) { setWorldOpen(false); triggerRef.current?.focus(); }
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ritualOpen, worldOpen, onClose]);
  useEffect(() => {
    if (!worldOpen) return;
    const outside = (event: PointerEvent) => { if (!worldRef.current?.contains(event.target as Node)) setWorldOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [worldOpen]);
  useEffect(() => { if (worldOpen) document.getElementById(`station-world-${highlight}`)?.focus(); }, [worldOpen, highlight]);
  const chooseWorld = (index: number) => { setWorldId(worlds[index].mapId); setWorldOpen(false); triggerRef.current?.focus(); };
  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setHighlight(index => worldOrder[(Math.max(0, worldOrder.indexOf(index)) + (event.key === "ArrowDown" ? 1 : worldOrder.length - 1)) % worldOrder.length]); }
    else if (event.key === "Home" || event.key === "End") { event.preventDefault(); setHighlight(event.key === "Home" ? worldOrder[0] : worldOrder[worldOrder.length - 1]); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseWorld(highlight); }
    else if (event.key === "Escape") { event.preventDefault(); setWorldOpen(false); triggerRef.current?.focus(); }
  };
  const mineValue = q.data?.mine?.[world?.mapId ?? ""];
  const ritualKey = world ? `${world.mapId}:${world.nextAt}` : "";
  const mine = isRitualTarget(mineValue) ? mineValue : completed[ritualKey] ?? null;
  const coefs = world ? weatherCoefs(world.temperatureC, world.kind) : null;
  const factors = coefs ? [coefs.fish, coefs.mine, coefs.farm, coefs.step, coefs.ship] : [];
  const levels = world?.levels ?? [];
  const temps = world?.temps ?? [];
  const likelyLevel = levels.length ? levels.reduce((best, item) => item.p > best.p ? item : best) : null;
  const likelyTemp = temps.length ? temps.reduce((best, item) => item.p > best.p ? item : best) : null;
  const likelyAnomaly = likelyTemp ? weatherAnomalyOf(likelyTemp.value) : null;
  const likelyKind: WeatherKind | null = likelyAnomaly ? WEATHER_ANOMALY_KIND[likelyAnomaly] : likelyLevel?.value === "clear" ? "clear" : likelyLevel?.value === "overcast" ? "overcast" : likelyLevel?.value === "storm" ? (likelyTemp && likelyTemp.value < 0 ? "blizzard" : "storm") : null;
  const forecastArt = likelyKind && likelyTemp ? sceneUrl(likelyKind, likelyTemp.value) : null;
  return <div className="weather-station" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <main className="weather-station__shell" role="dialog" aria-modal="true" aria-labelledby="weather-station-title">
      <header className="weather-station__header"><button type="button" className="weather-station__back" onClick={onClose}>‹ <span>{ru ? "Замок" : "Castle"}</span></button><h1 id="weather-station-title">{ru ? "Метеостанция" : "Weather Station"}</h1>{world && <button type="button" className="weather-station__shaman-call" onClick={() => setRitualOpen(true)} aria-label={ru ? "Призвать шамана" : "Call a shaman"}><img src="/weather-station/shaman-tab.webp" alt="" /></button>}</header>
      <div className="weather-station__body">
        {q.isPending ? <p role="status" className="weather-station__state">{ru ? "Загружаем погоду…" : "Loading weather…"}</p> : q.isError && !q.data ? <div className="weather-station__state"><p role="alert">{ru ? "Не удалось получить погоду." : "Could not load weather."}</p><button type="button" onClick={() => void q.refetch()}>{ru ? "Повторить" : "Retry"}</button></div> : !world ? <p className="weather-station__state">{ru ? "Нет доступных миров с погодой." : "No worlds with weather are available."}</p> : <>
          <div className="weather-station__world" ref={worldRef} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setWorldOpen(false); }}>
            <span className="weather-station__current-world">{currentWorld ? <><strong>{currentWorld.name}</strong><small>{ru ? "Вы здесь" : "You are here"}</small></> : (ru ? "Мир" : "World")}</span>
            <div className="weather-station__world-select">
              <button type="button" className="weather-station__world-trigger" ref={triggerRef} aria-haspopup="listbox" aria-expanded={worldOpen} aria-label={ru ? `Показан ${world.name}. Выбрать мир для просмотра погоды` : `Showing ${world.name}. Choose a world to view its weather`} onClick={() => { setHighlight(worlds.findIndex(item => item.mapId === world.mapId)); setWorldOpen(!worldOpen); }}>
                <span>{world.name}</span>
              </button>
              <svg viewBox="0 0 16 10" aria-hidden="true"><path d="m1 1 7 7 7-7" /></svg>
              {worldOpen && <div className="weather-station__world-menu" role="listbox" aria-label={ru ? "Мир для просмотра погоды" : "World to view weather"} onKeyDown={onMenuKey}>
                {worldOrder.map(index => <button type="button" role="option" id={`station-world-${index}`} key={worlds[index].mapId} tabIndex={index === highlight ? 0 : -1} aria-selected={worlds[index].mapId === world.mapId} data-highlighted={index === highlight} onMouseEnter={() => setHighlight(index)} onClick={() => chooseWorld(index)}><span>{worlds[index].name}</span>{index === currentWorldIndex && <small>{ru ? "Вы здесь" : "You are here"}</small>}</button>)}
              </div>}
            </div>
          </div>
          {q.data?.admin && <div className="weather-station__admin">{renaming && <WeatherWorldRename w={world} onDone={() => setRenaming(false)} />}<WeatherWorldAdmin w={world} onRename={setRenaming} /></div>}
          <section className="weather-station__card" aria-label={ru ? "Погода сейчас" : "Current weather"}><span className="weather-station__card-art" style={{ backgroundImage: `url(${sceneUrl(world.kind, world.temperatureC)})` }} aria-hidden="true" /><span className="weather-station__card-content"><span className="weather-station__card-label">{ru ? "Сейчас" : "Now"}</span><span className="weather-station__card-main"><strong>{stationKindName(world.kind, world.temperatureC, ru)}</strong><b>{stationTemp(world.temperatureC)}</b></span><span className="weather-station__card-time">{ru ? "Смена через" : "Changes in"} {stationLeft(world.nextAt - now)}</span></span></section>
          <section className="weather-station__next" aria-labelledby="weather-next-title"><div className="weather-station__next-heading"><h2 id="weather-next-title">{ru ? "Следующая смена" : "Next change"}</h2><span>{ru ? "Через" : "In"} {stationLeft(world.nextAt - now)}</span></div><div className="weather-station__next-weather">{forecastArt && <span className="weather-station__card-art" style={{ backgroundImage: `url(${forecastArt})` }} aria-hidden="true" />}<div className="weather-station__next-weather-content"><h3>{ru ? "Погода" : "Weather"}</h3><div className="weather-station__next-odds">{levels.map(item => <div key={item.value} className="weather-station__next-odd" data-leading={item.value === likelyLevel?.value}><span>{levelNames[item.value] ?? item.value}</span><b>{stationPct(item.p)}%</b></div>)}{levels.length === 0 && <span className="weather-station__next-empty">{ru ? "Нет прогноза" : "No forecast"}</span>}</div></div></div><div className="weather-station__next-temps"><h3>{ru ? "Температура" : "Temperature"}</h3><div className="weather-station__next-temp-list">{temps.map(item => <div key={item.value} data-leading={item.value === likelyTemp?.value}><span>{stationTemp(item.value)}</span><b>{stationPct(item.p)}%</b></div>)}{temps.length === 0 && <span className="weather-station__next-empty">{ru ? "Нет прогноза" : "No forecast"}</span>}</div></div></section>
          <section className="weather-station__effects"><h2>{ru ? "Влияние погоды" : "Weather effects"}</h2><ul>{factors.map((factor, index) => <li key={icons[index]}><span className="weather-station__effect-icon" data-icon={index} aria-hidden="true" /><span>{effectNames[index]}</span><strong data-tone={factor === 1 ? "neutral" : index > 2 ? "bad" : factor < 1 ? "bad" : "active"}>{effectValue(factor, index, ru)}</strong></li>)}</ul></section>
          {mine && <p className="weather-station__shaman-status" role="status">{ru ? "Ритуал проведён" : "Ritual complete"}: +{RITUAL_PCT} {ru ? "п. п. к шансу исхода" : "percentage points to"} «{targetNames[mine]}» {ru ? "для ближайшей смены" : "for the next change"}.</p>}
        </>}
      </div>
      {ritualOpen && world && <RitualDialog key={world.mapId} world={world} mine={mine} shamans={q.data?.shamans ?? 0} onClose={() => setRitualOpen(false)} onSuccess={picked => setCompleted(previous => ({ ...previous, [ritualKey]: picked }))} />}
    </main>
  </div>;
}
