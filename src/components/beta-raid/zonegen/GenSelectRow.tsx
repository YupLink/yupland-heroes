// Строка «как выделяем зону»: кисть или прямоугольник по двум углам.
//
// Живёт в шапке панели генератора и видна с первой секунды, как только админ
// взял кисть «Биом» — иначе прямоугольник было бы негде включить: панель
// раньше появлялась только после первой выделенной клетки.
import { Paintbrush, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { ZONE_MAX_CELLS, type ZoneCell } from "@/lib/raid/zonegen/recipe";
import type { GenSelectMode } from "./useGenSelection";

export function GenSelectRow({
  mode,
  onMode,
  corner,
  tooBig,
}: {
  mode: GenSelectMode;
  onMode: (mode: GenSelectMode) => void;
  /** Первый угол прямоугольника, пока ждём второй тап. */
  corner: ZoneCell | null;
  /** Размер отклонённого прямоугольника (больше ZONE_MAX_CELLS) или null. */
  tooBig: number | null;
}) {
  const t = useT();
  const modes: Array<{ id: GenSelectMode; label: string; Icon: typeof Square }> = [
    { id: "brush", label: t("zonegen.sel_brush"), Icon: Paintbrush },
    { id: "rect", label: t("zonegen.sel_rect"), Icon: Square },
  ];
  const hint =
    mode === "rect"
      ? corner
        ? t("zonegen.rect_second", { q: corner.q, r: corner.r })
        : t("zonegen.rect_first")
      : t("zonegen.brush_hint");

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">
          {t("zonegen.sel_label")}
        </span>
        <div className="flex gap-0.5 rounded-lg bg-secondary/30 p-0.5">
          {modes.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onMode(id)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                mode === id ? "bg-gold/15 text-gold" : "text-muted-foreground",
              )}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className={cn("text-[10px]", tooBig ? "text-rose-300" : "text-muted-foreground")}>
        {tooBig ? t("zonegen.rect_too_big", { n: tooBig, max: ZONE_MAX_CELLS }) : hint}
      </p>
    </div>
  );
}
