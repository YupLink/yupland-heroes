// Раздел панели автораздачи: галочка «участвует», сводка одной строкой и
// раскрывающиеся настройки.
//
// Разделы настраиваются ПО ОТДЕЛЬНОСТИ — боссов раскидывают одними числами,
// монетки другими. Поэтому у каждого своя галочка включения и своя «снять
// убитых»: выключенный раздел сервер не трогает вовсе, а включённый без
// «снять» только досыпает новых поверх старых.
//
// Свёрнутые разделы — не украшение: на 360 px четыре развёрнутых блока дают
// экран прокрутки, в котором не видно ни одной кнопки действия.
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CheckRow } from "./ScatterFields";

export function ScatterSection({
  title,
  summary,
  enabled,
  onEnabled,
  removeKilled,
  onRemoveKilled,
  removeHint,
  children,
}: {
  title: string;
  /** Короткая сводка настроек — видна, когда раздел свёрнут. */
  summary: string;
  enabled: boolean;
  onEnabled: (next: boolean) => void;
  removeKilled: boolean;
  onRemoveKilled: (next: boolean) => void;
  /** Чем именно грозит «снять убитых» в этом разделе. */
  removeHint: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "rounded-xl border transition",
        enabled ? "border-gold/40 bg-gold/[0.04]" : "border-border",
      )}
    >
      <div className="flex items-center gap-2 p-2">
        {/* Галочка и раскрытие — РАЗНЫЕ цели нажатия: включать раздел, не
            открывая его, приходится чаще, чем кажется (набрал числа, свернул,
            включил ещё один). */}
        <button
          type="button"
          onClick={() => {
            const next = !enabled;
            onEnabled(next);
            if (next) setOpen(true);
          }}
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-md border text-[13px] font-bold",
            enabled ? "border-gold bg-gold/15 text-gold" : "border-border text-transparent",
          )}
          aria-label={enabled ? `Выключить: ${title}` : `Включить: ${title}`}
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold">{title}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{summary}</span>
          </span>
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      </div>

      {open && (
        <div className="space-y-2 border-t border-border/60 p-2">
          <CheckRow
            on={removeKilled}
            onToggle={() => onRemoveKilled(!removeKilled)}
            label="Снять убитых"
            hint={removeHint}
          />
          {children}
        </div>
      )}
    </div>
  );
}
