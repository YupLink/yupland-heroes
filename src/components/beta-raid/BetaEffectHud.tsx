// Что висит на игроке и его фишках прямо сейчас — над иконкой героя.
//
// Яд и оглушение живут на КОНКРЕТНЫХ фишках, поэтому сворачиваем их в один
// значок с «×N»; тап разворачивает список фишек с личными таймерами.
// Замедление — на игроке, у него вместо счётчика надбавка к шагу.
//
// Сборка групп — в effectGroups.ts (чистая функция, под тест).
//
// Над эффектами — плашки «Сломан: <имя>» (ArtBreakNotice, §8.63 п.3): «там, где
// дебафы». Они живут и без единого эффекта — колонка рисуется всегда.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useOblivion } from "@/lib/hooks/useOblivion";
import { effectMeta, untilLabel } from "./effectMeta";
import { buildEffectGroups, type EffectGroup, type HudSlow } from "./effectGroups";
import { ArtBreakNotices } from "./ArtBreakNotice";
import { ShipBlastNotice } from "./dynamite/ShipBlastNotice";

/** Колонка над героем: снизу вверх — значок эффектов, список, плашки поломки. */
const COLUMN = "absolute bottom-24 left-2 flex flex-col items-start gap-1";

export type { HudBuff, HudChipEffect, HudSlow, HudSlowRow, HudWeaken } from "./effectGroups";

export function BetaEffectHud({
  chips: chipsRaw,
  slow,
  weaken: weakenRaw,
  buff: buffRaw,
}: {
  chips?: unknown;
  slow: HudSlow;
  /** Старый ответ из кэша поля не знает — значков ослабления просто не будет. */
  weaken?: unknown;
  /** Бусты: то же поле, только со знаком «+». */
  buff?: unknown;
}) {
  const t = useT();
  // Часы стартуют только на клиенте: на SSR время расходится и ломает гидрацию.
  const [now, setNow] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Забвение живёт своим запросом (useOblivion): его видит и книга героя.
  const { level, until, timedLevel, timedUntil } = useOblivion();
  const groups = useMemo<EffectGroup[]>(
    () =>
      buildEffectGroups({
        chips: chipsRaw,
        slow,
        weaken: weakenRaw,
        buff: buffRaw,
        oblivion: { level, until, timedLevel, timedUntil },
        now,
      }),
    [chipsRaw, slow, weakenRaw, buffRaw, level, until, timedLevel, timedUntil, now],
  );

  const [expanded, setExpanded] = useState(false);
  // Появился НОВЫЙ вид эффекта — раскрываем список сами: раньше свежий дебафф
  // прятался за счётчиком «⚡ N», и игрок писал «новые дебафы не отображаются».
  // Сравниваем по строке ключей, а не по массиву: группы пересобираются каждую
  // секунду, и по ссылке панель раскрывалась бы на каждый тик — не свернуть.
  const keys = groups.map((g) => g.key).join("|");
  const ready = now > 0;
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    const prev = seen.current;
    seen.current = keys;
    if (prev === null || keys === prev) return;
    const had = new Set(prev.split("|"));
    if (keys.split("|").some((k) => k && !had.has(k))) setExpanded(true);
  }, [keys, ready]);

  if (now === 0 || groups.length === 0) {
    return (
      <div className={COLUMN}>
        <ArtBreakNotices />
        <ShipBlastNotice />
      </div>
    );
  }
  const detail = groups.find((g) => g.key === open) ?? null;
  // Панель сложена: значок «эффекты · N». Тап раскрывает вертикальный
  // список. При одном эффекте раскрывать нечего — показываем плоскую
  // кнопку как раньше.
  const collapsed = groups.length > 1;

  return (
    <div className={COLUMN}>
      <ArtBreakNotices />
      <ShipBlastNotice />
      {detail && (
        <div className="max-w-[62vw] rounded-xl border border-border bg-black/85 px-2.5 py-1.5 text-[11px] backdrop-blur-sm">
          {detail.items.length === 0 && (
            <div className="py-0.5">
              <b style={{ color: effectMeta(detail.key, t).color }}>
                {effectMeta(detail.key, t).label}
              </b>
              {detail.source && (
                <span className="ml-1 text-muted-foreground">
                  {t("braid.effect_from", { name: detail.source })}
                </span>
              )}
            </div>
          )}
          {detail.items.map((c) => (
            <div key={c.chipId} className="flex items-center justify-between gap-4 py-0.5">
              <span className="truncate">
                {c.name ?? t("braid.chip")}{" "}
                <span className="text-muted-foreground">{c.level} lvl</span>
                {c.source && (
                  <span className="text-muted-foreground">
                    {" · "}
                    {t("braid.effect_from", { name: c.source })}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {untilLabel(c.expiresAt, now, t)}
              </span>
            </div>
          ))}
        </div>
      )}

      {collapsed && expanded && (
        <div className="max-h-[136px] w-max min-w-[8rem] max-w-[62vw] overflow-y-auto overscroll-contain rounded-xl border border-border bg-black/80 py-1 backdrop-blur-sm">
          {groups.map((g) => (
            <EffectRow
              key={g.key}
              g={g}
              now={now}
              t={t}
              onOpen={() => setOpen(open === g.key ? null : g.key)}
            />
          ))}
        </div>
      )}

      {collapsed ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={t("braid.effects_summary", { n: groups.length })}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-black/70 px-2 text-[11px] font-bold tabular-nums backdrop-blur-sm transition active:scale-95"
        >
          <span className="text-gold">⚡ {groups.length}</span>
          <span className="text-muted-foreground">{expanded ? "▾" : "▸"}</span>
        </button>
      ) : (
        <div className="flex items-center gap-1">
          {groups.map((g) => (
            <EffectRow
              key={g.key}
              g={g}
              now={now}
              t={t}
              onOpen={() => setOpen(open === g.key ? null : g.key)}
              inline
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Одна строка/чип активного эффекта. inline — горизонтальная плитка для
 *  случая одного эффекта; иначе — строка выпадающего списка с подписью вида:
 *  щит с «−20» без слова «броня» игрок не читал как ослабление. */
function EffectRow({
  g,
  now,
  t,
  onOpen,
  inline,
}: {
  g: EffectGroup;
  now: number;
  t: ReturnType<typeof useT>;
  onOpen: () => void;
  inline?: boolean;
}) {
  const { Icon, color, label } = effectMeta(g.key, t);
  // Без срока (уровень забвения) таймера нет — только значок и «3 Lv».
  const left = g.until ? untilLabel(g.until, now, t) : "";
  const base = inline
    ? "inline-flex h-8 items-center gap-1 rounded-full border border-border bg-black/70 px-2"
    : "flex w-full items-center gap-2 px-2.5 py-1";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={left ? `${label}: ${left}` : label}
      className={`${base} text-[11px] font-bold tabular-nums backdrop-blur-sm transition active:scale-95`}
      style={{ color }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {g.key.startsWith("weak_") && <ArrowDown className="-ml-0.5 h-3 w-3 shrink-0" />}
      {g.badge && <span>{g.badge}</span>}
      {!inline && (
        <span className="max-w-[34vw] truncate font-medium text-foreground/80">{label}</span>
      )}
      <span className="ml-auto text-foreground/85">{left}</span>
    </button>
  );
}
