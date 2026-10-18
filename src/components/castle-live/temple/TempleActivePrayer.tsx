import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TempleStat } from "@/lib/castleTemple";
import { StatGlyph, statName } from "./templeUi";

export type TemplePrayerCard = {
  id: string;
  startedAt: number;
  endsAt: number;
  bonuses: { stat: TempleStat; value: number }[];
};

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

export function TempleActivePrayer({ prayers, ru, onDismiss }: {
  prayers: TemplePrayerCard[];
  ru: boolean;
  onDismiss: (id: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const active = prayers[Math.min(index, Math.max(0, prayers.length - 1))];
  if (!active) return null;
  const remaining = Math.max(0, active.endsAt - now);
  const duration = Math.max(1, active.endsAt - active.startedAt);
  const progress = Math.min(100, Math.max(0, Math.round(100 * (1 - remaining / duration))));
  const page = (direction: -1 | 1) => setIndex(current => (current + direction + prayers.length) % prayers.length);
  return (
    <div className={`temple-live-active${prayers.length > 1 ? " has-pager" : ""}${remaining === 0 ? " is-complete" : ""}`}
      aria-label={ru ? "Текущий бонус молитвы" : "Current prayer bonus"}
      onTouchStart={event => { const touch = event.touches[0]; touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null; }}
      onTouchEnd={event => {
        const start = touchStart.current;
        const touch = event.changedTouches[0];
        touchStart.current = null;
        if (!start || !touch || prayers.length < 2) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) page(dx < 0 ? 1 : -1);
      }}>
      <div className="temple-live-yupik-scene">
        <img className="temple-live-yupik" src="/temple/praying-yupik-candles.webp" alt={ru ? "Юпик читает молитву" : "Yupik praying"} />
      </div>
      <div className="temple-live-active-body">
        <h3 aria-live="polite">{remaining > 0 ? (ru ? "Бонус действует" : "Bonus active") : (ru ? "Действие бонуса завершено" : "Bonus ended")}</h3>
        <div className="temple-live-active-stats">
          {active.bonuses.length === 0 && <span>{ru ? "Молитва завершена" : "Prayer complete"}</span>}
          {active.bonuses.map(bonus => <span key={bonus.stat}>
            <StatGlyph stat={bonus.stat} className="h-6 w-6" />
            {statName(bonus.stat, ru)} <b>+{bonus.value}</b>
          </span>)}
        </div>
        <div className="temple-live-timer">
          {remaining > 0 ? <span>{ru ? "Осталось" : "Remaining"} {clock(remaining)}</span> :
            <button type="button" className="temple-live-complete-action" onClick={() => onDismiss(active.id)}
              aria-label={ru ? "Завершить и закрыть бонус" : "Finish and close bonus"}>{ru ? "Завершить" : "Finish"}</button>}
          <span>{clock(duration)}</span>
        </div>
        {remaining > 0 && <div className="temple-live-track" role="progressbar" aria-label={ru ? "Время действия бонуса" : "Bonus time"}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>}
      </div>
      {prayers.length > 1 && <nav className="temple-live-pager" aria-label={ru ? "Переключить молитву" : "Switch prayer"}>
        <button type="button" onClick={() => page(-1)} aria-label={ru ? "Предыдущая молитва" : "Previous prayer"}><ChevronLeft size={20} /></button>
        <button type="button" onClick={() => page(1)} aria-label={ru ? "Следующая молитва" : "Next prayer"}><ChevronRight size={20} /></button>
      </nav>}
    </div>
  );
}
