// Ряд размеров кисти режима бога.
//
// Вынесено из AdminBrushBar (правило ≤250 строк). Два ряда: обычный 1–5 для
// краски и ластика, и крупный для биом-выделения — зону под генератор набирают
// радиусом 10–20 (радиус 20 = 1141 клетка за тап). Краске и ластику такие
// радиусы не достаются: хук режет их до AREA_MAX.
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { isGenBrush } from "./brushPatch";
import type { Brush } from "./useAdminBrush";
import type { AdminMode } from "./useAdminLive";

/** Размеры кисти для god-mode. 1 — одна клетка, дальше гексагональная область. */
const BRUSH_SIZES = [1, 2, 3, 4, 5];
const GEN_SIZES = [1, 3, 5, 10, 20];

export function AdminBrushSizes({
  brush,
  mode,
  size,
  onSize,
  label,
}: {
  brush: Brush;
  mode: AdminMode;
  size: number;
  onSize: (size: number) => void;
  label: string;
}) {
  const sizes = mode === "paint" && isGenBrush(brush) ? GEN_SIZES : BRUSH_SIZES;
  // Сменили кисть/режим, а радиуса в новом ряду нет (20 после выделения, 4 у
  // выделения) — возвращаемся к одной клетке, чтобы подсветка не пропадала.
  useEffect(() => {
    if (!sizes.includes(size)) onSize(1);
  }, [sizes, size, onSize]);

  return (
    <div className="flex shrink-0 items-center gap-1">
      <span className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</span>
      {sizes.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSize(s)}
          className={cn(
            "h-6 w-6 rounded-lg text-[11px] font-bold tabular-nums",
            size === s ? "bg-gold/15 text-gold" : "bg-secondary/40 text-muted-foreground",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
