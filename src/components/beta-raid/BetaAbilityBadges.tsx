// Чем грозит цель — компактный ряд значков (как на артефакте).
//
// Раньше на экране была только иконка и процент, а что она делает — узнавали
// тапом. Игроки жаловались, что эффекты боссов непонятны, поэтому подпись
// («Яд», «Оглушение») стоит рядом с шансом, а сила и длительность — строкой
// под рядом, все сразу.
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { effectDetail, effectMeta } from "./effectMeta";

export type AbilityView = {
  kind: string;
  chance: number;
  value?: string | number;
  duration?: string | number;
};

export function BetaAbilityBadges({ abilities }: { abilities: AbilityView[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const t = useT();
  if (abilities.length === 0) return null;
  const active = abilities.find((a) => a.kind === open) ?? null;

  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t("braid.dangers")}
        </span>
        {abilities.map((a) => {
          const { Icon, color, label } = effectMeta(a.kind, t);
          const on = open === a.kind;
          return (
            <button
              key={a.kind}
              type="button"
              onClick={() => setOpen(on ? null : a.kind)}
              aria-label={label}
              aria-pressed={on}
              className={
                "inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] font-bold tabular-nums transition active:scale-95 " +
                (on ? "border-current bg-foreground/10" : "border-transparent bg-secondary/50")
              }
              style={{ color }}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="truncate">{label}</span>
              {a.chance}%
            </button>
          );
        })}
      </div>

      {/* Что именно сделает каждый эффект — без тапа: до этого игрок видел
          проценты и не понимал, чем ему грозит бой. Нажатие оставили: оно
          подсвечивает строку нужного эффекта. */}
      <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
        {abilities.map((a) => {
          const meta = effectMeta(a.kind, t);
          return (
            <div
              key={`d-${a.kind}`}
              className={
                "flex items-baseline gap-2 rounded-lg px-1 " +
                (active?.kind === a.kind ? "bg-foreground/5" : "")
              }
            >
              <b style={{ color: meta.color }}>{meta.label}</b>
              <span className="min-w-0 flex-1 text-muted-foreground">{effectDetail(a, t)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
