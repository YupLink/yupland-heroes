import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import atlas from './weather-atlas-hud.webp';
import type { WeatherCoefs, WeatherKind } from '@/lib/raid/weather';
import wheat from './wheat-hud.webp';
import hero from './hero-hud.webp';
import ship from './ship-hud.webp';
import fish from './fish-hud.webp';
import pickaxe from './pickaxe-hud.webp';
import './weather.css';

// Controlled display. The caller supplies real server data; this component never writes game state.
// worldName — подпись мира в заголовке: «Мидгард · Ясно · −20°C» (Ярослав, 29.10.2026).
export type RaidWeatherPanelProps = { ru: boolean; degrees: number; kind: WeatherKind; coefs: WeatherCoefs; effectsOn: boolean; isAdmin: boolean; worldName?: string | null };
// Order = cells of weather-atlas-hud.webp (fire_rain — heat anomaly only, 05.11.2026).
const WEATHER_KINDS: WeatherKind[] = ['clear','overcast','rain','fog','storm','thunderstorm','blizzard','fire_rain'];
// Missing/unknown data must not become a fake weather reading.
export function RaidWeatherPanel(props: RaidWeatherPanelProps) {
  if (!Number.isFinite(props.degrees) || props.degrees < -60 || props.degrees > 60 || !(WEATHER_KINDS.includes(props.kind) || props.kind === 'snow') || ![props.coefs.fish, props.coefs.mine, props.coefs.farm, props.coefs.step, props.coefs.ship].every(n => Number.isFinite(n) && n >= 0)) return null;
  return <WeatherPanelBody {...props} />;
}
function WeatherPanelBody({ ru, degrees, kind, coefs, effectsOn, isAdmin, worldName }: RaidWeatherPanelProps) {
  // Снег (09.11) — своей клетки в атласе пока нет: значок метели, подпись «Снег».
  const weatherIndex = WEATHER_KINDS.indexOf(kind === 'snow' ? 'blizzard' : kind);
  const weatherNames = ru ? ['Ясно','Пасмурно','Дождь','Туман','Шторм','Гроза','Метель','Огненный дождь'] : ['Clear','Overcast','Rain','Fog','Storm','Thunderstorm','Blizzard','Fire rain'];
  const degreeText = (degrees > 0 ? '+' : degrees < 0 ? '−' : '') + Math.abs(degrees) + '°C';
  const detailsId = useId();
  const titleId = useId();
  const [open, setOpen] = useState(true);
  const shape = open ? 'M0 0 H46 C62 0 72 8 72 24 C72 40 62 48 46 48 H0 Z' : 'M44 0 C44 8 72 5 72 24 C72 43 44 40 44 48 L0 48 L0 0 Z';
  const [selected, setSelected] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const weather = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const returnFocus = () => weather.current?.focus();
  useEffect(() => { if (selected) close.current?.focus(); }, [selected]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setSelected(false);
    };
    const escape = (event: KeyboardEvent) => {
      // Escape belongs to the focused panel, not a neighbouring HUD drawer.
      if (event.key !== 'Escape' || event.defaultPrevented || !(event.target instanceof Node) || !root.current?.contains(event.target)) return;
      if (selected) { returnFocus(); setSelected(false); }
      else { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open, selected]);
  const labels = ru ? ['Рыбалка', 'Шахты', 'Фермы', 'Ход героя', 'Ход корабля'] : ['Fishing', 'Mines', 'Farms', 'Hero travel', 'Ship travel'];
  const factors = [coefs.fish, coefs.mine, coefs.farm, coefs.step, coefs.ship];
  const number = (n: number) => n.toLocaleString(ru ? 'ru-RU' : 'en-US', {maximumFractionDigits:2});
  const values = factors.map((n,i) => n===1 ? (ru?'Стандарт':'Standard') : i===0 ? (n===0 ? (ru?'Не клюёт':'No bites') : (ru?'Шанс ×':'Chance ×')+number(n)) : i<3 ? n===0 ? (ru?'Не работают':'Not working') : (ru?'Добыча ':'Yield ')+(n<1?'−'+number(Math.round((1-n)*10000)/100)+'%':'×'+number(n)) : (ru?'Стоимость ×':'Cost ×')+number(n));
  const rowImages = [fish, pickaxe, wheat, hero, ship];
  return <div ref={root} className="raid-weather" data-open={open} data-admin={isAdmin} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
    <div className="raid-weather__drawer">
      <div className="raid-weather__glass" style={{ clipPath: `path("${shape}")` }} />
      <svg className="raid-weather__outline" viewBox="0 0 72 48" aria-hidden="true"><path d={shape} /></svg>
      <div className="raid-weather__contents" inert={!open} aria-hidden={!open}>
        <button ref={weather} type="button" aria-label={(ru ? 'Погода: ' : 'Weather: ') + (worldName ? worldName + ', ' : '') + weatherNames[weatherIndex] + ', ' + degreeText} aria-expanded={!!selected} aria-controls={detailsId} onClick={() => setSelected(!selected)} className={selected ? 'is-selected' : ''}>
          <span className="raid-weather__art" style={{ backgroundImage: `url(${atlas})`, backgroundSize: '300% 300%', backgroundPosition: `${weatherIndex % 3 * 50}% ${Math.floor(weatherIndex / 3) * 50}%` }} />
          <strong>{degreeText}</strong>
        </button>
      </div>
      <button ref={trigger} type="button" className="raid-weather__handle" aria-label={open ? (ru ? 'Свернуть погоду' : 'Collapse weather') : (ru ? 'Показать погоду' : 'Show weather')} aria-expanded={open} onClick={() => { setOpen(!open); setSelected(false); }}>{open ? <ChevronLeft /> : <ChevronRight />}</button>
    </div>
    {open && selected && <section id={detailsId} className="raid-weather__details" role="region" aria-labelledby={titleId}>
      <header><h2 id={titleId}>{(worldName ? worldName + ' · ' : '') + weatherNames[weatherIndex] + ' · ' + degreeText}</h2><button ref={close} type="button" aria-label={ru ? 'Закрыть влияние' : 'Close effects'} onClick={() => { returnFocus(); setSelected(false); }}><X /></button></header>
      {/* Scrolls only on very short screens; the frame itself never scrolls (weather.css). */}
      <div className="raid-weather__body">
        <p>{effectsOn ? (ru ? 'Общее влияние' : 'Combined effects') : (ru ? 'Влияние отключено' : 'Effects disabled')}</p>
        <ul>{labels.map((label, i) => <li key={label}><img src={rowImages[i]} alt="" /><span>{label}</span><span>{values[i]}</span></li>)}</ul>
      </div>
    </section>}
  </div>;
}

