import { ChipImage } from "@/components/ChipImage";
import { labelForLevel } from "@/components/chips/levelLabel";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Sparkles, Box } from "lucide-react";

import { thumb } from "@/lib/image";
type RevealItem = {
  templateName: string;
  level: number;
  imageUrl: string | null;
};

export function PackRevealModal({
  items,
  title,
  onClose,
}: {
  items: RevealItem[];
  title?: string;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative mx-auto max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl border border-gold/40 bg-card/95 p-5 shadow-gold backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-gold/80">
            {title ?? t("chips.congrats")}
          </div>
          <h2 className="mt-1 font-display text-2xl font-bold">
            {t("chips.dropped_pre")} <span className="text-gradient-gold">{items.length}</span>{" "}
            {t("chips.dropped_post")}
          </h2>
        </div>

        <div
          className={cn(
            "grid gap-2",
            items.length === 1
              ? "grid-cols-1"
              : items.length <= 3
                ? "grid-cols-3"
                : items.length <= 8
                  ? "grid-cols-4"
                  : "grid-cols-5",
          )}
        >
          {items.map((it, i) => (
            <RevealCard key={i} item={it} index={i} />
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl gradient-gold px-5 py-3 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02]"
        >
          <Sparkles className="h-4 w-4" />
          {t("chips.take_to_inventory")}
        </button>
      </div>
    </div>
  );
}

function RevealCard({ item, index }: { item: RevealItem; index: number }) {
  const tone =
    item.level >= 4
      ? "border-amber-300/70 shadow-[0_0_24px_rgba(255,184,0,0.45)]"
      : item.level >= 3
        ? "border-gold/60 shadow-[0_0_18px_rgba(255,184,0,0.30)]"
        : item.level >= 2
          ? "border-neon/40 shadow-[0_0_12px_rgba(56,189,248,0.25)]"
          : "border-border";
  return (
    <div
      className={cn("animate-float-up overflow-hidden rounded-2xl border bg-card/90", tone)}
      style={{ animationDelay: `${index * 90}ms` }}
    >
      {item.imageUrl ? (
        <ChipImage
          src={thumb(item.imageUrl, 400)}
          level={item.level}
          alt={item.templateName}
          className="w-full"
        />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-secondary text-muted-foreground">
          <Box className="h-8 w-8" />
        </div>
      )}
      <div className="p-1.5 text-center">
        <div className="truncate text-[11px] font-semibold">{item.templateName}</div>
        <div className="text-[10px] font-mono text-gold">{labelForLevel(item.level)}</div>
      </div>
    </div>
  );
}
