// «Расширить мир» (владелец, 07.11.2026: «расширить границы мира с 64×64 до
// 128; 256; 512 — без смены мира, созданное никуда не пропадает»). Кнопки —
// только размеры больше нынешнего; второй тап по выбранному — подтверждение
// (расширение не отменить). Автор мира и админ.
import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { growSizes } from "@/lib/raid/creator/ids";
import { useCreatorExpand } from "./useCreator";

export function CreatorExpand({ mapId, size }: { mapId: string; size: number }) {
  const t = useT();
  const grow = useCreatorExpand();
  const [pick, setPick] = useState<number | null>(null);
  const sizes = growSizes(size);
  if (sizes.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
        {t("creator.grow")} · {t("creator.size", { n: size })}
      </p>
      <div className="flex gap-1.5">
        {sizes.map((n) => (
          <button
            key={n}
            type="button"
            disabled={grow.isPending}
            aria-pressed={pick === n}
            className={cn(
              "min-h-11 flex-1 rounded-xl border text-xs font-semibold disabled:opacity-40",
              pick === n ? "border-gold bg-gold/15 text-gold" : "border-border",
            )}
            onClick={() => {
              if (pick !== n) return setPick(n);
              grow.mutate(
                { mapId, size: n as 128 | 256 | 512 },
                { onSettled: () => setPick(null) },
              );
            }}
          >
            {pick === n ? `✓ ${t("creator.size", { n })}` : t("creator.size", { n })}
          </button>
        ))}
      </div>
    </div>
  );
}
