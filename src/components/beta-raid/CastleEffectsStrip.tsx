// Presentation only: the host passes getBetaRaidState().effects.
import { useEffect, useId, useMemo, useState } from "react";
import { ArrowDown, ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n";
import { buildEffectGroups, type HudSlow } from "./effectGroups";
import { effectMeta } from "./effectMeta";
import "./castle-effects-strip.css";

export type CastleActiveEffects = {
  slow?: HudSlow;
  chips?: unknown;
  weaken?: unknown;
  buff?: unknown;
};

export function effectCountdown(expiresAt: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  if (!Number.isFinite(seconds)) return "—";
  const minutes = Math.floor(seconds / 60);
  const pair = (n: number) => String(n).padStart(2, "0");
  return minutes < 60
    ? `${pair(minutes)}:${pair(seconds % 60)}`
    : `${Math.floor(minutes / 60)}:${pair(minutes % 60)}:${pair(seconds % 60)}`;
}

export function CastleEffectsStrip({
  effects,
  lang,
  status = "ready",
  onRetry,
  iconArt,
}: {
  effects?: CastleActiveEffects | null;
  lang: "ru" | "en";
  status?: "ready" | "loading" | "error";
  onRetry?: () => void;
  iconArt?: string;
}) {
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  // A server render cannot know the client's clock. Mount before showing timers.
  const [now, setNow] = useState(0);
  // Секундный отсчёт — только пока есть эффекты (14.10.2026: тикал всегда, на
  // карте и в замке — лишние перерисовки в покое).
  const live = !!effects && Object.values(effects).some((v) => (Array.isArray(v) ? v.length > 0 : v != null));
  useEffect(() => {
    setNow(Date.now());
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);

  const groups = useMemo(() => buildEffectGroups({
    chips: effects?.chips,
    slow: effects?.slow ?? null,
    weaken: effects?.weaken,
    buff: effects?.buff,
    now,
  }).filter((group) => Number.isFinite(Date.parse(group.until)) && Date.parse(group.until) > now), [effects, now]);
  const ready = status === "ready" && now > 0;
  const visible = ready ? groups : [];
  const label = lang === "ru" ? "Активные эффекты" : "Active effects";

  if (visible.length === 0) return null;
  if (status === "loading" || !now) return null;

  return (
    <div className="castle-main-hud__effects-shell" onKeyDown={(event) => {
      if (event.key !== "Escape" || !open) return;
      if (selected !== null) setSelected(null);
      else setOpen(false);
      event.stopPropagation();
    }}>
      <button
        type="button"
        className={`castle-main-hud__effects-toggle${iconArt ? " castle-main-hud__effects-toggle--icon" : ""}`}
        aria-label={`${label} · ${ready ? visible.length : "…"}`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((value) => !value)}
      >
        {iconArt ? <><img src={iconArt} alt="" draggable={false} /><span className="raid-effects-icon-count">{ready ? visible.length : "…"}</span></> : <span className="castle-main-hud__effects-pill"><span>{label} · {ready ? visible.length : "…"}</span>
        <ChevronDown aria-hidden="true" /></span>}
      </button>
      <div id={`${id}-panel`} className="castle-main-hud__effects-panel" role="region" aria-label={label} hidden={!open}>
          {status === "error" ? (
            <div className="castle-main-hud__effects-status" role="status">
              <span>{lang === "ru" ? "Эффекты временно недоступны" : "Effects are temporarily unavailable"}</span>
              {onRetry && <button type="button" onClick={onRetry}>{lang === "ru" ? "Повторить" : "Retry"}</button>}
            </div>
          ) : !ready ? (
            <div className="castle-main-hud__effects-status" role="status">
              {lang === "ru" ? "Загрузка эффектов…" : "Loading effects…"}
            </div>
          ) : visible.length === 0 ? (
            <div className="castle-main-hud__effects-status" role="status">
              {lang === "ru" ? "Нет активных эффектов" : "No active effects"}
            </div>
          ) : visible.map((group, index) => {
            const meta = effectMeta(group.key, t);
            const weak = group.key.startsWith("weak_");
            const slow = group.key === "slow";
            const shortLabel = meta.label.replace(/^(Буст|Boost|Ослабление|Weaken|Weakening):\s*/i, "");
            const name = shortLabel.charAt(0).toLocaleUpperCase(lang) + shortLabel.slice(1);
            const amount = slow && group.badge
              ? `${group.badge}${lang === "ru" ? " эн./шаг" : " energy/step"}`
              : group.badge;
            const rowId = `${group.key}-${index}`;
            const detailId = `${id}-detail-${index}`;
            const expanded = selected === rowId;
            return (
              <div className="castle-main-hud__effect-entry" key={rowId}>
                <button
                  type="button"
                  className="castle-main-hud__effect"
                  aria-expanded={expanded}
                  aria-controls={detailId}
                  onClick={() => setSelected(expanded ? null : rowId)}
                >
                  <meta.Icon className="castle-main-hud__effect-icon" color={meta.color} aria-hidden="true" />
                  {weak && <ArrowDown className="castle-main-hud__effect-arrow" aria-hidden="true" />}
                  <span className="castle-main-hud__effect-name">{name}</span>
                  {amount && <strong className="castle-main-hud__effect-amount">{amount}</strong>}
                  <time dateTime={group.until}>{effectCountdown(group.until, now)}</time>
                  <ChevronDown className="castle-main-hud__effect-chevron" aria-hidden="true" />
                </button>
                  <div id={detailId} className="castle-main-hud__effect-detail" hidden={!expanded}>
                    {group.items.length > 0 ? group.items.map((item, itemIndex) => (
                      <div className="castle-main-hud__effect-target" key={`${item.chipId}-${itemIndex}`}>
                        <span className="castle-main-hud__effect-chip">{item.name || (lang === "ru" ? "Фишка" : "Chip")}</span>
                        <time dateTime={item.expiresAt}>{effectCountdown(item.expiresAt, now)}</time>
                        {item.source && <span className="castle-main-hud__effect-source">{lang === "ru" ? "Источник:" : "Source:"} {item.source}</span>}
                      </div>
                    )) : (
                      <div className="castle-main-hud__effect-target">
                        <span className="castle-main-hud__effect-chip">{lang === "ru" ? "Герой" : "Hero"}</span>
                        {group.source && <span className="castle-main-hud__effect-source">{lang === "ru" ? "Источник:" : "Source:"} {group.source}</span>}
                      </div>
                    )}
                  </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
