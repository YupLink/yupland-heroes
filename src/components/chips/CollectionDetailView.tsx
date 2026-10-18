import { Loader2, ArrowLeft, FolderHeart } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ChipImage } from "@/components/ChipImage";
import { labelForLevel } from "@/components/chips/levelLabel";
import { useT } from "@/lib/i18n";
import { getChipCollectionDetail } from "@/server/api/chips-stake";

function fmtBurnedPct(p: number): string {
  const n = Number(p) || 0;
  if (n <= 0) return "0%";
  if (n >= 1) return `${Math.round(n)}%`;
  return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
}

function TemplateTile({
  template,
  onClick,
}: {
  template: {
    id: string;
    templateNo: number;
    name: string;
    imageUrl: string;
    ownedCount: number;
    maxLevel: number;
  };
  onClick: () => void;
}) {
  const t = useT();
  const hasAny = template.ownedCount > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border bg-card/80 p-1.5 transition ${
        hasAny
          ? "border-border hover:border-gold/40"
          : "border-border/40 opacity-60 hover:opacity-100"
      }`}
    >
      <div className="relative">
        <ChipImage
          src={template.imageUrl}
          level={hasAny ? template.maxLevel : 1}
          alt={template.name}
          className="w-full"
          hideStars={!hasAny}
        />
        <span className="absolute left-1 top-1 inline-flex items-center justify-center rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-bold text-foreground/90 backdrop-blur">
          #{template.templateNo}
        </span>
        {hasAny && (
          <span className="absolute right-1 top-1 inline-flex items-center justify-center rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-bold text-gold backdrop-blur">
            ×{template.ownedCount}
          </span>
        )}
      </div>
      <div className="mt-1 text-center">
        <div className="truncate text-[10px] font-medium">{template.name}</div>
        <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
          {hasAny ? labelForLevel(template.maxLevel) : t("chips.not_in_collection")}
        </div>
      </div>
    </button>
  );
}

function CollectionDetailView({
  collectionId,
  onBack,
  onOpenTemplate,
}: {
  collectionId: string;
  onBack: () => void;
  onOpenTemplate: (templateId: string) => void;
}) {
  const t = useT();
  const q = useQuery({
    queryKey: ["chip-collection-detail", collectionId],
    queryFn: () => getChipCollectionDetail({ data: { collectionId } }),
  });
  if (q.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!q.data) return null;
  const c = q.data;
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        {t("chips.all_collections_short")}
      </button>

      <div className="flex items-center gap-3 rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 to-transparent p-3">
        {c.coverImageUrl ? (
          <img
            src={c.coverImageUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full border border-gold/40 object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-secondary text-gold">
            <FolderHeart className="h-6 w-6" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-bold">{c.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {t("chips.minted_of", {
              minted: c.mintedCount.toLocaleString("ru-RU"),
              total: c.initialSupply.toLocaleString("ru-RU"),
            })}
            {(c.burnedCount ?? 0) > 0 && (
              <>
                {" · 🔥 "}
                {(c.burnedCount ?? 0).toLocaleString("ru-RU")} ({fmtBurnedPct(c.burnedPercent ?? 0)}
                )
              </>
            )}
          </div>
        </div>
      </div>

      {c.templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-6 text-center text-sm text-muted-foreground">
          {t("chips.no_templates_yet")}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {c.templates.map((tpl) => (
            <TemplateTile key={tpl.id} template={tpl} onClick={() => onOpenTemplate(tpl.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

export { CollectionDetailView, TemplateTile };
