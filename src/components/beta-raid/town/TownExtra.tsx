// Ратуша в окне постройки (владелец, 03.10.2026): игрок видит только справку —
// жителей и что они едят за сутки; настройки ратуши — админу, кнопкой отсюда же.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { getSession } from "@/server/api/user-auth";
import { marketResourceIconSrc } from "@/lib/resourceIcons";
import type { TownEatLine, TownHallExtra } from "@/lib/townHallView";
import { numText } from "../market/num";
import { TownAdminPanel } from "./TownAdminPanel";

export function TownExtra({ q, r, extra }: { q: number; r: number; extra: TownHallExtra }) {
  return <TownHallInfo q={q} r={r} extra={extra} />;
}

function TownHallInfo({ q, r, extra }: { q: number; r: number; extra: TownHallExtra }) {
  const t = useT();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const [settings, setSettings] = useState(false);
  // Снимок окна мог лечь в суточный кэш до этой правки — поля читаем терпимо.
  const eats = Array.isArray(extra.eats) ? extra.eats : [];
  const name = typeof extra.name === "string" ? extra.name.trim() : "";
  return (
    <div className="space-y-2 rounded-2xl border border-border/60 bg-secondary/20 p-3">
      {/* Название города — то, что админ вписал в пульт ратуши. */}
      {name && (
        <div className="truncate text-center font-display text-base font-bold text-gold">
          {name}
        </div>
      )}
      {extra.starving && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-xs font-bold text-destructive">
          {t("town.starving_badge")}
        </div>
      )}
      <div className="text-center text-sm font-semibold">
        {t("town.residents", { n: numText(Number(extra.residents) || 0) })}
      </div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("town.eats_title")}
      </div>
      {eats.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground">{t("town.eats_none")}</p>
      ) : (
        <ul className="space-y-1">
          {eats.map((e, i) => (
            <EatRow key={`${e.kind}:${e.refId ?? ""}:${i}`} e={e} />
          ))}
        </ul>
      )}
      {extra.starving && (
        <p className="text-center text-[11px] text-muted-foreground">{t("town.starving_hint")}</p>
      )}
      {session.data?.isAdmin && (
        <button
          type="button"
          onClick={() => setSettings(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-gold/50 bg-gold/10 py-2 text-xs font-bold text-gold"
        >
          <Settings2 className="h-3.5 w-3.5" />
          {t("town.settings")}
        </button>
      )}
      {settings && <TownAdminPanel q={q} r={r} onClose={() => setSettings(false)} />}
    </div>
  );
}

function EatRow({ e }: { e: TownEatLine }) {
  const t = useT();
  const resIcon = e.kind === "resource" ? marketResourceIconSrc(e.refId) : null;
  const icon = e.image ?? resIcon;
  const label =
    e.name ??
    (e.kind === "resource"
      ? e.refId === "token"
        ? (e.token ?? "token")
        : t(`market.res.${e.refId ?? "gold"}`)
      : (e.refId ?? e.kind));
  return (
    <li className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/40 px-2 py-1.5">
      {icon ? (
        <img
          src={icon}
          alt=""
          className={`h-7 w-7 shrink-0 object-contain ${!e.image && resIcon ? "[image-rendering:pixelated]" : ""}`}
        />
      ) : (
        <div className="h-7 w-7 shrink-0 rounded-lg bg-secondary" />
      )}
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <span
        className={`shrink-0 text-xs tabular-nums ${e.short ? "font-bold text-destructive" : "text-muted-foreground"}`}
      >
        {t("town.per_day", { n: numText(e.perDay) })}
        {e.short ? ` · ${t("town.short")}` : ""}
      </span>
    </li>
  );
}
